import { Inject, Injectable } from '@nestjs/common';
import { MAIL_TRANSPORT, MailMessage, MailTransport, MemoryTransport } from './mail-transport';

export type { MailMessage } from './mail-transport';

@Injectable()
export class MailService {
  constructor(@Inject(MAIL_TRANSPORT) private readonly transport: MailTransport) {}

  /** Отправленные письма при `mail: 'memory'`; для остальных режимов пусто. */
  get outbox(): MailMessage[] {
    return this.transport instanceof MemoryTransport ? this.transport.outbox : [];
  }

  send(msg: MailMessage): Promise<void> {
    return this.transport.send(msg);
  }
}
