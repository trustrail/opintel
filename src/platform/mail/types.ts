import type {
  DomainError,
  JsonObject,
  Result,
  Timestamp,
} from '../../shared/kernel/index.js';

export type OutboundMail = {
  to: string;
  template: 'magic_link' | 'invitation' | 'alert' | 'digest';
  vars: JsonObject;
  idempotencyKey: string;
};

export type MailReceipt = {
  providerId: string;
  acceptedAt: Timestamp;
};

export interface MailPort {
  send(message: OutboundMail): Promise<Result<MailReceipt, DomainError>>;
}
