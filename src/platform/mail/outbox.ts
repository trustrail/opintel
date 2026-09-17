import { withPlatform, type Tx } from '../db/scope.js';
import type { JsonObject } from '../../shared/kernel/index.js';
import type { MailPort, OutboundMail } from './types.js';

type TransactionScope = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

type PendingMail = OutboundMail;

type PendingMailRow = {
  to: string;
  template: OutboundMail['template'];
  vars: JsonObject;
  idempotencyKey: string;
};

export type DispatchSummary = {
  sent: number;
  retained: number;
};

export class MailOutbox {
  constructor(private readonly inPlatformScope: TransactionScope = withPlatform) {}

  async enqueue(tx: Tx, message: OutboundMail): Promise<void> {
    await tx.query(
      `INSERT INTO mail_outbox (to_email, template, vars, idempotency_key)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [message.to, message.template, JSON.stringify(message.vars), message.idempotencyKey],
    );
  }

  async dispatchPending(mail: MailPort, batchSize = 100): Promise<DispatchSummary> {
    return this.inPlatformScope((tx) => this.dispatchInScope(tx, mail, batchSize));
  }

  async dispatchOne(mail: MailPort, idempotencyKey: string, transientVars: JsonObject): Promise<DispatchSummary> {
    return this.inPlatformScope((tx) => this.dispatchInScope(tx, mail, 1, idempotencyKey, transientVars));
  }

  private async dispatchInScope(
    tx: Tx,
    mail: MailPort,
    batchSize: number,
    idempotencyKey?: string,
    transientVars?: JsonObject,
  ): Promise<DispatchSummary> {
    const filter = idempotencyKey === undefined ? '' : 'AND idempotency_key = $2';
    const values = idempotencyKey === undefined ? [batchSize] : [batchSize, idempotencyKey];
    const messages = await tx.query<PendingMailRow>(
      `SELECT to_email AS "to", template, vars, idempotency_key AS "idempotencyKey"
       FROM mail_outbox
       WHERE dispatched_at IS NULL
       ${filter}
       ORDER BY created_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      values,
    );
    let sent = 0;
    let retained = 0;

    for (const message of messages) {
      const delivery = transientVars === undefined ? message : { ...message, vars: { ...message.vars, ...transientVars } };
      const receipt = await this.send(mail, delivery);
      if (receipt === undefined) {
        retained += 1;
        continue;
      }
      await tx.query(
        `UPDATE mail_outbox
         SET dispatched_at = $2, provider_id = $3
         WHERE idempotency_key = $1`,
        [message.idempotencyKey, receipt.acceptedAt, receipt.providerId],
      );
      sent += 1;
    }

    return { sent, retained };
  }

  private async send(mail: MailPort, message: PendingMail): Promise<{ providerId: string; acceptedAt: string } | undefined> {
    try {
      const result = await mail.send(message);
      return result.ok ? result.value : undefined;
    } catch {
      return undefined;
    }
  }
}
