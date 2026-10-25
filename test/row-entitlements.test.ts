import {randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import {PostgresEvidenceWriter,PostgresEvidenceReader} from '../src/modules/evidence/index.js';
import {PostgresDashboardReader} from '../src/modules/tenancy/infrastructure/dashboard.js';
import {ObjectId,PoolId,RunId,type Result} from '../src/shared/kernel/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {queryFixture} from './fixtures/query/fixture.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
async function object(f:Awaited<ReturnType<typeof queryFixture>>){const [o]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]));return ObjectId(o!.id);}
it('ROW-003 clear pushdown, tokenized and hidden inputs filter before treatment; no raw scope values enter the receipt',async()=>{
 const f=await queryFixture(new PostgresEvidenceWriter());try{
  const o=await object(f),repo=new PostgresRowDecisions(),plain=vi.spyOn(f.stagingSource,'plain'),treated=vi.spyOn(f.stagingSource,'treated');
  unwrap(await repo.save(f.ctx,f.pool,o,'field_1 >= 3'));
  const clear=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records ORDER BY field_1')).structuredContent);expect(clear.rows).toEqual([[3],[4],[5],[6],[7]]);expect(treated.mock.calls[0]?.[0].object.readPlan.rowScope?.pushdown).toBe(true);
  const decision=unwrap(await repo.save(f.ctx,f.pool,o,'field_2 IN (1002, 1004)'));
  const answer=QueryOutput.parse((await f.query('SELECT field_1,field_2 FROM warehouse.public.records ORDER BY field_1')).structuredContent);expect(answer.rows.map(r=>r[0])).toEqual([2,4]);expect(answer.rows.every(r=>String(r[1]).startsWith('v1_customer_'))).toBe(true);expect(answer.rowScopes).toMatchObject([{decisionId:decision.id,hash:decision.hash,columns:['field_2'],returnedRows:2,provenance:'agent credential'}]);expect(JSON.stringify(answer)).not.toContain('1002');expect(plain).not.toHaveBeenCalled();
  unwrap(await repo.save(f.ctx,f.pool,o,"field_5 = 'WITHHELD_SENTINEL' AND field_6 = 'UNDECIDED_SENTINEL'"));
  const hidden=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);expect(hidden.rows).toHaveLength(7);expect(JSON.stringify(hidden)).not.toContain('SENTINEL');
  const [run]=await withTenant(f.ctx,tx=>tx.query<{at:string}>('SELECT started_at::text AS at FROM query_run WHERE id=$1',[answer.evidenceId]));const evidence=unwrap(await new PostgresEvidenceReader().detail(f.ctx,RunId(answer.evidenceId),run!.at));expect(evidence.metadata.rowScopes?.[0]?.decisionId).toBe(decision.id);expect(JSON.stringify(evidence)).not.toContain('1002');
 }finally{await f.close();}
});
it('ROW-004 scoped object with no pool predicate admits zero, records the cause and has one actionable finding',async()=>{
 const f=await queryFixture(new PostgresEvidenceWriter());try{
  const o=await object(f),other=PoolId(randomUUID());await withTenant(f.ctx,async tx=>{await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Other')",[other,f.ctx.projectId]);await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[other,f.source,f.ctx.projectId]);});
  unwrap(await new PostgresRowDecisions().save(f.ctx,other,o,'field_1 > 0'));
  const source=vi.spyOn(f.stagingSource,'estimate');const answer=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);expect(answer.rows).toEqual([]);expect(answer.rowScopes).toMatchObject([{missingDecision:true,returnedRows:0,decisionId:null}]);expect(source).not.toHaveBeenCalled();
  const findings=unwrap(await new PostgresDashboardReader().feed(f.ctx,null,100));expect(findings.filter(finding=>finding.kind==='row_scope_missing'&&finding.poolId===f.pool)).toHaveLength(1);
  unwrap(await new PostgresRowDecisions().save(f.ctx,f.pool,o,'field_1 > 0'));expect(unwrap(await new PostgresDashboardReader().feed(f.ctx,null,100)).filter(finding=>finding.kind==='row_scope_missing'&&finding.poolId===f.pool)).toHaveLength(0);
 }finally{await f.close();}
});
it('ROW-005 aggregate-only groups and disclosure thresholds operate within scope',async()=>{
 const f=await queryFixture();try{
  const o=await object(f),repo=new PostgresRowDecisions();unwrap(await repo.save(f.ctx,f.pool,o,'field_1 <= 6'));
  const answer=await f.query('SELECT SUM(field_3) FROM warehouse.public.records');expect(answer.isError,JSON.stringify(answer)).not.toBe(true);expect(QueryOutput.parse(answer.structuredContent).rows).toEqual([['60']]);
  unwrap(await repo.save(f.ctx,f.pool,o,'field_1 <= 2'));expect((await f.query('SELECT SUM(field_3) FROM warehouse.public.records')).isError).toBe(true);
 }finally{await f.close();}
});
it('ROW-006 immutable decisions, exactly one first-scoping event, scope references refused and literal/type changes fail closed',async()=>{
 const f=await queryFixture();try{
  const o=await object(f),repo=new PostgresRowDecisions();expect(await repo.save(f.ctx,f.pool,o,'field_1 IN scope(customer)')).toMatchObject({ok:false,error:{message:'scope references arrive in step 3'}});
  const first=unwrap(await repo.save(f.ctx,f.pool,o,'field_1 >= 1')),second=unwrap(await repo.save(f.ctx,f.pool,o,'field_1 >= 2'));expect(first.firstScoping).toBe(true);expect(second.firstScoping).toBe(false);
  const summary=unwrap(await new PostgresEvidenceReader().summary(f.ctx,{}));expect(summary.scopingEvents).toMatchObject([{decisionId:first.id}]);expect(summary.scopingEvents).toHaveLength(1);
  await expect(withTenant(f.ctx,tx=>tx.query('UPDATE row_entitlement SET expression=expression'))).rejects.toMatchObject({code:'42501'});
  await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET exposed_type='VARCHAR' WHERE id=$1",[f.ids[0]]));expect((await f.query('SELECT field_1 FROM warehouse.public.records')).isError).toBe(true);
 }finally{await f.close();}
});

it('ROW-009 unscoped receipt JSON and full evidence omit rowScopes entirely',async()=>{
 const f=await queryFixture(new PostgresEvidenceWriter());try{
  const reply=await f.query('SELECT field_1 FROM warehouse.public.records');expect(reply.isError).not.toBe(true);
  const receipt=JSON.parse(JSON.stringify(reply.structuredContent)) as Record<string,unknown>;expect(Object.hasOwn(receipt,'rowScopes')).toBe(false);
  const [stored]=await withTenant(f.ctx,tx=>tx.query<{source_plan:Record<string,unknown>}>('SELECT c.source_plan FROM run_completion c JOIN query_run r ON r.id=c.run_id AND r.started_at=c.started_at WHERE r.id=$1',[QueryOutput.parse(receipt).evidenceId]));
  expect(Object.hasOwn(stored!.source_plan,'rowScopes')).toBe(false);
  expect(JSON.stringify(reply)).not.toContain('rowScopes');
 }finally{await f.close();}
});

it('DEP-009: operator row provisioning preserves an intervening immutable decision',async()=>{
 const f=await queryFixture();try{const o=await object(f),repo=new PostgresRowDecisions();const first=unwrap(await repo.save(f.ctx,f.pool,o,'field_1 > 3'));
 expect(await new PostgresRowDecisions(true).save(f.ctx,f.pool,o,'field_1 > 0')).toMatchObject({ok:false,error:{code:'conflict'}});
 expect(unwrap(await repo.read(f.ctx,f.pool,o)).current?.id).toBe(first.id);
 expect(unwrap(await repo.history(f.ctx,f.pool,o,null)).items).toHaveLength(1);
 }finally{await f.close();}
});
