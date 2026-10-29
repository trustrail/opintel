import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {it,expect} from 'vitest';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {PoolId,ObjectId,Timestamp,ElementId} from '../src/shared/kernel/index.js';
import {PostgresNeedsYouReader} from '../src/modules/tenancy/index.js';
import {needsYouRoutes} from '../src/modules/tenancy/api/needs-you-routes.js';
import {NeedsYouPage,needsYouOpenApiDocument} from '../src/shared/api/needs-you.js';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import {PostgresFilingRegister} from '../src/modules/ingest/infrastructure/register.js';
import {FilingId} from '../src/shared/kernel/index.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {allowBulk} from './fixtures/bulk-entitlements/fixture.js';
const reader=new PostgresNeedsYouReader();
it('NY-001/003/007: undecided groups, missing settings and saved check facts change only through their owning records',async()=>{
 const f=await policyFixture(3);
 let rows=unwrap(await reader.read(f.ctx,false,null,100));
 expect(rows.filter(r=>r.kind==='undecided_entitlement').map(r=>r.count)).toEqual([1,1,1]);
 expect(rows.filter(r=>r.kind==='setting_required').map(r=>r.id).sort()).toEqual(['setting:query.concurrencyPerPool','setting:query.memoryLimitMb','setting:query.rowLimit','setting:query.timeoutSeconds']);
 expect(rows).toContainEqual(expect.objectContaining({id:'check:engine-required',kind:'check_required'}));
 const duplicate=ElementId(randomUUID());
 await withTenant(f.ctx,async tx=>{const [object]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','second','table','public','second') RETURNING id",[f.ctx.projectId,f.source]);await tx.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type) VALUES($1,$2,$3,'field_1','text','field_1','VARCHAR')",[duplicate,f.ctx.projectId,object!.id]);});
 expect(unwrap(await reader.read(f.ctx,false,null,100)).filter(r=>r.kind==='undecided_entitlement').map(r=>r.count)).toEqual([2,1,1]);
 await f.set('withheld',randomUUID(),[f.ids[0]!,duplicate]);
 await withTenant(f.ctx,tx=>tx.query("SELECT save_project_settings($1)",[{query:{timeoutSeconds:30,rowLimit:100,memoryLimitMb:128,concurrencyPerPool:1},discovery:{valueSampling:false}}]));
 rows=unwrap(await reader.read(f.ctx,false,null,100));expect(rows.filter(r=>r.kind==='undecided_entitlement')).toHaveLength(2);expect(rows.filter(r=>r.kind==='setting_required')).toEqual([]);
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET status='unreachable' WHERE id=$1",[f.source]));expect(unwrap(await reader.read(f.ctx,false,null,100))).toContainEqual(expect.objectContaining({id:'check:source:'+f.source,kind:'check_failed'}));
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET status='connected' WHERE id=$1",[f.source]));expect(unwrap(await reader.read(f.ctx,false,null,100)).some(r=>r.id==='check:source:'+f.source)).toBe(false);
 const failedRun=randomUUID();await withTenant(f.ctx,tx=>tx.query("INSERT INTO introspection_run(id,source_id,project_id,state,error) VALUES($1,$2,$3,'failed','Safe connection failure')",[failedRun,f.source,f.ctx.projectId]));
 expect(unwrap(await reader.read(f.ctx,false,null,100))).toContainEqual(expect.objectContaining({id:'check:source:'+f.source,kind:'check_failed'}));
 await withTenant(f.ctx,tx=>tx.query("UPDATE introspection_run SET state='complete',ended_at=now(),diff='[]' WHERE id=$1",[failedRun]));expect(unwrap(await reader.read(f.ctx,false,null,100)).some(r=>r.id==='check:source:'+f.source)).toBe(false);
 await withTenant(f.ctx,async tx=>{await tx.query('SELECT save_project_settings($1)',[{custody:{provider:'xq',tenant:'test-team'}}]);await tx.query('SELECT record_custody_check($1)',[{binding:'test-binding',passed:false,at:new Date().toISOString(),failure:'authentication_refused',dashboard:{status:'failed',failure:'authentication_refused'}}]);});
 expect(unwrap(await reader.read(f.ctx,false,null,100))).toContainEqual(expect.objectContaining({id:'check:xq-dashboard',kind:'check_failed'}));
});
it('NY-002: an unscoped object is not a missing row decision; an override for another bound pool makes one required',async()=>{
 const f=await policyFixture(2),other=PoolId(randomUUID());
 await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,f.ctx.userId+'@example.test']));
 expect(unwrap(await reader.read(f.ctx,false,null,100)).filter(r=>r.kind==='missing_row_decision')).toEqual([]);
 const [object]=await withTenant(f.ctx,async tx=>{await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Other')",[other,f.ctx.projectId]);await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[other,f.source,f.ctx.projectId]);return tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]);});
 const decisions=new PostgresRowDecisions();unwrap(await decisions.save(f.ctx,other,ObjectId(object!.id),"field_1 <> ''"));
 expect(unwrap(await reader.read(f.ctx,false,null,100)).filter(r=>r.kind==='missing_row_decision')).toMatchObject([{id:'row:'+f.pool+':'+object!.id}]);
 unwrap(await decisions.save(f.ctx,f.pool,ObjectId(object!.id),"field_1 <> ''"));expect(unwrap(await reader.read(f.ctx,false,null,100)).filter(r=>r.kind==='missing_row_decision')).toEqual([]);
});
it('NY-004/005: lifecycle resolution and custody scope match Observations, with no private metadata',async()=>{
 const f=await policyFixture(2),filingId=FilingId(randomUUID()),register=new PostgresFilingRegister();
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET receives_landings=true,landing_strategy='append_as_at' WHERE id=$1",[f.source]));
 const notice={filingId,projectId:f.ctx.projectId,sourceId:f.source,fileSha256:'a'.repeat(64),receivedAt:new Date().toISOString(),revision:1,outcome:'quarantined' as const,partyCode:null,kind:null,period:null,quarantineCategory:'merged_header' as const};unwrap(await register.notice(notice));
 await withTenant(f.ctx,tx=>tx.query("INSERT INTO token_key_version(project_id,version,sentinel_token,state,last_rehearsal,last_rehearsed_at) VALUES($1,1,'PRIVATE_SENTINEL','current','failed',now())",[f.ctx.projectId]));
 let rows=unwrap(await reader.read(f.ctx,false,null,100));expect(rows.filter(r=>r.kind==='observation')).toMatchObject([{title:'The header contains merged cells.'}]);expect(rows.some(r=>r.id.includes('custody_failed')||r.id.startsWith('check:token-key'))).toBe(false);
 rows=unwrap(await reader.read(f.ctx,true,null,100));expect(rows.filter(r=>r.kind==='observation')).toHaveLength(2);expect(rows.some(r=>r.id==='check:token-key:1')).toBe(true);expect(JSON.stringify(rows)).not.toContain('PRIVATE_SENTINEL');
 unwrap(await register.notice({...notice,revision:2,outcome:'landed',quarantineCategory:null}));expect(unwrap(await reader.read(f.ctx,false,null,100)).filter(r=>r.kind==='observation')).toEqual([]);
});
it('NY-004: repeated token attempts form one Suggestion and the latest immutable review determines whether it is open',async()=>{
 const f=await policyFixture(2),a=f.ids[0]!,b=f.ids[1]!,left=a<b?a:b,right=a<b?b:a;
 await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,f.ctx.userId+'@example.test']));
 const id=randomUUID();await withTenant(f.ctx,tx=>tx.query("INSERT INTO token_join_candidate(id,operation,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at) VALUES($1,'explain',$2,$3,$4,$5,'a','b','claimed-agent','PRIVATE_QUERY',now())",[id,f.ctx.projectId,f.pool,left,right]));
 expect(unwrap(await reader.read(f.ctx,false,null,100)).filter(r=>r.kind==='suggestion')).toHaveLength(1);
 for(const action of ['not_sure','reject'] as const){await withTenant(f.ctx,tx=>tx.query('INSERT INTO token_join_review(id,project_id,left_element_id,right_element_id,action,actor_id,latest_attempt_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),f.ctx.projectId,left,right,action,f.ctx.userId,id]));const rows=unwrap(await reader.read(f.ctx,false,null,100));expect(rows.filter(r=>r.kind==='suggestion')).toHaveLength(action==='not_sure'?1:0);expect(JSON.stringify(rows)).not.toContain('PRIVATE_QUERY');}
});
it('NY-005/006: public route pages are complete, isolated and permission-bound; no endpoint can mutate findings',async()=>{
 const f=await policyFixture(3),other=await policyFixture(1);let admin=true,view=true;
 const authorization={...allowBulk,check:async()=>({...await allowBulk.check({resource:{type:'project',id:f.ctx.projectId},permission:'view',subject:{type:'user',id:f.ctx.userId}}),allowed:view}),checkMany:async()=>[{allowed:admin,token:('bulk-test' as Awaited<ReturnType<typeof allowBulk.check>>['token']),checkedAt:Timestamp(new Date()),snapshotAgeMs:0}]};
 const server=createHttpServer(needsYouRoutes(reader,authorization),{authorization:{port:authorization,currentUser:async()=>f.actor}});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');const base=`http://127.0.0.1:${address.port}/api/v1/projects/${f.ctx.projectId}/needs-you`;
 try{
  const items=[];let cursor:string|null=null,firstCursor:string|null=null;
  do{const response=await fetch(base+'?limit=1'+(cursor?'&cursor='+encodeURIComponent(cursor):''));expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const page=NeedsYouPage.parse(await response.json());items.push(...page.items);cursor=page.nextCursor;firstCursor??=cursor;}while(cursor);
  expect(items).toEqual(unwrap(await reader.read(f.ctx,true,null,100)));expect(new Set(items.map(i=>i.id)).size).toBe(items.length);expect(JSON.stringify(items)).not.toContain(other.pool);
  const forged=Buffer.from(JSON.stringify({project:other.ctx.projectId,admin:true,after:''})).toString('base64url');expect((await fetch(base+'?cursor='+forged)).status).toBe(400);
  admin=false;expect((await fetch(base+'?cursor='+firstCursor)).status).toBe(400);view=false;expect((await fetch(base)).status).toBe(404);
  expect(needsYouOpenApiDocument().paths['/api/v1/projects/{id}/needs-you'].get['x-permission']).toBe('project#view');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
