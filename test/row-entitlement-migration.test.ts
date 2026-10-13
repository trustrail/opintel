import {Client} from 'pg';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {queryFixture,unwrap} from './fixtures/query/fixture.js';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import {PostgresEvidenceWriter} from '../src/modules/evidence/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {ObjectId} from '../src/shared/kernel/index.js';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {migrationChainInTransaction} from './migration-chain.js';
resetDatabaseBeforeEach('company');
// Migration round trips are functional; the guard grows with the schema chain.
it('ROW-007 seeded forward/revert, explicit grants, destructive downgrade refused',async()=>{
 const f=await queryFixture(new PostgresEvidenceWriter()),db=new Client({connectionString:process.env.TEST_DATABASE_URL});
 try{
  const [object]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]));
  const decision=unwrap(await new PostgresRowDecisions().save(f.ctx,f.pool,ObjectId(object!.id),'field_1 >= 1'));
  expect(decision.firstScoping).toBe(true);
  expect((await f.query('SELECT field_1 FROM warehouse.public.records')).isError).not.toBe(true);
  await db.connect();await db.query('BEGIN');
  const chain=await migrationChainInTransaction(db);
  expect(await chain.unwindAfter('074')).toEqual(chain.before.filter(m=>m.version>'074').map(m=>m.version).reverse());
  const down=await readFile('migrations/074_row_entitlements.down.sql','utf8'),up=await readFile('migrations/074_row_entitlements.up.sql','utf8');
  const refused=async()=>{await db.query('SAVEPOINT refuse');await expect(db.query(down)).rejects.toThrow('Cannot downgrade while row decision or scoping history exists');await db.query('ROLLBACK TO SAVEPOINT refuse');};
  await refused();
  // Exercise retained receipt history independently of the decision/event row.
  await db.query(`INSERT INTO evidence_rollup(id,started_at,project_id,pool_id,agent_id,key_prefix,mode,versions,outcome,token_key_version_used,latency_ms,synthetic,completed_at,minimum_retention_days,capture_percent,capture_selected,detail_captured,redactions,treatment_counts,source_treatment_counts)
   SELECT r.id,r.started_at,r.project_id,r.pool_id,r.agent_id,r.key_prefix,r.mode,r.versions,c.outcome,c.token_key_version_used,c.latency_ms,c.synthetic,c.completed_at,1,r.capture_percent,r.capture_selected,c.detail_captured,'[]','{}','{}'
   FROM query_run r JOIN run_completion c ON c.run_id=r.id AND c.started_at=r.started_at WHERE r.project_id=$1`,[f.ctx.projectId]);
  expect((await db.query('SELECT row_scopes IS NOT NULL AS retained FROM evidence_rollup')).rows).toEqual([{retained:true}]);
  // Test-owner cleanup only, inside the rolled-back transaction. Product grants
  // still forbid deleting decisions or receipts; no migration bypass is added.
  await db.query('TRUNCATE row_entitlement');await refused();
  await db.query('TRUNCATE evidence_rollup');
  await db.query(down);expect((await db.query("SELECT to_regclass('row_entitlement') AS relation")).rows).toEqual([{relation:null}]);
  await db.query(up);
  expect((await db.query("SELECT has_table_privilege('opintel_app','row_entitlement','SELECT') AS read,has_table_privilege('opintel_app','row_entitlement','INSERT') AS write,has_table_privilege('opintel_app','row_entitlement','DELETE') AS remove")).rows).toEqual([{read:true,write:true,remove:false}]);
  expect((await chain.restore()).map(({version,name,checksum})=>({version,name,checksum}))).toEqual(chain.before.map(({version,name,checksum})=>({version,name,checksum})));
 }finally{await db.query('ROLLBACK').catch(()=>{});await db.end();await f.close();}
},60000);
