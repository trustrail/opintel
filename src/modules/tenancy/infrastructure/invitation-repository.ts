import { withPlatform } from '../../../platform/db/scope.js';
import { MailOutbox } from '../../../platform/mail/index.js';
import { CompanyId, DomainError, InviteId, ProjectId, Timestamp, UserId, err, ok } from '../../../shared/kernel/index.js';
import type { Invitation, InvitationRepository } from '../application/invitations.js';
import type { RelationshipOutbox } from '../application/relationship-outbox.js';

type Row = { id: string; email: string; company_id: string; project_id: string | null; role: Invitation['role']; created_by: string; inviter_email: string; expires_at: Date; created_at: Date };
const columns = 'i.id, i.email, i.company_id, i.project_id, i.role, i.created_by, u.email AS inviter_email, i.expires_at, i.created_at';
function view(row: Row): Invitation {
  return { id: InviteId(row.id), email: row.email, companyId: CompanyId(row.company_id), projectId: row.project_id === null ? null : ProjectId(row.project_id), role: row.role,
    invitedBy: { id: UserId(row.created_by), email: row.inviter_email }, expiresAt: Timestamp(row.expires_at), createdAt: Timestamp(row.created_at) };
}

export class PostgresInvitationRepository implements InvitationRepository {
  constructor(private readonly outbox: RelationshipOutbox, private readonly mailOutbox = new MailOutbox()) {}

  async create(...[input, project, creator, hash, nonce, now, expiresAt]: Parameters<InvitationRepository['create']>): ReturnType<InvitationRepository['create']> {
    return withPlatform(async (tx) => {
      if (input.projectId !== project) return err(new DomainError('validation_failed', 'The invitation project must match the requested project.'));
      const target = await tx.query<{ company_id: string }>('SELECT company_id FROM project WHERE id = $1 FOR UPDATE', [project]);
      if (target[0]?.company_id !== input.companyId) return err(new DomainError('validation_failed', 'The project does not belong to the selected company.'));
      const existing = await tx.query<{ id: string }>(`SELECT u.id FROM user_account u WHERE u.email = $1 AND (
        EXISTS (SELECT 1 FROM project_member m WHERE m.project_id = $2 AND m.user_id = u.id)
        OR EXISTS (SELECT 1 FROM company_member m WHERE m.company_id = $3 AND m.user_id = u.id AND m.role = 'admin'))`, [input.email, project, input.companyId]);
      if (existing.length > 0) return err(new DomainError('conflict', 'This person is already a member of the project.'));
      const inserted = await tx.query<{ id: string }>(`INSERT INTO pending_invite (email, company_id, project_id, role, token_hash, expires_at, created_by, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [input.email, input.companyId, project, input.role, hash, expiresAt, creator, now]);
      const id = inserted[0]?.id;
      if (id === undefined) throw new Error('Invitation creation returned no row.');
      const tokens = await tx.query<{ id: string }>(`INSERT INTO magic_link_token (email, token_hash, device_nonce, invite_id, expires_at)
        VALUES ($1,$2,$3,$4,$5) RETURNING id`, [input.email, hash, nonce, id, expiresAt]);
      const tokenId = tokens[0]?.id;
      if (tokenId === undefined) throw new Error('Invitation token creation returned no row.');
      await this.mailOutbox.enqueue(tx, { to: input.email, template: 'magic_link', vars: { tokenId }, idempotencyKey: `magic_link:${tokenId}` });
      const rows = await tx.query<Row>(`SELECT ${columns} FROM pending_invite i JOIN user_account u ON u.id = i.created_by WHERE i.id = $1`, [id]);
      if (rows[0] === undefined) throw new Error('Invitation lookup returned no row.');
      return ok({ invitation: view(rows[0]), tokenId });
    });
  }

  async list(...[project, after, limit, now]: Parameters<InvitationRepository['list']>): Promise<Invitation[]> {
    return withPlatform(async (tx) => (await tx.query<Row>(`SELECT ${columns} FROM pending_invite i JOIN user_account u ON u.id = i.created_by
      WHERE i.project_id = $1 AND i.accepted_at IS NULL AND i.expires_at > $4 AND ($2::uuid IS NULL OR i.id > $2)
      ORDER BY i.id LIMIT $3`, [project, after, limit, now])).map(view));
  }

  async projectFor(id: InviteId): Promise<ProjectId | null> {
    return withPlatform(async (tx) => {
      const rows = await tx.query<{ project_id: string | null }>('SELECT project_id FROM pending_invite WHERE id = $1 AND accepted_at IS NULL', [id]);
      return rows[0]?.project_id == null ? null : ProjectId(rows[0].project_id);
    });
  }
  async revoke(id: InviteId): Promise<void> {
    await withPlatform((tx) => tx.query('DELETE FROM pending_invite WHERE id = $1 AND accepted_at IS NULL', [id]));
  }

  async accept(...[id, user, now]: Parameters<InvitationRepository['accept']>): ReturnType<InvitationRepository['accept']> {
    return withPlatform(async (tx) => {
      const rows = await tx.query<{ email: string; project_id: string | null; role: Invitation['role']; created_by: string; expires_at: Date; accepted_at: Date | null }>(
        'SELECT email, project_id, role, created_by, expires_at, accepted_at FROM pending_invite WHERE id = $1 FOR UPDATE', [id]);
      const invite = rows[0];
      if (invite === undefined) return ok(null);
      const accounts = await tx.query<{ id: string }>('SELECT id FROM user_account WHERE id = $1 AND email = $2', [user, invite.email]);
      if (accounts.length === 0) return err(new DomainError('forbidden', 'This invitation belongs to another email address.'));
      if (invite.accepted_at !== null) return ok(null);
      if (invite.expires_at.getTime() <= new Date(now).getTime()) return err(new DomainError('validation_failed', 'This invitation has expired. Ask an administrator for a new invitation.', { action: 'request_invitation' }));
      if (invite.project_id === null) return err(new DomainError('validation_failed', 'This invitation does not name a project.'));
      const members = await tx.query<{ user_id: string }>(`INSERT INTO project_member (project_id, user_id, role, granted_by, granted_at)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT (project_id, user_id) DO NOTHING RETURNING user_id`, [invite.project_id, user, invite.role, invite.created_by, now]);
      if (members.length === 0) return err(new DomainError('conflict', 'This person is already a member of the project.'));
      const outboxId = await this.outbox.enqueue(tx, { operation: 'touch', resource: { type: 'project', id: invite.project_id }, relation: invite.role, subject: { type: 'user', id: user } });
      await tx.query('UPDATE pending_invite SET accepted_at = $2 WHERE id = $1', [id, now]);
      return ok(outboxId);
    });
  }
}
