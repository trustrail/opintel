import { once } from 'node:events';
import { createHttpServer } from '../src/platform/http/index.js';
import { introspectionRoutes } from '../src/modules/sources/api/introspection-routes.js';
import { PostgresIntrospectionQuery } from '../src/modules/sources/infrastructure/introspection-query.js';
import { IntrospectionRunView,IntrospectionRunList } from '../src/shared/api/introspection.js';
import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { IntrospectionJob, PostgresIntrospectionStore, runStates, transitions, transitionRun, enforceTransition, type SourceConnector, type CatalogSnapshot } from '../src/modules/sources/index.js';
import { ProjectId, UserId, SourceId, Timestamp, UuidV7IdFactory, DomainError, ok, err, type Result } from '../src/shared/kernel/index.js';

import type { AuthorizationPort, AuthorizationRevision } from '../src/modules/authz/index.js';

const ctx = { userId: UserId(randomUUID()), projectId: ProjectId(randomUUID()) };
const sourceId = SourceId(randomUUID());
const otherProject = ProjectId(randomUUID());
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
function snapshot(name='label',sourceType='text'): CatalogSnapshot {
  return { takenAt: Timestamp(new Date()), objects: [{ schema:'public',name:'orders',kind:'table',rowEstimate:1,
    columns:[{sourceIdentifier:name,stableRef:'1',ordinal:1,sourceType,nullable:true,isKey:false,description:null}] }],foreignKeys:[] };
}
const store = new PostgresIntrospectionStore(new UuidV7IdFactory());
let discovery: CatalogSnapshot;
let connector: SourceConnector;
let job: IntrospectionJob;
const run = async () => {
  const queued = unwrap(await job.enqueue(ctx,sourceId));
  return unwrap(await job.execute(ctx,queued.id));
};
const catalog = () => withTenant(ctx,async (tx) => ({
  objects:await tx.query('SELECT * FROM catalog_object ORDER BY id'), elements:await tx.query('SELECT * FROM catalog_element ORDER BY id'),
}));
resetDatabaseBeforeEach('company');
beforeEach(async () => {
  await withPlatform(async (tx) => {
    const [industry] = await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');
    const [company] = await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Introspection tests','eu-west-1') RETURNING id");
    if (industry===undefined || company===undefined) throw new Error('Missing fixture.');
    await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$3,$4,'Source A','eu-west-1'),($2,$3,$4,'Source B','eu-west-1')",[ctx.projectId,otherProject,company.id,industry.id]);
  });
  await withTenant(ctx,(tx) => tx.query("INSERT INTO data_source(id,project_id,kind,name,credential_ref,status,exposed_alias) VALUES($1,$2,'postgres','Warehouse','secret://test/source','connected','warehouse')",[sourceId,ctx.projectId]));
  discovery=snapshot();
  connector={kind:'postgres',testConnection:async()=>ok(undefined),introspect:async()=>ok(discovery),sampleTopValues:async()=>ok(new Map()),estimateRowCount:async()=>ok(null)};
  job=new IntrospectionJob(store,()=>connector);
});


let server:ReturnType<typeof createHttpServer>;let origin:string;let allowed=true;let canCancel=true;let checked:string[]=[];
beforeEach(async()=>{
 allowed=true;canCancel=true;checked=[];const unexpected=async():Promise<never>=>{throw new Error('Unexpected authorization call');};
 const authorization:AuthorizationPort={check:async request=>{checked.push(request.permission);expect(['view','bind_source']).toContain(request.permission);return {allowed:allowed&&(request.permission==='view'||canCancel),token:'test' as AuthorizationRevision,checkedAt:Timestamp(new Date()),snapshotAgeMs:0};},checkMany:unexpected,write:unexpected,explain:unexpected};
 server=createHttpServer(introspectionRoutes(new PostgresIntrospectionQuery(store)),{authorization:{port:authorization,currentUser:async()=>({id:ctx.userId,email:'test@example.com',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})},logger:{error:()=>{}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error();origin=`http://127.0.0.1:${address.port}`;
});
afterEach(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});
async function request(path:string,method='GET',project=ctx.projectId){return fetch(`${origin}/api/v1/projects/${project}${path}`,{method,headers:{'content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})});}
async function view(id:string){const response=await request(`/introspections/${id}`);expect(response.status).toBe(200);return IntrospectionRunView.parse(await response.json());}
it('G-003 to G-009: exposes durable diff facts, empty reruns and type-family breaking changes',async()=>{
 const first=await run();expect((await view(first.id)).diff?.some(d=>d.change==='added')).toBe(true);
 expect((await view((await run()).id)).diff).toEqual([]);
 discovery=snapshot('renamed');const renamed=await run();expect((await view(renamed.id)).diff).toContainEqual(expect.objectContaining({change:'renamed',exposedName:'label',before:'label',after:'renamed',breaking:false}));
 discovery=snapshot('renamed','varchar(50)');await run();discovery=snapshot('renamed','varchar(100)');const widened=await view((await run()).id);expect(widened.diff).toContainEqual(expect.objectContaining({change:'type_changed',before:'varchar(50)',after:'varchar(100)',breaking:false}));
 discovery=snapshot('renamed','integer');const changed=await view((await run()).id);expect(changed.diff).toContainEqual(expect.objectContaining({change:'type_changed',before:'varchar(100)',after:'integer',breaking:true}));
 discovery=snapshot('again','integer');discovery.objects[0]!.columns[0]!.stableRef=null;const replaced=await view((await run()).id);expect(replaced.diff?.map(d=>d.change)).toEqual(expect.arrayContaining(['removed','added']));
 expect((await view(renamed.id)).diff).toContainEqual(expect.objectContaining({before:'label',after:'renamed',exposedName:'label'}));
});
it('scopes reads, checks permissions, and binds cursor pagination to project and source',async()=>{
 const first=await run();await run();const response=await request(`/sources/${sourceId}/introspections?limit=1`);const page=IntrospectionRunList.parse(await response.json());expect(page.items).toHaveLength(1);expect(page.nextCursor).not.toBeNull();
 const next=IntrospectionRunList.parse(await (await request(`/sources/${sourceId}/introspections?limit=1&cursor=${page.nextCursor}`)).json());expect(next.items[0]?.id).toBe(first.id);expect(next.nextCursor).toBeNull();
 expect((await request(`/introspections/${first.id}`,'GET',otherProject)).status).toBe(404);
 expect((await request(`/sources/${sourceId}/introspections`,'GET',otherProject)).status).toBe(404);
 expect((await request(`/sources/${sourceId}/introspections?cursor=${page.nextCursor}`,'GET',otherProject)).status).toBe(400);
 canCancel=false;expect((await request(`/introspections/${first.id}/cancel`,'POST')).status).toBe(403);
 allowed=false;expect((await request(`/introspections/${first.id}`)).status).toBe(404);expect((await request(`/introspections/${first.id}/cancel`,'POST')).status).toBe(404);
});
it.each(['queued','connecting','reading','diffing','complete','failed','cancelled'] as const)('cancel in %s follows the state machine and names a conflict',async state=>{
 const queued=unwrap(await job.enqueue(ctx,sourceId));await withTenant(ctx,tx=>tx.query('UPDATE introspection_run SET state=$2 WHERE id=$1',[queued.id,state]));
 const response=await request(`/introspections/${queued.id}/cancel`,'POST');expect(checked).toContain('bind_source');
 if(['queued','connecting','reading'].includes(state)){expect(response.status).toBe(200);expect(IntrospectionRunView.parse(await response.json()).state).toBe('cancelled');}
 else{expect(response.status).toBe(409);expect(await response.json()).toMatchObject({error:{message:`Cannot cancel an introspection run in state ${state}.`}});}
});

it('3.16: emits state-only notifications after commit, never for a refused transition',async()=>{
 const observed:Array<{projectId:ProjectId;expected:string;persisted:string|undefined}>=[];
 const publish=vi.fn(async(projectId:ProjectId,event:import('../src/shared/api/stream.js').ProjectChange)=>{
  if(event.type==='introspection.progress'||event.type==='introspection.finished'){
   const [persisted]=await withTenant(ctx,tx=>tx.query<{state:string}>('SELECT state FROM introspection_run WHERE id=$1',[event.runId]));
   observed.push({projectId,expected:event.state,persisted:persisted?.state}); // A separate scope sees the committed state.
  }
 });
 const emitting=new PostgresIntrospectionStore(new UuidV7IdFactory(),{publish});
 const live=new IntrospectionJob(emitting,()=>connector);
 const queued=unwrap(await live.enqueue(ctx,sourceId));
 unwrap(await live.execute(ctx,queued.id));
 for(const value of observed){expect(value.projectId).toBe(ctx.projectId);expect(value.persisted).toBe(value.expected);}
 expect(observed).toHaveLength(5);
 expect(publish.mock.calls.map(([,event])=>event.type)).toEqual(['introspection.progress','introspection.progress','introspection.progress','introspection.progress','introspection.finished','source.changed','catalog.changed']);
 publish.mockClear();expect((await emitting.cancel(ctx,queued.id,true)).ok).toBe(false);expect(publish).not.toHaveBeenCalled();
});
