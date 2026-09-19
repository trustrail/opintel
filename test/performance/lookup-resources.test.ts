import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { v1 } from '@authzed/authzed-node';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RelationshipUpdate } from '../../src/modules/authz/index.js';
import { SpiceDbAuthorizationPort } from '../../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import { CompanyId, ProjectId, UserId, SystemClock } from '../../src/shared/kernel/index.js';

const user = UserId(randomUUID());
const company = CompanyId(randomUUID());
const otherCompany = CompanyId(randomUUID());
const projects = Array.from({ length: 200 }, () => ProjectId(randomUUID()));
let port: SpiceDbAuthorizationPort;
let sdk: ReturnType<typeof v1.NewClient>;

beforeAll(async () => {
  const endpoint = process.env.SPICEDB_ENDPOINT;
  const token = process.env.SPICEDB_TOKEN;
  if (!endpoint || !token) throw new Error('SpiceDB is required. Run npm run dev:up.');
  port = new SpiceDbAuthorizationPort({ endpoint, token, clock: new SystemClock(), stalenessCeilingMs: 0 });
  sdk = v1.NewClient(token, endpoint, v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED);
  await port.loadSchema(await readFile('docs/opintel-schema.zed', 'utf8'));

  // Same graph as the main E-015/E-016 functional case: 100 inherited,
  // 50 directly granted, and 50 inaccessible projects. No lookup warm-up.
  const updates: RelationshipUpdate[] = [
    { operation: 'touch', resource: { type: 'company', id: company }, relation: 'admin', subject: { type: 'user', id: user } },
  ];
  for (const [index, id] of projects.entries()) {
    updates.push({ operation: 'touch', resource: { type: 'project', id }, relation: 'company', subject: { type: 'company', id: index < 100 ? company : otherCompany } });
    if (index >= 100 && index < 150) updates.push({ operation: 'touch', resource: { type: 'project', id }, relation: 'viewer', subject: { type: 'user', id: user } });
  }
  await port.write(updates);
});
afterAll(() => { port?.close(); sdk?.close(); });

it('E-016: fully consistent LookupResources across 200 projects takes under 100ms in isolation', async () => {
  const started = performance.now();
  const lookup = await sdk.promises.lookupResources(v1.LookupResourcesRequest.create({
    consistency: { requirement: { oneofKind: 'fullyConsistent', fullyConsistent: true } },
    resourceObjectType: 'project', permission: 'view', subject: { object: { objectType: 'user', objectId: user } },
  }));
  const elapsed = performance.now() - started;
  console.info(`E-016: LookupResources over 200 projects: ${elapsed.toFixed(1)}ms.`);
  expect(elapsed).toBeLessThan(100);
  expect(lookup.map((item) => item.resourceObjectId).sort()).toEqual(projects.slice(0, 150).sort());
});
