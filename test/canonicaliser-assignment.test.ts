import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { Entitlement, PostgresEntitlements, PostgresCanonicaliserAssignments, SidecarCustodyClient } from '../src/modules/entitlements/index.js';
import { ElementId, SourceId, ProjectId, UserId, PoolId, Timestamp, type Result } from '../src/shared/kernel/index.js';
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const ctx = { projectId: ProjectId(randomUUID()), userId: UserId(randomUUID()) };
const other = { ...ctx, projectId: ProjectId(randomUUID()) };
const source = SourceId(randomUUID()), second = SourceId(randomUUID()), pool = PoolId(randomUUID());
const decisions = new PostgresEntitlements();
let assignments: PostgresCanonicaliserAssignments, client: SidecarCustodyClient;
const ids = { naive: ElementId(randomUUID()), zoned: ElementId(randomUUID()), date: ElementId(randomUUID()), integer: ElementId(randomUUID()), decimal: ElementId(randomUUID()), otherSource: ElementId(randomUUID()) };
async function decide(element: ElementId, treatment: 'tokenized' | 'clear' = 'tokenized') {
  return decisions.set(ctx, unwrap(Entitlement.decide({ elementId: element, projectId: ctx.projectId, poolId: pool, treatment, maskKind: null, setBy: { kind: 'user', id: ctx.userId }, setAt: Timestamp(new Date()), justification: null })));
}
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareSidecarDevelopment } from '../scripts/sidecar-dev.js';
import { loadSidecarConfig } from '../sidecar/config.js';
import { loadSidecarClientOptions } from '../src/modules/sources/index.js';
import { createSidecarServer } from '../sidecar/http/server.js';
import { canonicalisers, createCanonicaliserRegistry } from '../sidecar/tokenize/canonicalisers/index.js';
import { fixture1, fixture2 } from './fixtures/canonicalisers/reviewed.js';
import { ok, DomainError, err } from '../src/shared/kernel/index.js';
let host: ReturnType<typeof createSidecarServer>, directory: string;
describe('4.3c canonicaliser assignments',()=>{
  resetDatabaseBeforeEach('company');
  beforeEach(async () => {
    await withPlatform(async tx => {
      const [industry] = await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');
      const [company] = await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Temporal','eu-west-1') RETURNING id");
      for (const project of [ctx.projectId, other.projectId]) await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,$4,'eu-west-1')", [project, company!.id, industry!.id, project === ctx.projectId ? 'Temporal project' : 'Other project']);
    });
    await withTenant(ctx, async tx => {
      await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Analysis')", [pool, ctx.projectId]);
      for (const s of [source, second]) {
        await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,$2,$3,$3,'postgres','secret://test/source','connected')", [s, ctx.projectId, s === source ? 'warehouse' : 'other_warehouse']);
        const [object] = await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'public','records','table','public','records') RETURNING id", [ctx.projectId,s]);
        const elements = s === source ? [['naive','timestamp','TIMESTAMP'],['zoned','timestamptz','TIMESTAMPTZ'],['date','date','DATE'],['integer','bigint','BIGINT'],['decimal','numeric(12,2)','DECIMAL(12,2)']] as const : [['otherSource','timestamp','TIMESTAMP']] as const;
        for (const [name,type,duck] of elements) await tx.query('INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type) VALUES($1,$2,$3,$4,$5,$4,$6)', [ids[name],ctx.projectId,object!.id,name,type,duck]);
      }
    });
  });

  beforeAll(async()=>{
    directory=await mkdtemp(join(tmpdir(),'canonicalisers-'));await prepareSidecarDevelopment(directory);
    const {config,tls}=await loadSidecarConfig(join(directory,'service.json'));
    const unused=async()=>ok({reachable:true as const});
    host=createSidecarServer({config:{...config,port:0},tls,canonicalisers:createCanonicaliserRegistry([...canonicalisers.entries,fixture1,fixture2]),connector:{testConnection:unused,introspect:unused,sampleTopValues:unused,estimateRowCount:unused} as Parameters<typeof createSidecarServer>[0]['connector']});
    const port=await host.listen();const options=await loadSidecarClientOptions(join(directory,'client.json'));
    client=new SidecarCustodyClient({...options,baseUrl:`https://127.0.0.1:${port}`});assignments=new PostgresCanonicaliserAssignments(client);
  },30000);
  afterAll(async()=>{await host?.close();await rm(directory,{recursive:true,force:true});},30000);

  it('TOK-25: discovers ids over pinned mTLS and requires confirmation for first assignment and a version change on a tokenized element',async()=>{
    expect(unwrap(await client.canonicalisers())).toEqual(['fixture1','fixture2',...canonicalisers.ids].sort());
    await withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET source_type='text',exposed_type='VARCHAR' WHERE id=$1",[ids.integer]));
    unwrap(await decide(ids.integer));
    expect(unwrap(await assignments.read(ctx,ids.integer))).toEqual({canonId:'stdtext1'});
    expect(await assignments.assign(ctx,ids.integer,{canonId:'fixture1'})).toMatchObject({ok:false,error:{code:'conflict'}});
    unwrap(await assignments.assign(ctx,ids.integer,{canonId:'fixture1',confirmation:'Temporal project'}));
    expect(await assignments.assign(ctx,ids.integer,{canonId:'fixture2',confirmation:'wrong'})).toMatchObject({ok:false,error:{code:'conflict'}});
    expect(unwrap(await assignments.read(ctx,ids.integer))).toEqual({canonId:'fixture1'});
    unwrap(await assignments.assign(ctx,ids.integer,{canonId:'fixture2',confirmation:'Temporal project'}));
    unwrap(await assignments.assign(ctx,ids.integer,{canonId:'fixture2'})); // Unchanged.
    expect(unwrap(await new PostgresCanonicaliserAssignments(client).read(ctx,ids.integer))).toEqual({canonId:'fixture2'});
    expect(await withTenant(ctx,tx=>tx.query('SELECT canon_id FROM catalog_element WHERE id=$1',[ids.integer]))).toEqual([{canon_id:'fixture2'}]);
    expect(unwrap(await decisions.forElement(ctx,pool,ids.integer))).toBe('tokenized');
  });
  it('allows assignment before tokenization without confirmation and refuses unknown ids or incompatible modes',async()=>{
    unwrap(await assignments.assign(ctx,ids.integer,{canonId:'stdnum1'}));
    for(const canonId of ['unknown1','bad_id','Bad1','fixture1','stdtime1'])expect(await assignments.assign(ctx,ids.integer,{canonId})).toMatchObject({ok:false});
    unwrap(await assignments.assign(ctx,ids.date,{canonId:'stddate1'}));
    await expect(withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET canon_id='bad_id' WHERE id=$1",[ids.date]))).rejects.toMatchObject({code:'23514'});
    expect(await assignments.assign(other,ids.date,{canonId:'stddate1'})).toMatchObject({ok:false,error:{code:'not_found'}});
    expect(await assignments.read(other,ids.date)).toMatchObject({ok:false,error:{code:'not_found'}});
  });
  it('refuses without changing the assignment when sidecar discovery is unavailable',async()=>{
    unwrap(await assignments.assign(ctx,ids.integer,{canonId:'stdnum1'}));
    const spy=vi.spyOn(client,'canonicalisers').mockResolvedValueOnce(err(new DomainError('dependency_unavailable','Discovery unavailable.')));
    try{expect(await assignments.assign(ctx,ids.integer,{canonId:'stdnum1'})).toMatchObject({ok:false,error:{code:'dependency_unavailable'}});}finally{spy.mockRestore();}
    expect(unwrap(await assignments.read(ctx,ids.integer))).toEqual({canonId:'stdnum1'});
  });
});
