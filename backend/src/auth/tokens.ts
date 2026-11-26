import { createHash, randomBytes } from 'node:crypto';

/** 32 случайных байта в base64url (43 символа) — токен magic link и сессии (data-model.md, 2.3–2.4). */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256(token) в hex — то, что хранится в БД. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
