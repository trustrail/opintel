import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { PostgresTemporalRepository } from '../src/modules/catalog/index.js';
import { Entitlement, PostgresEntitlements } from '../src/modules/entitlements/index.js';
import { ElementId, SourceId, ProjectId, UserId, PoolId, Timestamp, type Result } from '../src/shared/kernel/index.js';
const unwrap = <T>(result: Result<T>): T => { if (!result.ok) throw new Error(result.error.message); return result.value; };
const ctx = { projectId: ProjectId(randomUUID()), userId: UserId(randomUUID()) };
const other = { ...ctx, projectId: ProjectId(randomUUID()) };
const source = SourceId(randomUUID()), second = SourceId(randomUUID()), pool = PoolId(randomUUID());
const temporal = new PostgresTemporalRepository(), decisions = new PostgresEntitlements();
const ids = { naive: ElementId(randomUUID()), zoned: ElementId(randomUUID()), date: ElementId(randomUUID()), integer: ElementId(randomUUID()), decimal: ElementId(randomUUID()), otherSource: ElementId(randomUUID()) };
async function decide(element: ElementId, treatment: 'tokenized' | 'clear' = 'tokenized') {
  return decisions.set(ctx, unwrap(Entitlement.decide({ elementId: element, projectId: ctx.projectId, poolId: pool, treatment, maskKind: null, setBy: { kind: 'user', id: ctx.userId }, setAt: Timestamp(new Date()), justification: null })));
}
describe('4.3b persisted temporal declarations', () => {
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
        await tx.query("INSERT INTO data_source(id,project_id,name,duckdb_alias,kind,credential_ref,status) VALUES($1,$2,$3,$3,'postgres','vault://test/source','connected')", [s, ctx.projectId, s === source ? 'warehouse' : 'other_warehouse']);
        const [object] = await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,duckdb_schema,duckdb_name) VALUES($1,$2,'public','records','table','public','records') RETURNING id", [ctx.projectId,s]);
        const elements = s === source ? [['naive','timestamp','TIMESTAMP'],['zoned','timestamptz','TIMESTAMPTZ'],['date','date','DATE'],['integer','bigint','BIGINT'],['decimal','numeric(12,2)','DECIMAL(12,2)']] as const : [['otherSource','timestamp','TIMESTAMP']] as const;
        for (const [name,type,duck] of elements) await tx.query('INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,duckdb_name,duckdb_type) VALUES($1,$2,$3,$4,$5,$4,$6)', [ids[name],ctx.projectId,object!.id,name,type,duck]);
      }
    });
  });
  it('TOK-19: refuses a tokenized naive timestamp at decision time naming sourceTimezone, without changing an existing decision', async () => {
    expect(unwrap(await temporal.read(ctx,ids.naive))).toEqual({sourceTimezone:null,epochUnit:null,schemaTimezone:null,effectiveSourceTimezone:null});
    unwrap(await decide(ids.naive,'clear'));
    expect(await decide(ids.naive)).toMatchObject({ok:false,error:{code:'validation_failed',message:expect.stringContaining('sourceTimezone')}});
    expect(unwrap(await decisions.forElement(ctx,pool,ids.naive))).toBe('clear');
    unwrap(await decide(ids.zoned));
  });
  it('TOK-20: persists schema inheritance and element overrides, scoped to the source', async () => {
    unwrap(await temporal.setSchema(ctx,source,'public',{sourceTimezone:'Europe/Paris'}));
    expect(unwrap(await new PostgresTemporalRepository().read(ctx,ids.naive))).toMatchObject({sourceTimezone:null,effectiveSourceTimezone:'Europe/Paris'});
    unwrap(await decide(ids.naive));
    expect(await decide(ids.otherSource)).toMatchObject({ok:false});
    expect(await temporal.setElement(ctx,ids.naive,{sourceTimezone:'America/Toronto'})).toMatchObject({ok:false,error:{code:'conflict'}});
    unwrap(await temporal.setElement(ctx,ids.naive,{sourceTimezone:'America/Toronto',confirmation:'Temporal project'}));
    // An override insulates this tokenized element from schema default changes.
    unwrap(await temporal.setSchema(ctx,source,'public',{sourceTimezone:'Asia/Tokyo'}));
    expect(unwrap(await temporal.read(ctx,ids.naive))).toMatchObject({sourceTimezone:'America/Toronto',schemaTimezone:'Asia/Tokyo',effectiveSourceTimezone:'America/Toronto'});
  });
  it('TOK-21: integers without epochUnit remain numbers; explicit units persist and only integer columns accept them', async () => {
    unwrap(await decide(ids.integer));
    expect(unwrap(await temporal.read(ctx,ids.integer)).epochUnit).toBeNull();
    unwrap(await temporal.setElement(ctx,ids.integer,{epochUnit:'seconds'})); // First declaration needs no confirmation.
    expect(unwrap(await new PostgresTemporalRepository().read(ctx,ids.integer)).epochUnit).toBe('seconds');
    expect(await temporal.setElement(ctx,ids.integer,{epochUnit:'milliseconds'})).toMatchObject({ok:false,error:{code:'conflict'}});
    unwrap(await temporal.setElement(ctx,ids.integer,{epochUnit:'milliseconds',confirmation:'Temporal project'}));
    unwrap(await decide(ids.integer));
    for (const id of [ids.decimal,ids.date,ids.naive]) expect(await temporal.setElement(ctx,id,{epochUnit:'seconds'})).toMatchObject({ok:false,error:{message:expect.stringContaining('integer')}});
    expect(await temporal.setElement(ctx,ids.integer,{epochUnit:'minutes'})).toMatchObject({ok:false});
    expect(await temporal.setElement(ctx,ids.integer,{epochUnit:null})).toMatchObject({ok:false,error:{code:'conflict'}});
    unwrap(await temporal.setElement(ctx,ids.integer,{epochUnit:null,confirmation:'Temporal project'}));
    unwrap(await decide(ids.integer));
  });
  it('TOK-22: a date can be tokenized with neither temporal declaration and retains DATE', async () => {
    unwrap(await decide(ids.date));
    expect(unwrap(await temporal.read(ctx,ids.date))).toEqual({sourceTimezone:null,epochUnit:null,schemaTimezone:null,effectiveSourceTimezone:null});
    expect(await withTenant(ctx,tx=>tx.query('SELECT duckdb_type FROM catalog_element WHERE id=$1',[ids.date]))).toEqual([{duckdb_type:'DATE'}]);
  });
  it('validates IANA zones when set; does not accept offsets, unknown zones or extra fields', async () => {
    for (const zone of ['Not/AZone','+01:00','', ' Europe/Paris']) {
      expect(await temporal.setElement(ctx,ids.naive,{sourceTimezone:zone})).toMatchObject({ok:false});
      expect(await temporal.setSchema(ctx,source,'public',{sourceTimezone:zone})).toMatchObject({ok:false});
    }
    expect(await temporal.setElement(ctx,ids.naive,{timezone:'UTC'})).toMatchObject({ok:false});
    unwrap(await temporal.setElement(ctx,ids.naive,{sourceTimezone:'UTC'}));
    unwrap(await decide(ids.naive));
    unwrap(await temporal.setElement(ctx,ids.naive,{sourceTimezone:'UTC'})); // No change.
    expect(await temporal.setElement(ctx,ids.naive,{sourceTimezone:'Europe/Paris',confirmation:'wrong'})).toMatchObject({ok:false,error:{code:'conflict'}});
    expect(unwrap(await temporal.read(ctx,ids.naive)).sourceTimezone).toBe('UTC');
    unwrap(await temporal.setElement(ctx,ids.naive,{sourceTimezone:'Europe/Paris',confirmation:'Temporal project'}));
  });
  it('schema changes protect inherited tokenized decisions; removing the final zone cannot leave an invalid decision', async () => {
    unwrap(await temporal.setSchema(ctx,source,'public',{sourceTimezone:'UTC'}));
    unwrap(await decide(ids.naive));
    expect(await temporal.setSchema(ctx,source,'public',{sourceTimezone:'Europe/Paris'})).toMatchObject({ok:false,error:{code:'conflict'}});
    unwrap(await temporal.setSchema(ctx,source,'public',{sourceTimezone:'Europe/Paris',confirmation:'Temporal project'}));
    expect(await temporal.setSchema(ctx,source,'public',{sourceTimezone:null,confirmation:'Temporal project'})).toMatchObject({ok:false,error:{code:'validation_failed'}});
    unwrap(await decide(ids.naive,'clear'));
    unwrap(await temporal.setSchema(ctx,source,'public',{sourceTimezone:null}));
    expect(unwrap(await temporal.read(ctx,ids.naive)).effectiveSourceTimezone).toBeNull();
  });
  it('isolates declarations and checks them against the current catalogue type again when setting an entitlement', async () => {
    unwrap(await temporal.setSchema(ctx,source,'public',{sourceTimezone:'UTC'}));
    expect(await temporal.read(other,ids.naive)).toMatchObject({ok:false,error:{code:'not_found'}});
    expect(await temporal.setElement(other,ids.naive,{sourceTimezone:'Europe/Paris'})).toMatchObject({ok:false,error:{code:'not_found'}});
    expect(await temporal.setSchema(other,source,'public',{sourceTimezone:'Europe/Paris'})).toMatchObject({ok:false,error:{code:'not_found'}});
    expect(await withTenant(other,tx=>tx.query('SELECT * FROM catalog_schema_temporal'))).toEqual([]);
    unwrap(await temporal.setElement(ctx,ids.integer,{epochUnit:'seconds'}));
    await withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET duckdb_type='VARCHAR',source_type='text' WHERE id=$1",[ids.integer]));
    expect(await decide(ids.integer)).toMatchObject({ok:false,error:{message:expect.stringContaining('integer')}});
  });
});
