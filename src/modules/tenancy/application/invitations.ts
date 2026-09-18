import { createHash, randomBytes } from 'node:crypto';
import { DomainError, err, ok, Timestamp, type Clock, type CompanyId, type InviteId, type ProjectId, type Result, type UserId } from '../../../shared/kernel/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
import type { RelationshipOutbox } from './relationship-outbox.js';

export type InvitationInput = { email: string; companyId: CompanyId; projectId: ProjectId | null; role: 'admin' | 'operator' | 'viewer' };
export type Invitation = InvitationInput & {
  id: InviteId; invitedBy: { id: UserId; email: string }; expiresAt: Timestamp; createdAt: Timestamp;
};
export interface InvitationRepository {
  create(input: InvitationInput, project: ProjectId, creator: UserId, hash: Buffer, nonce: string, now: Timestamp, expiresAt: Timestamp): Promise<Result<{ invitation: Invitation; tokenId: string }, DomainError>>;
  list(project: ProjectId, after: InviteId | null, limit: number, now: Timestamp): Promise<Invitation[]>;
  projectFor(id: InviteId): Promise<ProjectId | null>;
  revoke(id: InviteId): Promise<void>;
  accept(id: InviteId, user: UserId, now: Timestamp): Promise<Result<bigint | null, DomainError>>;
}
export interface InvitationDelivery {
  dispatch(message: { tokenId: string; token: string }): Promise<void>;
}

export class InvitationService {
  constructor(private readonly repository: InvitationRepository, private readonly outbox: RelationshipOutbox,
    private readonly authorization: AuthorizationPort, private readonly clock: Clock, private readonly delivery: InvitationDelivery) {}

  async create(input: InvitationInput, project: ProjectId, creator: UserId): Promise<Result<Invitation, DomainError>> {
    const token = randomBytes(32).toString('base64url');
    const now = this.clock.now();
    const expiresAt = Timestamp(new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000));
    const created = await this.repository.create(input, project, creator, createHash('sha256').update(token).digest(), randomBytes(32).toString('base64url'), now, expiresAt);
    if (!created.ok) return created;
    try { await this.delivery.dispatch({ tokenId: created.value.tokenId, token }); }
    catch { return err(new DomainError('dependency_unavailable', 'The invitation was saved, but its email could not be sent.', undefined, true)); }
    return ok(created.value.invitation);
  }

  async list(project: ProjectId, after: InviteId | null, limit: number): Promise<Result<{ items: Invitation[]; nextId: InviteId | null }, DomainError>> {
    const rows = await this.repository.list(project, after, limit + 1, this.clock.now());
    const items = rows.slice(0, limit);
    return ok({ items, nextId: rows.length > limit ? items.at(-1)?.id ?? null : null });
  }

  async revoke(id: InviteId, user: UserId): Promise<Result<void, DomainError>> {
    const project = await this.repository.projectFor(id);
    if (project === null) return err(new DomainError('not_found', 'The invitation does not exist.'));
    const permission = await this.authorization.check({ resource: { type: 'project', id: project }, permission: 'administer', subject: { type: 'user', id: user } });
    if (!permission.allowed) return err(new DomainError('forbidden', 'You must administer this project to revoke its invitations.'));
    await this.repository.revoke(id);
    return ok(undefined);
  }

  async accept(id: InviteId, user: UserId): Promise<Result<void, DomainError>> {
    const accepted = await this.repository.accept(id, user, this.clock.now());
    if (!accepted.ok) return accepted;
    // A revoked invitation permits sign-in, but grants nothing.
    if (accepted.value === null) return ok(undefined);
    try {
      if (await this.outbox.dispatchOne(this.authorization, accepted.value) !== null) return ok(undefined);
    } catch { /* The committed row remains available for retry. */ }
    return err(new DomainError('dependency_unavailable', 'The invitation was accepted, but access could not be confirmed. Request a new sign-in link after access is restored.', undefined, true));
  }
}
