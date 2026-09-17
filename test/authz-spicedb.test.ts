import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v1 } from '@authzed/authzed-node';
import { CompanyId, ProjectId, TestClock, UserId } from '../src/shared/kernel/index.js';
import type { CheckRequest } from '../src/modules/authz/index.js';
import { SpiceDbAuthorizationPort } from '../src/modules/authz/infrastructure/spicedb-authorization-port.js';

const endpoint = process.env.SPICEDB_ENDPOINT;
const token = process.env.SPICEDB_TOKEN;
const required = process.env.REQUIRE_DB_TESTS === '1';
const integration = (endpoint === undefined || token === undefined) && !required ? describe.skip : describe;
const companyId = CompanyId('018f8f9d-7f83-7abc-8def-000000000001');
const projectId = ProjectId('018f8f9d-7f83-7abc-8def-000000000002');
const adminId = UserId('018f8f9d-7f83-7abc-8def-000000000003');
const operatorId = UserId('018f8f9d-7f83-7abc-8def-000000000004');
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminCheck: CheckRequest = {
  resource: { type: 'project', id: projectId },
  permission: 'administer',
  subject: { type: 'user', id: adminId },
};

let clock: TestClock;
let port: SpiceDbAuthorizationPort | undefined;

function requireService(): { endpoint: string; token: string } {
  if (endpoint === undefined || token === undefined) {
    throw new Error('SPICEDB_ENDPOINT and SPICEDB_TOKEN are required when REQUIRE_DB_TESTS=1.');
  }
  return { endpoint, token };
}

function createClient(): ReturnType<typeof v1.NewClient> {
  const service = requireService();
  return v1.NewClient(service.token, service.endpoint, v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED);
}

async function relationshipsForProject(): Promise<v1.ReadRelationshipsResponse[]> {
  const client = createClient();
  try {
    return await client.promises.readRelationships(v1.ReadRelationshipsRequest.create({
      consistency: v1.Consistency.create({ requirement: { oneofKind: 'fullyConsistent', fullyConsistent: true } }),
      relationshipFilter: v1.RelationshipFilter.create({
        resourceType: 'project',
        optionalResourceId: projectId,
        optionalRelation: 'company',
      }),
    }));
  } finally {
    client.close();
  }
}

integration.sequential('SpiceDB authorization port', () => {
  beforeEach(async () => {
    const service = requireService();
    clock = new TestClock(new Date('2026-01-01T00:00:00.000Z'));
    port = new SpiceDbAuthorizationPort({
      ...service,
      clock,
      stalenessCeilingMs: 1_000,
      security: v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED,
    });
    const schema = await readFile(path.join(repositoryRoot, 'docs/opintel-schema.zed'), 'utf8');
    await port.loadSchema(schema);
  });

  afterEach(() => {
    port?.close();
    port = undefined;
  });

  it('E-001: writes company#admin@user and returns a revision-bearing check result', async () => {
    await port?.write([{
      operation: 'touch',
      resource: { type: 'company', id: companyId },
      relation: 'admin',
      subject: { type: 'user', id: adminId },
    }]);

    const result = await port?.check({
      resource: { type: 'company', id: companyId },
      permission: 'admin',
      subject: { type: 'user', id: adminId },
    });

    expect(result).toMatchObject({ allowed: true, snapshotAgeMs: 0 });
    expect(result?.token.length).toBeGreaterThan(0);
    expect(result?.checkedAt).toBe(clock.now());
  });

  it('E-002 and E-003: writes project#company@company and inherits administer for a company admin', async () => {
    await port?.write([
      {
        operation: 'touch',
        resource: { type: 'company', id: companyId },
        relation: 'admin',
        subject: { type: 'user', id: adminId },
      },
      {
        operation: 'touch',
        resource: { type: 'project', id: projectId },
        relation: 'company',
        subject: { type: 'company', id: companyId },
      },
    ]);

    const relationships = await relationshipsForProject();
    expect(relationships).toHaveLength(1);
    expect(relationships[0]?.relationship).toMatchObject({
      resource: { objectType: 'project', objectId: projectId },
      relation: 'company',
      subject: { object: { objectType: 'company', objectId: companyId } },
    });
    await expect(port?.check(adminCheck)).resolves.toMatchObject({ allowed: true });
  });

  it('E-004: deleting one company-admin relationship removes inherited project access', async () => {
    await port?.write([
      {
        operation: 'touch',
        resource: { type: 'company', id: companyId },
        relation: 'admin',
        subject: { type: 'user', id: adminId },
      },
      {
        operation: 'touch',
        resource: { type: 'project', id: projectId },
        relation: 'company',
        subject: { type: 'company', id: companyId },
      },
    ]);
    await expect(port?.check(adminCheck)).resolves.toMatchObject({ allowed: true });

    await port?.write([{
      operation: 'delete',
      resource: { type: 'company', id: companyId },
      relation: 'admin',
      subject: { type: 'user', id: adminId },
    }]);

    await expect(port?.check(adminCheck)).resolves.toMatchObject({ allowed: false });
  });

  it('allows operators to export evidence but not set an entitlement', async () => {
    await port?.write([{
      operation: 'touch',
      resource: { type: 'project', id: projectId },
      relation: 'operator',
      subject: { type: 'user', id: operatorId },
    }]);

    const [exportEvidence, setEntitlement] = await port?.checkMany([
      {
        resource: { type: 'project', id: projectId },
        permission: 'export_evidence',
        subject: { type: 'user', id: operatorId },
      },
      {
        resource: { type: 'project', id: projectId },
        permission: 'set_entitlement',
        subject: { type: 'user', id: operatorId },
      },
    ]) ?? [];

    expect(exportEvidence).toMatchObject({ allowed: true });
    expect(setEntitlement).toMatchObject({ allowed: false });
  });

  it('refuses after the staleness ceiling instead of using an unreachable stale snapshot', async () => {
    await port?.write([
      {
        operation: 'touch',
        resource: { type: 'company', id: companyId },
        relation: 'admin',
        subject: { type: 'user', id: adminId },
      },
      {
        operation: 'touch',
        resource: { type: 'project', id: projectId },
        relation: 'company',
        subject: { type: 'company', id: companyId },
      },
    ]);
    const fresh = await port?.check(adminCheck);
    port?.close();
    clock.advance(1_001);

    const stale = await port?.check(adminCheck);

    expect(stale).toMatchObject({ allowed: false, token: fresh?.token, snapshotAgeMs: 1_001 });
  });
});
