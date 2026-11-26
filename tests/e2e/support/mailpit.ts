import { expect } from '@playwright/test';
import { MAILPIT_URL } from './env';

// Чтение писем через REST API Mailpit: https://mailpit.axllent.org/docs/api-v1/

interface MailpitAddress {
  Name: string;
  Address: string;
}

export interface MailpitSummary {
  ID: string;
  From: MailpitAddress;
  To: MailpitAddress[];
  Subject: string;
  Snippet: string;
  Created: string;
}

export interface MailpitMessage extends MailpitSummary {
  Text: string;
  HTML: string;
}

async function mailpit<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${MAILPIT_URL}${path}`, init);
  } catch (e) {
    throw new Error(
      `Mailpit недоступен по ${MAILPIT_URL}. Запустите: docker run -d --rm --name mailpit-e2e -p 1025:1025 -p 8025:8025 axllent/mailpit`,
      { cause: e },
    );
  }
  if (!res.ok) throw new Error(`Mailpit ${init?.method ?? 'GET'} ${path} → ${res.status}`);
  const body = await res.text();
  // DELETE /api/v1/messages отвечает текстом «ok», а не JSON
  try {
    return (body ? JSON.parse(body) : undefined) as T;
  } catch {
    return undefined as T;
  }
}

/** Удаляет все письма (DELETE /api/v1/messages). Вызывается перед тестами, которые читают почту. */
export async function clearMailbox(): Promise<void> {
  await mailpit<void>('/api/v1/messages', { method: 'DELETE' });
}

/** Список писем (новые первыми). */
export async function listMessages(limit = 200): Promise<MailpitSummary[]> {
  const data = await mailpit<{ messages: MailpitSummary[] }>(`/api/v1/messages?limit=${limit}`);
  return data.messages ?? [];
}

/** Полное письмо по ID (GET /api/v1/message/{ID}). */
export async function getMessage(id: string): Promise<MailpitMessage> {
  return mailpit<MailpitMessage>(`/api/v1/message/${encodeURIComponent(id)}`);
}

/** Письма, адресованные `to` (сравнение без учёта регистра). */
export async function messagesTo(to: string): Promise<MailpitSummary[]> {
  const addr = to.toLowerCase();
  return (await listMessages()).filter((m) => m.To.some((t) => t.Address.toLowerCase() === addr));
}

/** Текст письма: переводы строк приведены к \n. */
export function plainText(msg: MailpitMessage): string {
  return msg.Text.replace(/\r\n/g, '\n');
}

/**
 * Ждёт письмо на `to`, для которого `match` вернёт true (по умолчанию — любое), и возвращает его целиком.
 */
export async function waitForMessage(
  to: string,
  match: (msg: MailpitMessage) => boolean = () => true,
  timeout = 15_000,
): Promise<MailpitMessage> {
  let found: MailpitMessage | undefined;
  await expect
    .poll(
      async () => {
        for (const summary of await messagesTo(to)) {
          const msg = await getMessage(summary.ID);
          if (match(msg)) {
            found = msg;
            return true;
          }
        }
        return false;
      },
      { message: `письмо на ${to} не пришло в Mailpit`, timeout },
    )
    .toBe(true);
  return found!;
}

const MAGIC_LINK_RE = /(https?:\/\/[^\s"'<>]+)?\/auth\/magic\?token=([A-Za-z0-9_-]+)/;

/** Извлекает magic link из письма: полную ссылку (как в письме) и токен. */
export function extractMagicLink(msg: MailpitMessage): { url: string; token: string } {
  const m = MAGIC_LINK_RE.exec(plainText(msg)) ?? MAGIC_LINK_RE.exec(msg.HTML ?? '');
  if (!m) throw new Error(`В письме «${msg.Subject}» нет magic link:\n${msg.Text}`);
  return { url: m[0], token: m[2] };
}
