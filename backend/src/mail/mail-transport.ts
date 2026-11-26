import nodemailer, { Transporter } from 'nodemailer';
import type { MailMode, ResolvedAppOptions, SmtpOptions } from '../app.options';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Способ доставки письма (Strategy): конкретная реализация выбирается по `AppOptions.mail`. */
export interface MailTransport {
  send(msg: MailMessage): Promise<void>;
}

/** DI-токен для `MailTransport`. */
export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT');

/** Письма копятся в `outbox` (API-тесты). */
export class MemoryTransport implements MailTransport {
  readonly outbox: MailMessage[] = [];

  send(msg: MailMessage): Promise<void> {
    this.outbox.push({ ...msg });
    return Promise.resolve();
  }
}

/** Всегда отклоняет отправку (проверка поведения при недоступном SMTP). */
export class FailingTransport implements MailTransport {
  send(): Promise<void> {
    return Promise.reject(new Error('SMTP unavailable'));
  }
}

/** Отправка через nodemailer; соединение создаётся при первой отправке. */
export class SmtpTransport implements MailTransport {
  private transporter?: Transporter;

  constructor(private readonly config: SmtpOptions) {}

  async send(msg: MailMessage): Promise<void> {
    await this.getTransporter().sendMail({ from: this.config.from, to: msg.to, subject: msg.subject, text: msg.text });
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const { host, port, secure, user, pass } = this.config;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass: pass ?? '' } : undefined,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
      });
    }
    return this.transporter;
  }
}

const TRANSPORTS: Record<MailMode, (options: ResolvedAppOptions) => MailTransport> = {
  memory: () => new MemoryTransport(),
  failing: () => new FailingTransport(),
  smtp: (options) => new SmtpTransport(options.smtp),
};

export function createMailTransport(options: ResolvedAppOptions): MailTransport {
  return TRANSPORTS[options.mail](options);
}
