import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import * as scopes from '../src/platform/db/scope.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { IntrospectionJob, PostgresIntrospectionStore, runStates, transitions, transitionRun, enforceTransition, type SourceConnector, type CatalogSnapshot } from '../src/modules/sources/index.js';
import { ProjectId, UserId, SourceId, Timestamp, UuidV7IdFactory, DomainError, ok, err, type Result } from '../src/shared/kernel/index.js';

import type { AuthorizationPort, ZedToken } from '../src/modules/authz/index.js';

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
  await withTenant(ctx,(tx) => tx.query("INSERT INTO data_source(id,project_id,kind,name,credential_ref,status,duckdb_alias) VALUES($1,$2,'postgres','Warehouse','vault://test/source','connected','warehouse')",[sourceId,ctx.projectId]));
  discovery=snapshot();
  connector={kind:'postgres',testConnection:async()=>ok(undefined),introspect:async()=>ok(discovery),sampleTopValues:async()=>ok(new Map()),estimateRowCount:async()=>ok(null)};
  job=new IntrospectionJob(store,()=>connector);
});

describe('introspection job and persisted catalogue',()=>{
  it('persists first discovery, an empty repeat diff, and identity-preserving stable-reference rename',async()=>{
    const first=await run();
    expect(first.state).toBe('complete');
    expect(first.diff.map((entry)=>entry.type)).toEqual(['CatalogObjectAdded','CatalogElementAdded']);
    expect(first.startedAt).not.toBeNull(); expect(first.endedAt).not.toBeNull();
    const before=await catalog();
    expect((await run()).diff).toEqual([]);
    expect(await catalog()).toEqual(before);
    discovery=snapshot('renamed');
    expect((await run()).diff.map((entry)=>entry.type)).toEqual(['CatalogElementRenamed']);
    const rows=await withTenant(ctx,(tx)=>tx.query<{id:string;duckdb_name:string;source_identifier:string}>('SELECT id,duckdb_name,source_identifier FROM catalog_element'));
    expect(rows[0]).toMatchObject({duckdb_name:'label',source_identifier:'renamed'});
    expect((await catalog()).elements[0]).toMatchObject({id:rows[0]?.id});
    expect(before.elements[0]).toMatchObject({id:rows[0]?.id});
  });
  it('carries both identities when stable-reference columns exchange source names',async()=>{
    const first=snapshot();
    first.objects[0]!.columns.push({...first.objects[0]!.columns[0]!,sourceIdentifier:'other',stableRef:'2',ordinal:2});
    discovery=first; await run();
    const before=await withTenant(ctx,(tx)=>tx.query<{id:string;source_identifier:string;duckdb_name:string;stable_ref:string}>('SELECT id,source_identifier,duckdb_name,stable_ref FROM catalog_element ORDER BY stable_ref'));
    discovery=structuredClone(first);
    discovery.objects[0]!.columns[0]!.sourceIdentifier='other';
    discovery.objects[0]!.columns[1]!.sourceIdentifier='label';
    expect((await run()).diff.map((entry)=>entry.type)).toEqual(['CatalogElementRenamed','CatalogElementRenamed']);
    const after=await withTenant(ctx,(tx)=>tx.query('SELECT id,source_identifier,duckdb_name,stable_ref FROM catalog_element ORDER BY stable_ref'));
    expect(after).toEqual(before.map((element)=>({...element,source_identifier:element.stable_ref==='1'?'other':'label'})));
  });
  it('G-011: explicit name adoption requires project administration and persists a breaking diff and revision',async()=>{
    await run();
    discovery=snapshot('renamed');
    expect(await job.enqueue(ctx,sourceId,[],{adoptRenamedNames:true})).toMatchObject({ok:false,error:{code:'forbidden'}});
    let allowed=true;
    const check=vi.fn(async()=>({allowed,checkedAt:Timestamp(new Date()),token:'test' as ZedToken,snapshotAgeMs:0}));
    const authorization:AuthorizationPort={check,checkMany:async()=>[],write:async()=>'test' as ZedToken,explain:async()=>({allowed:false,path:[]})};
    const admin=new IntrospectionJob(store,()=>connector,()=>{},authorization);
    const queued=unwrap(await admin.enqueue(ctx,sourceId,[],{adoptRenamedNames:true}));
    const done=unwrap(await admin.execute(ctx,queued.id));
    expect(done.diff).toEqual(expect.arrayContaining([expect.objectContaining({type:'CatalogNameAdopted',breaking:true})]));
    expect(await withTenant(ctx,(tx)=>tx.query('SELECT duckdb_name,name_revision FROM catalog_element'))).toEqual([{duckdb_name:'renamed',name_revision:1}]);
    expect(check).toHaveBeenCalledWith({resource:{type:'project',id:ctx.projectId},permission:'administer',subject:{type:'user',id:ctx.userId}});
    discovery=snapshot('changed_again');
    const revoked=unwrap(await admin.enqueue(ctx,sourceId,[],{adoptRenamedNames:true}));
    allowed=false;
    expect(unwrap(await admin.execute(ctx,revoked.id)).state).toBe('failed');
    expect(await withTenant(ctx,(tx)=>tx.query('SELECT duckdb_name,name_revision FROM catalog_element'))).toEqual([{duckdb_name:'renamed',name_revision:1}]);
  });
  it('records a type-family invalidation before metadata changes; numeric widening retains its family',async()=>{
    discovery=snapshot('amount','integer'); await run();
    const pool=randomUUID();
    await withTenant(ctx,async tx=>{
      await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,ctx.projectId]);
      await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) SELECT $1,id,project_id,'masked','user',$2 FROM catalog_element",[pool,ctx.userId]);
    });
    const decisions=()=>withTenant(ctx,tx=>tx.query('SELECT * FROM entitlement ORDER BY pool_id,element_id'));
    const before=await decisions();
    discovery=snapshot('amount','bigint');
    expect((await run()).diff).toMatchObject([{type:'CatalogElementTypeChanged',beforeType:'integer',afterType:'bigint'}]);
    expect(await decisions()).toEqual(before);
    discovery=snapshot('amount','text');
    const changed=await run();
    expect(changed.diff).toMatchObject([{type:'CatalogElementTypeFamilyChanged',beforeType:'bigint',afterType:'text',beforeFamily:'number',afterFamily:'text',requiresEntitlementDeletion:true,runId:changed.id,entitlements:[{poolId:pool,treatment:'masked'}]}]);
    expect(unwrap(await job.read(ctx,changed.id)).diff).toEqual(changed.diff);
    expect(await decisions()).toEqual([]);
  });
  it.each([
    ['varchar(50)','varchar(100)'], ['char(10)','text'], ['integer','double precision'],
    ['numeric(10,2)','numeric(18,4)'], ['timestamp','timestamptz'],
    ['json','jsonb'], ['bool','boolean'], ['integer[]','bigint[]'],
  ])('G-008: %s to %s preserves every decision within its family',async(beforeType,afterType)=>{
    discovery=snapshot('value',beforeType);await run();
    const pool=randomUUID();
    await withTenant(ctx,async tx=>{
      await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,ctx.projectId]);
      await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) SELECT $1,id,project_id,'masked','user',$2 FROM catalog_element",[pool,ctx.userId]);
    });
    const decisions=()=>withTenant(ctx,tx=>tx.query('SELECT * FROM entitlement ORDER BY pool_id,element_id'));
    const before=await decisions();expect(before).toHaveLength(1);
    discovery=snapshot('value',afterType);
    expect((await run()).diff).toMatchObject([{type:'CatalogElementTypeChanged',beforeType,afterType}]);
    expect(await decisions()).toEqual(before);
  });
  it.each([
    ['boolean','integer','boolean','number'], ['date','timestamp','date','timestamp'],
    ['time','uuid','time','uuid'], ['json','integer[]','json','list'],
    ['geometry','binary','unsupported','unsupported'],
  ])('G-009: %s to %s records family names',async(beforeType,afterType,beforeFamily,afterFamily)=>{
    discovery=snapshot('value',beforeType);await run();
    discovery=snapshot('value',afterType);
    expect((await run()).diff).toMatchObject([{type:'CatalogElementTypeFamilyChanged',beforeType,afterType,beforeFamily,afterFamily,requiresEntitlementDeletion:true}]);
  });
  it('G-009: records old decisions before deletion and rolls both back if catalogue publication fails',async()=>{
    discovery=snapshot('amount','integer');await run();
    const pool=randomUUID();
    await withTenant(ctx,async tx=>{
      await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,ctx.projectId]);
      await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) SELECT $1,id,project_id,'clear','user',$2 FROM catalog_element",[pool,ctx.userId]);
    });
    const before=await catalog();
    const decisions=await withTenant(ctx,tx=>tx.query('SELECT * FROM entitlement'));
    const queued=unwrap(await store.enqueue(ctx,sourceId,[]));
    for(const [from,to] of [['queued','connecting'],['connecting','reading'],['reading','diffing']] as const)unwrap(await store.advance(ctx,queued.id,from,to));
    const original=scopes.withTenant;let observed=false;
    const scope=vi.spyOn(scopes,'withTenant').mockImplementation((context,work)=>original(context,tx=>work({query:async(sql,params)=>{
      if(sql.startsWith('DELETE FROM entitlement')){
        const [row]=await tx.query<{diff:unknown[]}>('SELECT diff FROM introspection_run WHERE id=$1',[queued.id]);
        expect(row?.diff).toMatchObject([{runId:queued.id,entitlements:[{poolId:pool,treatment:'clear'}]}]);observed=true;
      }
      if(sql.startsWith('INSERT INTO catalog_object'))throw new Error('Injected publication failure');
      return tx.query(sql,params);
    }})));
    try{await expect(store.publish(ctx,queued.id,snapshot('amount','text'))).rejects.toThrow('Injected publication failure');}finally{scope.mockRestore();}
    expect(observed).toBe(true);expect(await catalog()).toEqual(before);
    expect(await withTenant(ctx,tx=>tx.query('SELECT * FROM entitlement'))).toEqual(decisions);
    expect(unwrap(await store.read(ctx,queued.id))).toMatchObject({state:'diffing',diff:[]});
  });
  it('G-007/G-009: removal and stable-reference rename retain decisions row by row',async()=>{
    await run(); const pool=randomUUID();
    await withTenant(ctx,async tx=>{
      await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Reporting')",[pool,ctx.projectId]);
      await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) SELECT $1,id,project_id,'withheld','user',$2 FROM catalog_element",[pool,ctx.userId]);
    });
    const decisions=()=>withTenant(ctx,tx=>tx.query('SELECT * FROM entitlement'));
    const before=await decisions();
    discovery=snapshot('renamed');await run();expect(await decisions()).toEqual(before);
    discovery={...snapshot(),objects:[]};await run();expect(await decisions()).toEqual(before);
  });
  it('G-017: failure mid-read preserves the previous catalogue and records a safe reason',async()=>{
    await run(); const before=await catalog();
    connector.introspect=async()=>err(new DomainError('source_unavailable','postgres://user:SECRET@db'));
    const failed=await run();
    expect(failed).toMatchObject({state:'failed',diff:[],error:'The source could not be reached. Check its connection and credentials, then retry.'});
    expect(JSON.stringify(failed)).not.toContain('SECRET');
    expect(await catalog()).toEqual(before);
    expect(unwrap(await job.source(ctx,sourceId)).status).toBe('unreachable');
  });
  it('G-017: a malformed snapshot fails publication without partial catalogue changes',async()=>{
    await run(); const before=await catalog();
    discovery={...snapshot(),objects:[...snapshot().objects,...snapshot().objects]};
    expect((await run()).state).toBe('failed');
    expect(await catalog()).toEqual(before);
    expect(unwrap(await job.source(ctx,sourceId)).status).toBe('connected');
  });
  it('F-010: connection loss marks unreachable; a later successful run restores connected',async()=>{
    await run(); const before=await catalog();
    connector.testConnection=async()=>err(new DomainError('source_unavailable','Unreachable'));
    expect((await run()).state).toBe('failed');
    expect(unwrap(await job.source(ctx,sourceId)).status).toBe('unreachable');
    expect(await catalog()).toEqual(before);
    connector.testConnection=async()=>ok(undefined);
    expect((await run()).state).toBe('complete');
    expect(unwrap(await job.source(ctx,sourceId)).status).toBe('connected');
  });
  it.each(['connecting','reading'] as const)('G-018: cancellation during %s waits for release and publishes nothing',async(phase)=>{
    await run(); const before=await catalog();
    let started!:()=>void; const ready=new Promise<void>((resolve)=>{started=resolve;});
    let released=false;
    const wait=async(signal?:AbortSignal)=>{
      started();
      await new Promise<void>((resolve)=>{if(signal?.aborted)resolve();else signal?.addEventListener('abort',()=>resolve(),{once:true});});
      released=true;
      return err(new DomainError('source_unavailable','Cancelled'));
    };
    if(phase==='connecting')connector.testConnection=(_ref,signal)=>wait(signal);
    else connector.introspect=(_ref,_include,signal)=>wait(signal);
    const queued=unwrap(await job.enqueue(ctx,sourceId));
    const running=job.execute(ctx,queued.id); await ready;
    expect(unwrap(await job.cancel(ctx,queued.id)).state).toBe('cancelled');
    expect(released).toBe(true);
    expect(unwrap(await running).state).toBe('cancelled');
    expect(await catalog()).toEqual(before);
    expect(unwrap(await job.source(ctx,sourceId)).status).toBe('connected');
  });
  it('cancels queued work, rejects cancellation while diffing, and isolates projects',async()=>{
    const queued=unwrap(await job.enqueue(ctx,sourceId));
    expect((await job.enqueue(ctx,sourceId)).ok).toBe(false);
    expect(unwrap(await job.cancel(ctx,queued.id)).state).toBe('cancelled');
    expect((await job.read({...ctx,projectId:otherProject},queued.id)).ok).toBe(false);
    expect((await job.source({...ctx,projectId:otherProject},sourceId)).ok).toBe(false);
    const next=unwrap(await job.enqueue(ctx,sourceId));
    for(const [from,to] of [['queued','connecting'],['connecting','reading'],['reading','diffing']] as const)unwrap(await store.advance(ctx,next.id,from,to));
    expect((await job.cancel(ctx,next.id)).ok).toBe(false);
    expect(unwrap(await job.read(ctx,next.id)).state).toBe('diffing');
  });
  it('serializes concurrent enqueue and claims so the source is contacted only once',async()=>{
    const queued=await Promise.all([job.enqueue(ctx,sourceId),job.enqueue(ctx,sourceId)]);
    expect(queued.filter((entry)=>entry.ok)).toHaveLength(1);
    const accepted=queued.find((entry)=>entry.ok); if(accepted===undefined)throw new Error('Missing run');
    const id=unwrap(accepted).id;
    const contact=vi.spyOn(connector,'introspect');
    const prepare=vi.fn(async()=>ok(undefined));
    await Promise.all([job.execute(ctx,id,undefined,prepare),new IntrospectionJob(store,()=>connector).execute(ctx,id,undefined,prepare)]);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(contact).toHaveBeenCalledTimes(1);
  });
  it('partial schema selection leaves other catalogued schemas intact',async()=>{
    const extra=snapshot(); extra.objects[0]!.schema='other';
    discovery={...snapshot(),objects:[...snapshot().objects,...extra.objects]}; await run();
    discovery={...snapshot(),objects:[]};
    const queued=unwrap(await job.enqueue(ctx,sourceId,['public']));
    unwrap(await job.execute(ctx,queued.id));
    const rows=await withTenant(ctx,(tx)=>tx.query('SELECT schema_name,status FROM catalog_object ORDER BY schema_name'));
    expect(rows).toEqual([{schema_name:'other',status:'active'},{schema_name:'public',status:'removed'}]);
  });
});

describe('R-023 introspection state machine',()=>{
  it('exhaustively accepts legal transitions and rejects every illegal transition',()=>{
    for(const from of runStates)for(const to of runStates){
      const legal=transitions[from].includes(to);
      expect(transitionRun(from,to).ok).toBe(legal);
      const log=vi.fn();
      if(legal)expect(enforceTransition(from,to,false,log)).toBe(true);
      else{
        expect(()=>enforceTransition(from,to,false,log)).toThrow();
        expect(enforceTransition(from,to,true,log)).toBe(false);
        expect(log).toHaveBeenCalledWith(from,to);
      }
    }
  });
});
