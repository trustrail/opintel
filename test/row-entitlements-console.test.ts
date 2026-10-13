import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {queryFixture,unwrap} from './fixtures/query/fixture.js';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import {rowDecisionRoutes} from '../src/modules/entitlements/api/row-routes.js';
import {PostgresRowPreview} from '../src/modules/entitlements/infrastructure/row-preview.js';
import {PostgresEvidenceWriter} from '../src/modules/evidence/index.js';
import {ObjectId,PoolId} from '../src/shared/kernel/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {PostgresColumnTags} from '../src/modules/catalog/infrastructure/column-tags.js';
async function object(f:Awaited<ReturnType<typeof queryFixture>>){const [o]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]));return ObjectId(o!.id);}
it('ROW-2B catalogue tags are stored by domain without changing row scope or treatments',async()=>{
 const f=await queryFixture();try{const tags=new PostgresColumnTags();expect(unwrap(await tags.read(f.ctx,f.ids[0]!)).tags).toEqual({});expect(unwrap(await tags.save(f.ctx,f.ids[0]!,{customer:'customer_id'})).tags).toEqual({customer:'customer_id'});expect(unwrap(await tags.read(f.ctx,f.ids[0]!)).tags).toEqual({customer:'customer_id'});const answer=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);expect(answer.rows).toHaveLength(7);expect(answer).not.toHaveProperty('rowScopes');}finally{await f.close();}
});
it('ROW-2B composition, default inheritance, all receipt contributors and preview subset/evidence',async()=>{
 const evidence=new PostgresEvidenceWriter(),f=await queryFixture(evidence);try{
  const o=await object(f),repo=new PostgresRowDecisions();
  const base=unwrap(await repo.save(f.ctx,f.pool,o,'field_1 >= 3','object_default'));
  const inherited=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records ORDER BY field_1')).structuredContent);expect(inherited.rows).toEqual([[3],[4],[5],[6],[7]]);
  const override=unwrap(await repo.save(f.ctx,f.pool,o,'field_1 <= 5','pool_override'));
  const answer=QueryOutput.parse((await f.query('SELECT field_1,field_2,field_4 FROM warehouse.public.records ORDER BY field_1')).structuredContent);expect(answer.rows.map(r=>r[0])).toEqual([3,4,5]);expect(answer.rowScopes?.[0]?.decisionIds).toEqual([base.id,override.id]);
  const preview=unwrap(await new PostgresRowPreview(f.execution,evidence).run(f.ctx,f.pool,o,'field_1 <= 5','pool_override'));expect(preview.total).toBe(7);expect(preview.entitled).toBe(3);expect(preview.rows).toEqual(answer.rows);expect(JSON.stringify(preview)).not.toContain('WITHHELD_SENTINEL');
  const [record]=await withTenant(f.ctx,tx=>tx.query<{plan:{rowPreview:{actorId:string;predicateHash:string}}}>('SELECT source_plan AS plan FROM run_completion WHERE run_id=$1',[preview.receiptId]));expect(record!.plan.rowPreview.actorId).toBe(f.ctx.userId);expect(record!.plan.rowPreview.predicateHash).toBe(answer.rowScopes?.[0]?.hash);
  const read=unwrap(await repo.read(f.ctx,f.pool,o));expect(read.objectDefault?.id).toBe(base.id);expect(read.pools).toContainEqual({id:f.pool,name:read.pools.find(p=>p.id===f.pool)!.name,status:'overridden'});
 }finally{await f.close();}
});
it('ROW-2B aggregate-only preview suppresses a small count and never returns samples or aggregate values',async()=>{
 const evidence=new PostgresEvidenceWriter(),f=await queryFixture(evidence);try{
  const o=await object(f);await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='aggregate_only',mask_kind=NULL WHERE pool_id=$1",[f.pool]));
  const preview=unwrap(await new PostgresRowPreview(f.execution,evidence).run(f.ctx,f.pool,o,'field_1 <= 2','pool_override'));expect(preview).toMatchObject({total:7,entitled:null,belowThreshold:true,rows:[]});expect(preview.aggregateColumns.length).toBeGreaterThan(0);
 }finally{await f.close();}
});
it('ROW-2B existing override does not make a missing pool unscoped',async()=>{
 const f=await queryFixture();try{const o=await object(f),other=PoolId(randomUUID());await withTenant(f.ctx,async tx=>{await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Other')",[other,f.ctx.projectId]);await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[other,f.source,f.ctx.projectId]);});unwrap(await new PostgresRowDecisions().save(f.ctx,other,o,'field_1 > 0'));const answer=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);expect(answer.rows).toEqual([]);expect(answer.rowScopes?.[0]?.missingDecision).toBe(true);}finally{await f.close();}
});
it('ROW-2B custody preview seals inside the Engine without a grant or escrow and orders by a hidden primary key',async()=>{
 const evidence=new PostgresEvidenceWriter(),f=await queryFixture(evidence,{releaseCustody:true});try{
  const o=await object(f);await f.db(`UPDATE ${f.schema}.records SET field_5='WITHHELD_SENTINEL_' || (8-field_1)::text`);await f.db(`ALTER TABLE ${f.schema}.records ADD PRIMARY KEY(field_5,field_1)`);
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody',mask_kind=NULL WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[3]]));
  const preview=unwrap(await new PostgresRowPreview(f.execution,evidence).run(f.ctx,f.pool,o,'field_1 >= 3','pool_override'));
  expect(preview.rows.map(row=>row[0])).toEqual([7,6,5,4,3]);expect(preview.custodyColumns).toEqual(['field_4']);expect(preview.rows.every(row=>String(row[2]).startsWith('opintelsealed:v1:'))).toBe(true);expect(JSON.stringify(preview)).not.toContain('large');expect(JSON.stringify(preview)).not.toContain('WITHHELD_SENTINEL');
  const grants=await withTenant(f.ctx,tx=>tx.query('SELECT id FROM release_grant'));expect(grants).toEqual([]);
 }finally{await f.close();}
});

it('ROW-2B internal preview is absent from MCP tools and describe and cannot be called by a pool credential',async()=>{
 const f=await queryFixture();try{
  const routes=rowDecisionRoutes(new PostgresRowDecisions(),new PostgresRowPreview(f.execution,new PostgresEvidenceWriter()));
  expect(routes.find(route=>route.path.endsWith('/preview'))?.permission).toMatchObject({resource:'project',permission:'set_entitlement'});
  const tools=await f.client.listTools();expect(tools.tools.map(t=>t.name)).toEqual(['opintel.describe','opintel.explain','opintel.query']);
  const description=await f.client.callTool({name:'opintel.describe',arguments:{}});expect(description.isError).not.toBe(true);
  expect(JSON.stringify(description)).not.toMatch(/preview-rows|opintel\.preview|rowPreview/u);
  await expect(f.client.callTool({name:'opintel.preview-rows',arguments:{}})).rejects.toThrow();
 }finally{await f.close();}
});
