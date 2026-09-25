import type { AuthorizationPort, RelationshipUpdate, AuthorizationRevision } from '../../authz/index.js';
import { withPlatform, type Tx } from '../../../platform/db/scope.js';
import { CompanyId, PoolId, UserId } from '../../../shared/kernel/index.js';

export type RelationshipOutboxTx = Tx;

export type RelationshipOutboxEntry = RelationshipUpdate & { readonly id: bigint };

type TransactionScope = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

type DispatchOutcome =
  | { readonly ok: true; readonly token: AuthorizationRevision | null }
  | { readonly ok: false; readonly error: unknown };

type Row = {
  id: string;
  operation: RelationshipUpdate['operation'];
  resource_type: RelationshipUpdate['resource']['type'];
  resource_id: string;
  relation: string;
  subject_type: RelationshipUpdate['subject']['type'];
  subject_id: string;
};

export class RelationshipOutbox {
  constructor(private readonly inPlatformScope: TransactionScope = withPlatform) {}

  async enqueue(tx: RelationshipOutboxTx, update: RelationshipUpdate): Promise<bigint> {
    const rows = await tx.query<{ id: string }>(
      `INSERT INTO relationship_outbox (operation, resource_type, resource_id, relation, subject_type, subject_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [update.operation, update.resource.type, update.resource.id, update.relation, update.subject.type, update.subject.id],
    );
    const row = rows[0];
    if (row === undefined) throw new Error('Relationship outbox entry was not created.');
    return BigInt(row.id);
  }

  async read(tx: RelationshipOutboxTx, id: bigint): Promise<RelationshipOutboxEntry | null> {
    const rows = await tx.query<Row>(
      `SELECT id, operation, resource_type, resource_id, relation, subject_type, subject_id
       FROM relationship_outbox
       WHERE id = $1 AND written_at IS NULL
       FOR UPDATE SKIP LOCKED`,
      [id.toString()],
    );
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: BigInt(row.id),
      operation: row.operation,
      resource: { type: row.resource_type, id: row.resource_id },
      relation: row.relation,
      subject: row.subject_type === 'company'
        ? { type: 'company', id: CompanyId(row.subject_id) }
        : row.subject_type === 'pool'
          ? { type: 'pool', id: PoolId(row.subject_id) }
          : { type: 'user', id: UserId(row.subject_id) },
    };
  }

  async markWritten(tx: RelationshipOutboxTx, id: bigint, token: AuthorizationRevision): Promise<void> {
    await tx.query(
      `UPDATE relationship_outbox
       SET written_at = now(), authorization_revision = $2, attempts = attempts + 1, last_error = NULL
       WHERE id = $1 AND written_at IS NULL`,
      [id.toString(), token],
    );
  }

  // Call after the transaction that enqueued the relationship has committed.
  // A separate scope sees only committed entries and owns the dispatch lock.
  async dispatchOne(authorization: AuthorizationPort, id: bigint): Promise<AuthorizationRevision | null> {
    const outcome = await this.inPlatformScope<DispatchOutcome>(async (tx) => {
      const entry = await this.read(tx, id);
      if (entry === null) return { ok: true, token: null };

      let token: AuthorizationRevision;
      try {
        token = await authorization.write([{
          operation: entry.operation,
          resource: entry.resource,
          relation: entry.relation,
          subject: entry.subject,
        }]);
      } catch (error) {
        await tx.query(
          `UPDATE relationship_outbox
           SET attempts = attempts + 1, last_error = $2
           WHERE id = $1 AND written_at IS NULL`,
          [id.toString(), 'Authorization relationship write failed.'],
        );
        return { ok: false, error };
      }

      await this.markWritten(tx, id, token);
      return { ok: true, token };
    });

    // Commit failure bookkeeping before reporting the infrastructure failure.
    if (!outcome.ok) throw outcome.error;
    return outcome.token;
  }
}
