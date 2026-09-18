import type { MagicLinkDispatchPort } from '../application/magic-link.js';
import { MailOutbox, type MailPort } from '../../../platform/mail/index.js';
import { DomainError } from '../../../shared/kernel/index.js';

export class OutboxMagicLinkDispatcher implements MagicLinkDispatchPort {
  constructor(
    private readonly outbox: MailOutbox,
    private readonly mail: MailPort,
  ) {}

  async dispatch(message: { tokenId: string; token: string }): Promise<void> {
    const outcome = await this.outbox.dispatchOne(this.mail, `magic_link:${message.tokenId}`, { token: message.token });
    if (outcome.retained > 0) throw new DomainError('dependency_unavailable', 'The email could not be sent. Try again.', undefined, true);
  }
}
