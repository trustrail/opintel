import type { v1 } from '@authzed/authzed-node';
import { DatabaseOwner, databasePhase } from './database-deadline.js';

let warmed: Promise<void> | undefined;
let lookupClient: ReturnType<typeof v1.NewClient> | undefined;

export function warmedLookupClient(): ReturnType<typeof v1.NewClient> {
  if (!lookupClient) throw new Error('Performance warm-up must finish before LookupResources is measured.');
  return lookupClient;
}

export function closePerformanceLookupClient(): void { lookupClient?.close(); lookupClient=undefined; }

export function warmPerformanceProcess(): Promise<void> {
  return warmed ??= warm();
}

async function warm(): Promise<void> {
  console.info('Performance warm-up (unmeasured): Engine sessions, connection pools, authenticated query, durable evidence write/read, and LookupResources. Timings discarded.');
  // Import after setup has bound DATABASE_URL to the isolated test database.
  const [{queryFixture}, {PostgresEvidenceWriter, PostgresEvidenceReader}, {v1}] = await Promise.all([
    import('../../test/fixtures/query/fixture.js'),
    import('../../src/modules/evidence/index.js'),
    import('@authzed/authzed-node'),
  ]);
  const owner = new DatabaseOwner();
  const deadline = performance.now() + 60_000;
  owner.deadline = () => deadline;
  const signal = AbortSignal.timeout(60_000);
  try {
    await databasePhase(owner, signal, async () => {
      const f = await queryFixture(new PostgresEvidenceWriter());
      try {
        const response = await f.client.callTool({name:'opintel.query',arguments:{sql:'SELECT field_1,field_2 FROM warehouse.public.records ORDER BY field_1'}}, undefined, {signal});
        if (response.isError) throw new Error('Performance warm-up authenticated query/evidence write failed.');
        const evidence = await new PostgresEvidenceReader().list(f.ctx, {poolId:f.pool}, null, 51);
        if (!evidence.ok || evidence.value.length !== 1) throw new Error('Performance warm-up durable evidence read failed.');
        const endpoint = process.env.SPICEDB_ENDPOINT, token = process.env.SPICEDB_TOKEN;
        if (!endpoint || !token) throw new Error('SpiceDB is required for performance warm-up.');
        lookupClient = v1.NewClient(token, endpoint, v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED);
        await lookupClient.promises.lookupResources(v1.LookupResourcesRequest.create({
          consistency:{requirement:{oneofKind:'fullyConsistent',fullyConsistent:true}},
          resourceObjectType:'project',permission:'view',subject:{object:{objectType:'user',objectId:f.ctx.userId}},
        }));
      } finally { await f.close(); }
    });
  } catch (error) {
    lookupClient?.close();
    throw error;
  } finally {
    owner.abort();
    if (owner.hasPendingWork()) await owner.drain();
  }
  console.info('Performance warm-up complete. All subsequent budgeted measurements are steady-state; per-request Engine construction and new fixture/data costs remain included where measured.');
}
