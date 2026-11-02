import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { v1 } from '@authzed/authzed-node';
import { CompanyId, ProjectId, TestClock, UserId } from '../src/shared/kernel/index.js';
import type { CheckRequest } from '../src/modules/authz/index.js';
import {writeSchemaWithRetry} from '../src/modules/authz/infrastructure/load-schema.js';
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


describe('packaged SpiceDB schema writes', () => {
  afterEach(() => {vi.restoreAllMocks();});
  it('retries only transient failures and succeeds with the same bounded RPC allowance', async () => {
    const messages: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {messages.push(String(chunk));return true;});
    let elapsed = 0, calls = 0;
    const allowances: number[] = [];
    await writeSchemaWithRetry(async allowance => {
      allowances.push(allowance);
      const code = [14,4,1][calls++];
      if (code !== undefined) throw Object.assign(new Error('private token and schema text must never be logged'), {code});
    }, {now:()=>elapsed,sleep:async ms=>{elapsed+=ms;}});
    expect(calls).toBe(4);
    expect(allowances).toEqual([5000,5000,5000,5000]);
    expect(elapsed).toBe(750);
    expect(messages.map(message=>JSON.parse(message))).toEqual([
      {event:'schema_load.retry',attempt:2,code:'UNAVAILABLE'},
      {event:'schema_load.retry',attempt:3,code:'DEADLINE_EXCEEDED'},
      {event:'schema_load.retry',attempt:4,code:'CANCELED'},
    ]);
    expect(messages.join('')).not.toContain('private token');
    expect(messages.join('')).not.toContain('schema text');
  });
  it.each([
    [3,'INVALID_ARGUMENT'],[7,'PERMISSION_DENIED'],[16,'UNAUTHENTICATED'],
    [8,'RESOURCE_EXHAUSTED'],[2,'UNKNOWN'],['private-token','UNKNOWN'],
  ])('fails immediately without retry on non-transient code %s', async (nativeCode, code) => {
    const logged = vi.spyOn(process.stderr, 'write').mockImplementation(()=>true);
    const write = vi.fn(async()=>{throw Object.assign(new Error('private-token'),{code:nativeCode});});
    const sleep = vi.fn(async()=>{});
    const failure = await writeSchemaWithRetry(write,{now:()=>0,sleep}).catch((error:unknown)=>error);
    expect(failure).toMatchObject({code,attempts:1,message:`SpiceDB schema write failed after 1 attempt; last code: ${code}.`});
    expect(write).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
    expect(String(failure)).not.toContain('private-token');
  });
  it('stops at 120 seconds, caps the final RPC to the remaining budget and retains the last code', async () => {
    const logged = vi.spyOn(process.stderr, 'write').mockImplementation(()=>true);
    let elapsed = 0;
    const allowances: number[] = [], sleeps: number[] = [];
    const failure = await writeSchemaWithRetry(async allowance=>{
      allowances.push(allowance);elapsed+=allowance;
      throw Object.assign(new Error('private schema'),{code:14});
    },{now:()=>elapsed,sleep:async ms=>{sleeps.push(ms);elapsed+=ms;}}).catch((error:unknown)=>error);
    expect(elapsed).toBe(120000);
    expect(allowances).toEqual([...Array.from({length:22},()=>5000),4500]);
    expect(sleeps).toEqual(Array.from({length:22},()=>250));
    expect(logged).toHaveBeenCalledTimes(22);
    expect(failure).toMatchObject({code:'UNAVAILABLE',attempts:23,message:'SpiceDB schema write failed after 23 attempts; last code: UNAVAILABLE.'});
  });
});
