import {RemoveProjectMemberService,PostgresProjectGrantRemoval,memberRemovalRoutes,RelationshipOutbox} from '../src/modules/tenancy/index.js';
import {ProjectGrantRemovalResponse} from '../src/shared/api/project-members.js';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { v1 } from '@authzed/authzed-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpiceDbAuthorizationPort } from '../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import type { RelationshipUpdate } from '../src/modules/authz/index.js';
import { memberRoutes } from '../src/modules/tenancy/api/member-routes.js';
import { ListMembersService } from '../src/modules/tenancy/application/list-members.js';
import { PostgresMemberListRepository } from '../src/modules/tenancy/infrastructure/member-list-repository.js';
import { tenancyListRoutes } from '../src/modules/tenancy/api/list-routes.js';
import { TenancyListService } from '../src/modules/tenancy/application/list-tenancy.js';
import { PostgresTenancyListRepository } from '../src/modules/tenancy/infrastructure/tenancy-list-repository.js';
import { ProjectMemberListResponse, ProjectListResponse } from '../src/shared/api/tenancy-schemas.js';
import { withPlatform } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { CompanyId, ProjectId, UserId, SystemClock } from '../src/shared/kernel/index.js';
import { resetDatabaseBeforeEach } from './database-fixture.js';

describe('project members and project discovery with Postgres and SpiceDB', () => {
  resetDatabaseBeforeEach('company', 'user_account');
  let port: SpiceDbAuthorizationPort;
  let sdk: ReturnType<typeof v1.NewClient>;
  let server: ReturnType<typeof createHttpServer>;
  let base: string;
  let project: ProjectId;
  let company: CompanyId;
  let otherCompany: CompanyId;
  let industry: string;
  let users: Record<'direct' | 'admin' | 'member' | 'both' | 'outsider', UserId>;
  let actor: UserId | null;
  const clock = new SystemClock();
  const grantedAt = '2026-01-02T00:00:00.000Z';

  beforeEach(async () => {
    const endpoint = process.env.SPICEDB_ENDPOINT;
    const token = process.env.SPICEDB_TOKEN;
    if (!endpoint || !token) throw new Error('SpiceDB is required. Run npm run dev:up.');
    port = new SpiceDbAuthorizationPort({ endpoint, token, clock, stalenessCeilingMs: 0 });
    sdk = v1.NewClient(token, endpoint, v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED);
    await port.loadSchema(await readFile('docs/opintel-schema.zed', 'utf8'));
    project = ProjectId(randomUUID()); company = CompanyId(randomUUID()); otherCompany = CompanyId(randomUUID());
    users = { direct: UserId(randomUUID()), admin: UserId(randomUUID()), member: UserId(randomUUID()), both: UserId(randomUUID()), outsider: UserId(randomUUID()) };
    actor = users.direct;
    await withPlatform(async (tx) => {
      const [row] = await tx.query<{ id: string }>('SELECT id FROM industry LIMIT 1');
      if (!row) throw new Error('No industry.');
      industry = row.id;
      for (const [name, id] of Object.entries(users)) await tx.query('INSERT INTO user_account (id, email, full_name) VALUES ($1, $2, $3)', [id, `${name}@example.com`, name === 'member' ? null : name]);
      await tx.query("INSERT INTO company (id, name, default_region) VALUES ($1, 'Members', 'eu-west-1'), ($2, 'Other', 'eu-west-1')", [company, otherCompany]);
      await tx.query("INSERT INTO project (id, company_id, industry_id, name, region) VALUES ($1, $2, $3, 'Members', 'eu-west-1')", [project, company, industry]);
      await tx.query("INSERT INTO company_member (company_id, user_id, role) VALUES ($1, $2, 'admin'), ($1, $3, 'member'), ($1, $4, 'member'), ($5, $6, 'admin')", [company, users.admin, users.member, users.both, otherCompany, users.outsider]);
      await tx.query("INSERT INTO project_member (project_id, user_id, role, granted_by, granted_at) VALUES ($1, $2, 'operator', $4, $5), ($1, $3, 'viewer', $4, $5)", [project, users.direct, users.both, users.admin, grantedAt]);
    });
    await port.write([
      { operation: 'touch', resource: { type: 'project', id: project }, relation: 'company', subject: { type: 'company', id: company } },
      ...(['admin', 'member', 'both'] as const).map((name): RelationshipUpdate => ({ operation: 'touch', resource: { type: 'company', id: company }, relation: name === 'admin' ? 'admin' : 'member', subject: { type: 'user', id: users[name] } })),
      { operation: 'touch', resource: { type: 'project', id: project }, relation: 'operator', subject: { type: 'user', id: users.direct } },
      { operation: 'touch', resource: { type: 'project', id: project }, relation: 'viewer', subject: { type: 'user', id: users.both } },
      { operation: 'touch', resource: { type: 'company', id: otherCompany }, relation: 'admin', subject: { type: 'user', id: users.outsider } },
    ]);
    server = createHttpServer([
      ...memberRoutes(new ListMembersService(new PostgresMemberListRepository())),
      ...memberRemovalRoutes(new RemoveProjectMemberService(new PostgresProjectGrantRemoval(new RelationshipOutbox()),port)),
      ...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(), port)),
    ], { authorization: { port, currentUser: async () => actor === null ? null : {
      id: actor, email: 'caller@example.com', fullName: null, timezone: 'UTC', method: 'magic_link', sessionCreatedAt: clock.now(), deviceConfirmed: true,
    } } });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No address.');
    base = `http://127.0.0.1:${address.port}/api/v1`;
  });
  afterEach(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    port?.close(); sdk?.close();
  });

  it('removes only a direct project grant, records its revision and audit, and stops direct access',async()=>{
    actor=users.admin;
    const response=await fetch(`${base}/projects/${project}/members/${users.direct}`,{method:'DELETE'});
    expect(response.status).toBe(200);expect(ProjectGrantRemovalResponse.parse(await response.json())).toEqual({removed:true,companyAccessRemains:false});
    expect(await withPlatform(tx=>tx.query('SELECT user_id FROM project_member WHERE project_id=$1 AND user_id=$2',[project,users.direct]))).toEqual([]);
    expect((await port.check({resource:{type:'project',id:project},permission:'view',subject:{type:'user',id:users.direct}})).allowed).toBe(false);
    const entries=await withPlatform(tx=>tx.query<{authorization_revision:string;written_at:Date}>("SELECT authorization_revision,written_at FROM relationship_outbox WHERE resource_id=$1 AND subject_id=$2 AND operation='delete'",[project,users.direct]));
    expect(entries).toHaveLength(1);expect(entries[0]?.authorization_revision).toBeTruthy();expect(entries[0]?.written_at).toBeTruthy();
    expect(await withPlatform(tx=>tx.query("SELECT actor_id,before,after FROM audit_entry WHERE company_id=$1 AND target->>'projectId'=$2 AND action='ProjectGrantRemoved'",[company,project]))).toEqual([{actor_id:users.admin,before:{role:'operator'},after:{directGrant:false,companyAccessRemains:false}}]);
  });
  it('removing a both grant preserves company membership, inherited access and company provenance',async()=>{
    actor=users.admin;const response=await fetch(`${base}/projects/${project}/members/${users.both}`,{method:'DELETE'});
    expect(response.status).toBe(200);expect(ProjectGrantRemovalResponse.parse(await response.json())).toEqual({removed:true,companyAccessRemains:true});
    expect((await withPlatform(tx=>tx.query('SELECT role FROM company_member WHERE company_id=$1 AND user_id=$2',[company,users.both])))).toEqual([{role:'member'}]);
    expect((await port.check({resource:{type:'project',id:project},permission:'view',subject:{type:'user',id:users.both}})).allowed).toBe(true);
    const members=ProjectMemberListResponse.parse(await(await fetch(`${base}/projects/${project}/members`)).json());expect(members.items.find(m=>m.user.id===users.both)).toMatchObject({projectRole:null,companyRole:'member',via:'company'});
  });
  it('refuses to remove the last direct project admin without company inheritance',async()=>{
    await withPlatform(tx=>tx.query("UPDATE project_member SET role='admin' WHERE project_id=$1 AND user_id=$2",[project,users.direct]));
    await port.write([{operation:'delete',resource:{type:'project',id:project},relation:'operator',subject:{type:'user',id:users.direct}},{operation:'touch',resource:{type:'project',id:project},relation:'admin',subject:{type:'user',id:users.direct}}]);
    actor=users.admin;const response=await fetch(`${base}/projects/${project}/members/${users.direct}`,{method:'DELETE'});expect(response.status).toBe(409);expect((await response.json()).error.message).toContain('last direct project administrator');
    expect(await withPlatform(tx=>tx.query('SELECT role FROM project_member WHERE project_id=$1 AND user_id=$2',[project,users.direct]))).toEqual([{role:'admin'}]);expect((await port.check({resource:{type:'project',id:project},permission:'administer',subject:{type:'user',id:users.direct}})).allowed).toBe(true);
  });
  it('declares project administer permission and rejects non-admin grant removal before mutation',async()=>{
    const route=memberRemovalRoutes(new RemoveProjectMemberService(new PostgresProjectGrantRemoval(new RelationshipOutbox()),port))[0]!;expect(route.permission).toMatchObject({resource:'project',permission:'administer'});
    actor=users.direct;const response=await fetch(`${base}/projects/${project}/members/${users.both}`,{method:'DELETE'});expect(response.status).toBe(403);
    expect(await withPlatform(tx=>tx.query('SELECT role FROM project_member WHERE project_id=$1 AND user_id=$2',[project,users.both]))).toEqual([{role:'viewer'}]);
  });
  it('an authorization outage refuses removal and leaves membership and audit unchanged',async()=>{
    actor=users.admin;const spy=vi.spyOn(port,'write').mockRejectedValue(new Error('Provider unavailable'));
    try{const response=await fetch(`${base}/projects/${project}/members/${users.direct}`,{method:'DELETE'});expect(response.status).toBe(503);}finally{spy.mockRestore();}
    expect(await withPlatform(tx=>tx.query('SELECT role FROM project_member WHERE project_id=$1 AND user_id=$2',[project,users.direct]))).toEqual([{role:'operator'}]);
    expect(await withPlatform(tx=>tx.query("SELECT id FROM audit_entry WHERE company_id=$1 AND target->>'projectId'=$2 AND action='ProjectGrantRemoved'",[company,project]))).toEqual([]);
  });

  it('includes direct and inherited members once, with both and project grant provenance', async () => {
    const response = await fetch(`${base}/projects/${project}/members`);
    expect(response.status).toBe(200);
    const { items, nextCursor } = ProjectMemberListResponse.parse(await response.json());
    expect(nextCursor).toBeNull();
    expect(items).toHaveLength(4);
    expect(new Set(items.map((item) => item.user.id)).size).toBe(4);
    expect(items.find((item) => item.user.id === users.direct)).toMatchObject({ projectRole: 'operator', companyRole: null, via: 'project', grantedAt, grantedBy: { id: users.admin, email: 'admin@example.com' } });
    expect(items.find((item) => item.user.id === users.admin)).toMatchObject({ projectRole: null, companyRole: 'admin', via: 'company', grantedAt: null, grantedBy: null });
    expect(items.find((item) => item.user.id === users.member)).toMatchObject({ user: { fullName: null }, projectRole: null, companyRole: 'member', via: 'company', grantedAt: null, grantedBy: null });
    expect(items.find((item) => item.user.id === users.both)).toMatchObject({ projectRole: 'viewer', companyRole: 'member', via: 'both', grantedAt, grantedBy: { id: users.admin } });
    expect(items.some((item) => item.user.id === users.outsider)).toBe(false);
  });

  it('paginates by user without duplicates and rejects malformed or cross-project cursors', async () => {
    const first = ProjectMemberListResponse.parse(await (await fetch(`${base}/projects/${project}/members?limit=2`)).json());
    expect(first.items).toHaveLength(2); expect(first.nextCursor).not.toBeNull();
    const second = ProjectMemberListResponse.parse(await (await fetch(`${base}/projects/${project}/members?limit=2&cursor=${first.nextCursor}`)).json());
    expect(second.items).toHaveLength(2); expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((item) => item.user.id);
    expect(ids).toEqual([...new Set(ids)].sort());
    expect((await fetch(`${base}/projects/${project}/members?cursor=bad`)).status).toBe(400);
    const cursor = Buffer.from(JSON.stringify({ project: randomUUID(), user: users.direct })).toString('base64url');
    expect((await fetch(`${base}/projects/${project}/members?cursor=${cursor}`)).status).toBe(400);
  });

  it('requires project view, hiding the roster from a different company', async () => {
    actor = users.outsider;
    expect((await fetch(`${base}/projects/${project}/members`)).status).toBe(404);
    actor = null;
    expect((await fetch(`${base}/projects/${project}/members`)).status).toBe(401);
  });

  it('E-015/E-016: project list matches LookupResources across 200 projects', async () => {
    actor = users.admin;
    const ids = Array.from({ length: 199 }, () => ProjectId(randomUUID()));
    const updates: RelationshipUpdate[] = [];
    await withPlatform(async (tx) => {
      for (const [index, id] of ids.entries()) {
        const owner = index < 99 ? company : otherCompany;
        await tx.query("INSERT INTO project (id, company_id, industry_id, name, region) VALUES ($1, $2, $3, $4, 'eu-west-1')", [id, owner, industry, `Project ${index}`]);
        updates.push({ operation: 'touch', resource: { type: 'project', id }, relation: 'company', subject: { type: 'company', id: owner } });
        if (index >= 99 && index < 149) {
          await tx.query("INSERT INTO project_member (project_id, user_id, role) VALUES ($1, $2, 'viewer')", [id, users.admin]);
          updates.push({ operation: 'touch', resource: { type: 'project', id }, relation: 'viewer', subject: { type: 'user', id: users.admin } });
        }
      }
    });
    await port.write(updates);
    const lookup = await sdk.promises.lookupResources(v1.LookupResourcesRequest.create({
      consistency: { requirement: { oneofKind: 'fullyConsistent', fullyConsistent: true } },
      resourceObjectType: 'project', permission: 'view', subject: { object: { objectType: 'user', objectId: users.admin } },
    }));
    expect(lookup).toHaveLength(150);
    const listed: string[] = [];
    let cursor: string | null = null;
    do {
      const response = await fetch(`${base}/projects?limit=40${cursor === null ? '' : `&cursor=${cursor}`}`);
      expect(response.status).toBe(200);
      const page = ProjectListResponse.parse(await response.json());
      listed.push(...page.items.map((item) => item.id)); cursor = page.nextCursor;
    } while (cursor !== null);
    expect(listed.sort()).toEqual(lookup.map((item) => item.resourceObjectId).sort());
  }, 30_000);
});
