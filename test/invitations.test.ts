import { resetDatabaseBeforeEach } from './database-fixture.js';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompanyId, InviteId, ProjectId, SessionId, TestClock, UserId } from '../src/shared/kernel/index.js';
import type { AuthorizationPort, RelationshipUpdate, ZedToken } from '../src/modules/authz/index.js';
import { RelationshipOutbox } from '../src/modules/tenancy/application/relationship-outbox.js';
import { InvitationService } from '../src/modules/tenancy/application/invitations.js';
import { PostgresInvitationRepository } from '../src/modules/tenancy/infrastructure/invitation-repository.js';
import { invitationRoutes } from '../src/modules/tenancy/api/invitation-routes.js';
import { PostgresIdentityRepository } from '../src/modules/identity/infrastructure/magic-link-repositories.js';
import { MagicLinkService } from '../src/modules/identity/application/magic-link.js';
import type { SessionPort } from '../src/modules/identity/application/session.js';
import { magicLinkRoutes } from '../src/modules/identity/api/magic-link-routes.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { withPlatform, withPlatformAdmin } from '../src/platform/db/scope.js';

const integration = process.env.DATABASE_URL === undefined && process.env.REQUIRE_DB_TESTS !== '1' ? describe.skip : describe;
integration('invitations', () => {
  resetDatabaseBeforeEach('company', 'user_account', 'mail_outbox', 'relationship_outbox');
  const clock = new TestClock(new Date('2026-01-01T00:00:00Z'));
  let service: InvitationService;
  let links: MagicLinkService;
  let server: ReturnType<typeof createHttpServer>;
  let base: string;
  let company: CompanyId;
  let project: ProjectId;
  let otherProject: ProjectId;
  let creator: UserId;
  let allowed: boolean;
  let failWrite: boolean;
  const delivered = new Map<string, string>();
  const written: RelationshipUpdate[] = [];
  let sessions: SessionPort;
  let outbox: RelationshipOutbox;

  beforeEach(async () => {
    if (process.env.DATABASE_URL === undefined) throw new Error('DATABASE_URL is required.');
    clock.set(new Date('2026-01-01T00:00:00Z'));
    delivered.clear(); written.length = 0; allowed = true; failWrite = false;
    await withPlatformAdmin({ actor: { kind: 'system', name: 'invitation-tests' } }, async (tx) => {
      creator = UserId(randomUUID()); company = CompanyId(randomUUID()); project = ProjectId(randomUUID()); otherProject = ProjectId(randomUUID());
      await tx.query("INSERT INTO user_account (id,email) VALUES ($1,'admin@example.com')", [creator]);
      await tx.query("INSERT INTO company (id,name,default_region) VALUES ($1,'Invitations','us-east-1')", [company]);
      await tx.query("INSERT INTO project (id,company_id,industry_id,name,region) SELECT $1,$2,id,'First','us-east-1' FROM industry LIMIT 1", [project,company]);
      await tx.query("INSERT INTO project (id,company_id,industry_id,name,region) SELECT $1,$2,id,'Second','us-east-1' FROM industry LIMIT 1", [otherProject,company]);
    });
    const authorization: AuthorizationPort = {
      check: async () => ({ allowed, checkedAt: clock.now(), token: 'test' as ZedToken, snapshotAgeMs: 0 }),
      checkMany: async () => [], explain: async () => ({ allowed, path: [] }),
      write: async (updates) => {
        if (failWrite) throw new Error('SpiceDB unavailable');
        // A separate scope must already see the committed membership.
        for (const update of updates) {
          const rows = await withPlatform(tx => tx.query('SELECT user_id FROM project_member WHERE project_id=$1 AND user_id=$2', [update.resource.id, update.subject.id]));
          expect(rows).toHaveLength(1);
        }
        written.push(...updates); return 'invitation-zed-token' as ZedToken;
      },
    };
    outbox = new RelationshipOutbox();
    service = new InvitationService(new PostgresInvitationRepository(outbox), outbox, authorization, clock, {
      dispatch: async ({ tokenId, token }) => { delivered.set(tokenId, token); },
    });
    sessions = { create: vi.fn(async () => SessionId(randomUUID())), read: async () => null, touch: async () => {}, rotate: async () => SessionId(randomUUID()), revoke: async () => {}, revokeAllFor: async () => 0, listFor: async () => [] };
    const identity = new PostgresIdentityRepository(clock, service);
    links = new MagicLinkService(identity, identity, identity, { check: async () => ({ allowed: true, retryAfterSeconds: 0 }) }, sessions, clock);
    server = createHttpServer([...invitationRoutes(service), ...magicLinkRoutes(links)], { authorization: { port: authorization, currentUser: async () => ({ id: creator, email: 'admin@example.com', fullName: null, timezone: 'UTC', method: 'magic_link', sessionCreatedAt: clock.now(), deviceConfirmed: true }) } });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });
  afterEach(async () => { if (server !== undefined) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });

  async function invite(email = 'invitee@example.com', target = project, role: 'admin' | 'operator' | 'viewer' = 'operator') {
    const result = await service.create({ email, companyId: company, projectId: target, role }, target, creator);
    if (!result.ok) throw new Error(result.error.message);
    const token = [...delivered.values()].at(-1);
    if (token === undefined) throw new Error('Missing invitation token.');
    return { invitation: result.value, token };
  }
  async function accept(token: string) {
    return links.confirm({ token, deviceNonce: 'recipient-device', confirm: true, ip: '192.0.2.1', userAgent: 'test' });
  }

  it('E-010: sending grants nothing; creation and cursor listing return the declared payload', async () => {
    const response = await fetch(`${base}/projects/${project}/invitations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'one@example.com', companyId: company, projectId: project, role: 'viewer' }) });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ email: 'one@example.com', invitedBy: { id: creator, email: 'admin@example.com' }, expiresAt: '2026-01-08T00:00:00.000Z' });
    await invite('two@example.com');
    const first = await fetch(`${base}/projects/${project}/invitations?limit=1`).then(r => r.json()) as { items: { id: string }[]; nextCursor: string };
    const second = await fetch(`${base}/projects/${project}/invitations?limit=1&cursor=${first.nextCursor}`).then(r => r.json()) as { items: { id: string }[]; nextCursor: string | null };
    expect(first.items).toHaveLength(1); expect(second.items).toHaveLength(1); expect(second.items[0]?.id).not.toBe(first.items[0]?.id); expect(second.nextCursor).toBeNull();
    expect(written).toEqual([]);
    expect(await withPlatform(tx => tx.query('SELECT * FROM project_member'))).toEqual([]);
    expect(await withPlatform(tx => tx.query('SELECT * FROM relationship_outbox'))).toEqual([]);
  });

  it('E-011: acceptance commits membership, marks accepted and records the returned ZedToken', async () => {
    const { invitation, token } = await invite();
    expect(await accept(token)).toMatchObject({ kind: 'session' });
    expect(written).toHaveLength(1); expect(written[0]).toMatchObject({ resource: { type: 'project', id: project }, relation: 'operator' });
    const rows = await withPlatform(tx => tx.query<{ accepted_at: Date | null }>('SELECT accepted_at FROM pending_invite WHERE id=$1', [invitation.id]));
    expect(rows[0]?.accepted_at).not.toBeNull();
    expect(await withPlatform(tx => tx.query('SELECT zed_token FROM relationship_outbox'))).toEqual([{ zed_token: 'invitation-zed-token' }]);
  });

  it('accepts the invitation attached to the token when the address has two outstanding invitations', async () => {
    const first = await invite(); clock.advance(1000);
    const second = await invite('invitee@example.com', otherProject, 'viewer');
    expect(await accept(first.token)).toMatchObject({ kind: 'session' });
    const rows = await withPlatform(tx => tx.query<{ id: string; accepted_at: Date | null }>('SELECT id, accepted_at FROM pending_invite ORDER BY id'));
    expect(rows.find(row => row.id === first.invitation.id)?.accepted_at).not.toBeNull();
    expect(rows.find(row => row.id === second.invitation.id)?.accepted_at).toBeNull();
    expect(written).toHaveLength(1); expect(written[0]).toMatchObject({ resource: { id: project }, relation: 'operator' });
    expect(await accept(second.token)).toMatchObject({ kind: 'session' });
    expect(written[1]).toMatchObject({ resource: { id: otherProject }, relation: 'viewer' });
  });

  it('E-012: an expired invitation is refused with a re-request action', async () => {
    const { token } = await invite(); clock.advance(7 * 24 * 60 * 60 * 1000);
    await expect(accept(token)).rejects.toMatchObject({ code: 'validation_failed', details: { action: 'request_invitation' } });
    expect(written).toEqual([]); expect(sessions.create).not.toHaveBeenCalled();
  });

  it('E-013: revocation withdraws the grant while the magic link can still sign in', async () => {
    const { invitation, token } = await invite();
    expect((await fetch(`${base}/invitations/${invitation.id}`, { method: 'DELETE' })).status).toBe(204);
    expect(await accept(token)).toMatchObject({ kind: 'session' }); expect(written).toEqual([]);
    expect(await withPlatform(tx => tx.query('SELECT * FROM project_member'))).toEqual([]);
  });

  it('E-014: rejects invitations to an existing project member', async () => {
    const { token } = await invite(); await accept(token);
    const result = await service.create({ email: 'INVITEE@example.com', companyId: company, projectId: project, role: 'admin' }, project, creator);
    expect(result).toMatchObject({ ok: false, error: { code: 'conflict', message: 'This person is already a member of the project.' } });
  });

  it('requires a non-null projectId matching the route and its company', async () => {
    for (const body of [
      { projectId: null, companyId: company },
      { projectId: otherProject, companyId: company },
      { projectId: project, companyId: randomUUID() },
    ]) {
      const response = await fetch(`${base}/projects/${project}/invitations`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, email: 'invitee@example.com', role: 'viewer' }),
      });
      expect(response.status).toBe(400);
    }
    expect(await withPlatform(tx => tx.query('SELECT * FROM pending_invite'))).toEqual([]);
    expect(delivered.size).toBe(0);
  });

  it('retains failed relationship writes without creating a session or deleting the outbox row', async () => {
    const { token } = await invite(); failWrite = true;
    await expect(accept(token)).rejects.toMatchObject({ code: 'dependency_unavailable' });
    expect(sessions.create).not.toHaveBeenCalled();
    expect(await withPlatform(tx => tx.query('SELECT written_at, attempts FROM relationship_outbox'))).toEqual([{ written_at: null, attempts: 1 }]);
  });

  it('rolls back membership and acceptance when enqueueing the relationship fails', async () => {
    const { invitation, token } = await invite();
    const enqueue = vi.spyOn(outbox, 'enqueue').mockRejectedValueOnce(new Error('outbox unavailable'));
    try { await expect(accept(token)).rejects.toThrow('outbox unavailable'); }
    finally { enqueue.mockRestore(); }
    expect(await withPlatform(tx => tx.query('SELECT * FROM project_member'))).toEqual([]);
    expect(await withPlatform(tx => tx.query('SELECT accepted_at FROM pending_invite WHERE id=$1', [invitation.id]))).toEqual([{ accepted_at: null }]);
    expect(written).toEqual([]); expect(sessions.create).not.toHaveBeenCalled();
  });

  it('refuses a token whose email differs from the attached invitation', async () => {
    const { invitation, token } = await invite();
    await withPlatform(tx => tx.query("UPDATE magic_link_token SET email='wrong@example.com' WHERE invite_id=$1", [invitation.id]));
    await expect(accept(token)).rejects.toMatchObject({ code: 'forbidden' });
    expect(written).toEqual([]); expect(sessions.create).not.toHaveBeenCalled();
  });

  it('refuses unauthorized creation, listing and revocation', async () => {
    const { invitation } = await invite(); allowed = false;
    expect((await fetch(`${base}/projects/${project}/invitations`)).status).toBe(404);
    expect((await fetch(`${base}/projects/${project}/invitations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'denied@example.com', companyId: company, projectId: project, role: 'viewer' }) })).status).toBe(404);
    expect((await fetch(`${base}/invitations/${invitation.id}`, { method: 'DELETE' })).status).toBe(403);
    expect(await withPlatform(tx => tx.query('SELECT id FROM pending_invite WHERE id=$1', [invitation.id]))).toHaveLength(1);
  });
});
