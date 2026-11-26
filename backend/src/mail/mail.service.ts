import { Inject, Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { APP_OPTIONS, AppOptions } from '../app.options';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class MailService {
  /** Отправленные письма при mail: 'memory'. */
  readonly outbox: MailMessage[] = [];
  private transporter?: Transporter;

  constructor(@Inject(APP_OPTIONS) private readonly options: AppOptions) {}

  async send(msg: MailMessage): Promise<void> {
    switch (this.options.mail) {
      case 'memory':
        this.outbox.push({ ...msg });
        return;
      case 'failing':
        throw new Error('SMTP unavailable');
      case 'smtp':
        await this.getTransporter().sendMail({
          from: process.env.SMTP_FROM || 'Clinic <noreply@clinic.local>',
          to: msg.to,
          subject: msg.subject,
          text: msg.text,
        });
        return;
    }
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const user = process.env.SMTP_USER;
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: Number(process.env.SMTP_PORT || 1025),
        secure: process.env.SMTP_SECURE === 'true',
        auth: user ? { user, pass: process.env.SMTP_PASS ?? '' } : undefined,
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 5000,
      });
    }
    return this.transporter;
  }
}
