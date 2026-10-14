import {PostgresEntitlementReader} from '../src/modules/entitlements/infrastructure/entitlement-read.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {queryFixture,unwrap} from './fixtures/query/fixture.js';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import {ObjectId,PoolId} from '../src/shared/kernel/index.js';
import {withTenant} from '../src/platform/db/scope.js';
it('ROW-SCALE exclusive counts, latest override words, bounded cursor pages, search and count-only unscoped',async()=>{
 const f=await queryFixture();try{
  const repo=new PostgresRowDecisions(),other=PoolId(randomUUID());
  const [object]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]));
  const first=unwrap(await repo.save(f.ctx,f.pool,ObjectId(object!.id),'field_1 >= 1'));
  const latest=unwrap(await repo.save(f.ctx,f.pool,ObjectId(object!.id),'field_1 >= 2'));
  await withTenant(f.ctx,async tx=>{
   await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Other')",[other,f.ctx.projectId]);
   await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[other,f.source,f.ctx.projectId]);
   await tx.query(`INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) SELECT $1,$2,'public','object_'||n,'table','public','object_'||n FROM generate_series(1,204) n`,[f.ctx.projectId,f.source]);
   await tx.query(`INSERT INTO row_entitlement(project_id,object_id,pool_id,expression,predicate,predicate_hash,columns,actor_id,level) SELECT $1,o.id,CASE WHEN o.exposed_name IN('object_201','object_202') THEN $2::uuid WHEN o.exposed_name='object_203' THEN $3::uuid ELSE NULL END,d.expression,d.predicate,d.predicate_hash,d.columns,$4,CASE WHEN o.exposed_name IN('object_201','object_202','object_203') THEN 'pool_override' ELSE 'object_default' END FROM catalog_object o CROSS JOIN row_entitlement d WHERE o.source_id=$5 AND o.id<>$6 AND o.exposed_name<>'object_204' AND d.id=$7`,[f.ctx.projectId,f.pool,other,f.ctx.userId,f.source,object!.id,first.id]);
  });
  const overrides=unwrap(await repo.objects(f.ctx,f.pool,{status:'overridden',search:''}));
  expect(overrides.counts).toEqual({missing:1,overridden:3,inherited:200,unscoped:1});expect(overrides.items).toHaveLength(3);
  expect(overrides.items.find(o=>o.id===object!.id)?.decision).toMatchObject({id:latest.id,words:'field_1 is at least 2'});
  expect(overrides.items.every(o=>o.sourceId===f.source&&o.sourceName.length>0)).toBe(true);
  const ids=new Set<string>();let cursor:string|undefined;let pages=0;
  do{const page=unwrap(await repo.objects(f.ctx,f.pool,{status:'inherited',search:'',...(cursor?{cursor}:{})}));expect(page.items).toHaveLength(50);for(const o of page.items){expect(ids.has(o.id)).toBe(false);ids.add(o.id);}cursor=page.nextCursor??undefined;pages++;}while(cursor);
  expect(pages).toBe(4);expect(ids.size).toBe(200);
  const search=unwrap(await repo.objects(f.ctx,f.pool,{status:'all',search:'OBJECT_203'}));expect(search.items.map(o=>o.status)).toEqual(['missing']);expect(search.counts).toEqual(overrides.counts);
  expect(unwrap(await repo.objects(f.ctx,f.pool,{status:'unscoped',search:''})).items).toEqual([]);
 }finally{await f.close();}
});

it('ROW-SCALE no-default override composes alone and leaves the no-row-filter catalogue selection',async()=>{
 const f=await queryFixture();try{
  const repo=new PostgresRowDecisions(),reader=new PostgresEntitlementReader();
  const [object]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]));
  const o=ObjectId(object!.id),filter={projectId:f.ctx.projectId,rowFilter:'unscoped' as const,decision:'all' as const,mode:'table' as const,prefix:''};
  const tree={parent:`${f.source}:public`,prefix:'',undecided:false,after:null,limit:50,rowFilter:'unscoped' as const};
  const before=unwrap(await repo.objects(f.ctx,f.pool,{status:'all',search:''}));expect(before.projectHasDefault).toBe(false);expect(before.items).toContainEqual(expect.objectContaining({id:o,status:'unscoped',hasDefault:false}));
  expect(unwrap(await reader.groups(f.ctx,f.pool,filter,null,50)).items).toHaveLength(1);
  expect(unwrap(await reader.members(f.ctx,f.pool,filter,null,50)).items.length).toBeGreaterThan(0);
  expect(unwrap(await reader.tree(f.ctx,f.pool,tree)).map(r=>r.node.id)).toContain(o);
  const decision=unwrap(await repo.save(f.ctx,f.pool,o,'field_1 >= 3','pool_override'));
  expect(unwrap(await repo.read(f.ctx,f.pool,o))).toMatchObject({objectDefault:null,current:{id:decision.id,level:'pool_override'},effectiveExpression:'(field_1 >= 3)'});
  const answer=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records ORDER BY field_1')).structuredContent);
  expect(answer.rows).toEqual([[3],[4],[5],[6],[7]]);expect(answer.rowScopes?.[0]?.decisionIds).toEqual([decision.id]);
  const after=unwrap(await repo.objects(f.ctx,f.pool,{status:'all',search:''}));expect(after.projectHasDefault).toBe(false);expect(after.items).toContainEqual(expect.objectContaining({id:o,status:'overridden',hasDefault:false}));
  expect(unwrap(await reader.groups(f.ctx,f.pool,filter,null,50)).items).toEqual([]);
  expect(unwrap(await reader.members(f.ctx,f.pool,filter,null,50)).items).toEqual([]);
  expect(unwrap(await reader.tree(f.ctx,f.pool,tree))).toEqual([]);
 }finally{await f.close();}
});
