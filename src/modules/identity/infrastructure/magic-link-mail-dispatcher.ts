import type { MagicLinkDispatchPort } from '../application/magic-link.js';
import { MailOutbox, type MailPort } from '../../../platform/mail/index.js';

export class OutboxMagicLinkDispatcher implements MagicLinkDispatchPort {
  constructor(
    private readonly outbox: MailOutbox,
    private readonly mail: MailPort,
  ) {}

  async dispatch(message: { tokenId: string; token: string }): Promise<void> {
    await this.outbox.dispatchOne(this.mail, `magic_link:${message.tokenId}`, { token: message.token });
  }
}
