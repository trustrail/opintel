import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { withPlatform, withTenant } from '../src/platform/db/scope.js';
import { PostgresPatternRules, matchesPatternRule, validateRuleTreatment, type PatternRule, type RuleElement } from '../src/modules/entitlements/index.js';
import { IntrospectionJob, PostgresIntrospectionStore, type CatalogSnapshot, type IntrospectionCompletedHandler, type SourceConnector } from '../src/modules/sources/index.js';
import { PostgresIntrospectionQuery } from '../src/modules/sources/infrastructure/introspection-query.js';
import { ProjectId, UserId, SourceId, PoolId, RuleId, ElementId, Timestamp, UuidV7IdFactory, ok, type Result } from '../src/shared/kernel/index.js';
import { resetDatabaseBeforeEach } from './database-fixture.js';

const unwrap = <T>(value:Result<T>):T => { if (!value.ok) throw new Error(value.error.message); return value.value; };
const ids = new UuidV7IdFactory();
const ctx = { projectId:ProjectId(randomUUID()),userId:UserId(randomUUID()) };
const other = { projectId:ProjectId(randomUUID()),userId:UserId(randomUUID()) };
const sourceId = SourceId(randomUUID());
const pools = [PoolId(randomUUID()),PoolId(randomUUID()),PoolId(randomUUID())];
const rules = new PostgresPatternRules(ids);
const store = new PostgresIntrospectionStore(ids);
const query = new PostgresIntrospectionQuery(store);
const snapshot = (names:string[]=['customer_id'], sourceType='text', at='2099-01-01T00:00:00.000Z'):CatalogSnapshot => ({
  takenAt:Timestamp(new Date(at)),objects:[{schema:'public',name:'orders',kind:'table',rowEstimate:0,
    columns:names.map((sourceIdentifier,index)=>({sourceIdentifier,sourceType,ordinal:index+1,stableRef:String(index+1),nullable:true,isKey:false,description:null}))}],foreignKeys:[],
});
const run = async (data:CatalogSnapshot=snapshot(), completed?:IntrospectionCompletedHandler) => {
  const connector:SourceConnector = {kind:'postgres',testConnection:async()=>ok(undefined),introspect:async()=>ok(data),sampleTopValues:async()=>ok(new Map()),estimateRowCount:async()=>ok(null)};
  const job = new IntrospectionJob(completed ? new PostgresIntrospectionStore(ids,undefined,completed) : store,()=>connector);
  const queued = unwrap(await job.enqueue(ctx,sourceId));
  return unwrap(await job.execute(ctx,queued.id));
};
const create = async (input:Record<string,unknown>={}) => unwrap(await rules.create(ctx,{matcher:'*',matchKind:'name_glob',treatment:'clear',...input}));
const decisions = () => withTenant(ctx,tx=>tx.query<{pool_id:PoolId;element_id:ElementId;treatment:string;source_kind:string;source_ref:string;mask_kind:string|null}>(
  'SELECT pool_id,element_id,treatment,source_kind,source_ref,mask_kind FROM entitlement ORDER BY pool_id,element_id'));
const blocked: IntrospectionCompletedHandler = { handle:async()=>{throw new Error('simulated delivery interruption');} };

describe('4.6 persisted pattern rule application at introspection completion',()=>{
  resetDatabaseBeforeEach('company');
  beforeEach(async()=>{
    await withPlatform(async tx=>{
      const [industry]=await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');
      const [company]=await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Pattern tests','eu-west-1') RETURNING id");
      for (const project of [ctx.projectId,other.projectId]) await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,$4,'eu-west-1')",[project,company!.id,industry!.id,project]);
    });
    await withTenant(ctx,async tx=>{
      await tx.query("INSERT INTO data_source(id,project_id,kind,name,credential_ref,status,exposed_alias) VALUES($1,$2,'postgres','Warehouse','secret://test/source','connected','warehouse')",[sourceId,ctx.projectId]);
      for (const [index,pool] of pools.entries()) {
        await tx.query('INSERT INTO pool(id,project_id,name) VALUES($1,$2,$3)',[pool,ctx.projectId,'Pool '+index]);
        if (index<2) await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[pool,sourceId,ctx.projectId]);
      }
    });
  });

  it('H-013/R-007: applies to every bound project pool with rule provenance',async()=>{
    const rule=await create({matcher:'CUSTOMER_?D'});
    const completed=await run();
    expect(completed.state).toBe('complete');
    const rows=await decisions(); expect(rows).toHaveLength(2);
    expect(rows.map(row=>row.pool_id).sort()).toEqual(pools.slice(0,2).sort());
    for (const row of rows) expect(row).toMatchObject({treatment:'clear',source_kind:'rule',source_ref:rule.id,mask_kind:null});
    expect((unwrap(await query.read(ctx,completed.id))).ruleObservations).toEqual([]);
  });

  it.each(['user','rule'] as const)('H-014: never overwrites an existing %s decision, including concurrent retries',async kind=>{
    await create(); const completed=await run(snapshot(),blocked);
    const oldRef=kind==='user'?ctx.userId:RuleId(randomUUID());
    await withTenant(ctx,tx=>tx.query(`INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref)
      SELECT $1,id,project_id,'withheld',$2,$3 FROM catalog_element`,[pools[0],kind,oldRef]));
    await Promise.all([store.dispatchCompleted(ctx),store.dispatchCompleted(ctx)]);
    const rows=await decisions(); expect(rows).toHaveLength(2);
    expect(rows.find(row=>row.pool_id===pools[0])).toMatchObject({treatment:'withheld',source_kind:kind,source_ref:oldRef});
    expect(unwrap(await query.read(ctx,completed.id)).state).toBe('complete');
  });

  it('R-004: no backfill; only newly added elements discovered strictly after creation qualify',async()=>{
    await run(snapshot(['old'],'text','2020-01-01T00:00:00.000Z'));
    await create(); await run(snapshot(['old','new']));
    const rows=await withTenant(ctx,tx=>tx.query<{exposed_name:string}>('SELECT e.exposed_name FROM entitlement t JOIN catalog_element e ON e.id=t.element_id'));
    expect(rows).toEqual([{exposed_name:'new'},{exposed_name:'new'}]);
  });

  it('R-004: equal creation and discovery times do not qualify',async()=>{
    const rule=await create();
    await withTenant(ctx,tx=>tx.query("UPDATE pattern_rule SET created_at='2099-01-01T00:00:00Z' WHERE id=$1",[rule.id]));
    await run(); expect(await decisions()).toEqual([]);
  });

  it('R-005: highest numeric priority wins regardless of creation order or matcher kind',async()=>{
    await create({matcher:'VARCHAR',matchKind:'type',priority:10,treatment:'clear'});
    const winner=await create({matcher:'public',matchKind:'schema',priority:200,treatment:'withheld'});
    await create({priority:100,treatment:'masked',maskKind:'all'});
    await run(); expect((await decisions()).every(row=>row.source_ref===winner.id && row.treatment==='withheld')).toBe(true);
    expect(await decisions()).toHaveLength(2);
  });

  it('R-006: deleting a rule retains every entitlement and its historical provenance',async()=>{
    const rule=await create(); await run(); const before=await decisions();
    unwrap(await rules.delete(ctx,rule.id)); expect(await decisions()).toEqual(before);
    await run(snapshot(['customer_id','later'])); expect(await decisions()).toEqual(before);
  });

  it('R-025: equal priorities create nothing; observations name both rules and the element',async()=>{
    const a=await create({priority:10}); const b=await create({matchKind:'schema',matcher:'public',priority:10});
    const completed=await run(); expect(completed.state).toBe('complete'); expect(await decisions()).toEqual([]);
    const observations=unwrap(await query.read(ctx,completed.id)).ruleObservations;
    expect(observations).toHaveLength(2);
    for (const observation of observations) {
      expect(observation.ruleIds.sort()).toEqual([a.id,b.id].sort());
      expect(observation.elementName).toBe('customer_id');
      for (const name of [a.id,b.id,observation.elementId,'customer_id']) expect(observation.message).toContain(name);
    }
    await Promise.all([store.dispatchCompleted(ctx),store.dispatchCompleted(ctx)]);
    expect(unwrap(await query.read(ctx,completed.id)).ruleObservations).toEqual(observations);
  });

  it('R-026: missing token domain and timezone leave the element undecided without failing introspection',async()=>{
    const rule=await create({treatment:'tokenized'}); const completed=await run(snapshot(['event_at'],'timestamp without time zone'));
    expect(completed.state).toBe('complete'); expect(await decisions()).toEqual([]);
    const observations=unwrap(await query.read(ctx,completed.id)).ruleObservations;
    expect(observations).toHaveLength(2);
    for (const observation of observations) for (const word of [rule.id,'event_at','tokenDomain','sourceTimezone']) expect(observation.message).toContain(word);
    // A refusal is a terminal receipt for this discovery, not permission to
    // grant later when declarations or policy change.
    await withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET token_domain='event1',source_timezone='UTC'"));
    await store.dispatchCompleted(ctx); expect(await decisions()).toEqual([]);
  });

  it('R-027: incompatible mask creates an observation, while a compatible masked rule applies',async()=>{
    const rule=await create({treatment:'masked',maskKind:'email'});
    const completed=await run(snapshot(['customer_id'],'integer'));
    expect(completed.state).toBe('complete'); expect(await decisions()).toEqual([]);
    for (const o of unwrap(await query.read(ctx,completed.id)).ruleObservations) {
      for (const word of [rule.id,'email','INTEGER','customer_id']) expect(o.message).toContain(word);
    }
    unwrap(await rules.delete(ctx,rule.id)); const valid=await create({treatment:'masked',maskKind:'all'});
    await run(snapshot(['customer_id','next_id'],'integer'));
    const rows=await decisions(); expect(rows).toHaveLength(2);
    expect(rows.every(row=>row.mask_kind==='all' && row.source_ref===valid.id)).toBe(true);
  });

  it('valid token declarations are consumed, not manufactured by the rule',async()=>{
    const rule=await create({treatment:'tokenized'}); await run(snapshot(),blocked);
    await withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET token_domain='customer1',case_insensitive=false"));
    await store.dispatchCompleted(ctx);
    expect((await decisions()).map(row=>row.source_ref)).toEqual([rule.id,rule.id]);
  });

  it('R-026: missing epoch unit is recorded against the rule and element in the completed run',async()=>{
    const rule=await create({treatment:'tokenized'}); const completed=await run(snapshot(['event_at'],'bigint'),blocked);
    await withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET token_domain='event1',canon_id='stdtime1'"));
    await store.dispatchCompleted(ctx); expect(await decisions()).toEqual([]);
    const view=unwrap(await query.read(ctx,completed.id)); expect(view.state).toBe('complete'); expect(view.ruleObservations).toHaveLength(2);
    for (const observation of view.ruleObservations) for (const text of [rule.id,observation.elementId,'epochUnit']) expect(observation.message).toContain(text);
  });

  it('an inapplicable highest-priority rule never falls back to a more permissive rule',async()=>{
    await create({priority:1}); const invalid=await create({priority:2,treatment:'tokenized'});
    const completed=await run(); expect(await decisions()).toEqual([]);
    for (const observation of unwrap(await query.read(ctx,completed.id)).ruleObservations) expect(observation.ruleIds).toEqual([invalid.id]);
  });

  it('type-family invalidation is not new discovery and cannot automatically regrant a rule entitlement',async()=>{
    await create(); await run(); expect(await decisions()).toHaveLength(2);
    await run(snapshot(['customer_id'],'integer')); expect(await decisions()).toEqual([]);
  });

  it('completion delivery recovers from an infrastructure failure, with targets fixed at diff time',async()=>{
    await create(); const completed=await run(snapshot(),blocked);
    expect(completed.state).toBe('complete'); expect(await decisions()).toEqual([]);
    await withTenant(ctx,tx=>tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[pools[2],sourceId,ctx.projectId]));
    await new PostgresIntrospectionStore(ids).dispatchCompleted(ctx);
    expect(await decisions()).toHaveLength(2);
    const events=await withTenant(ctx,tx=>tx.query<{delivered_at:Date}>('SELECT delivered_at FROM introspection_completed WHERE run_id=$1',[completed.id]));
    expect(events[0]!.delivered_at).not.toBeNull();
  });

  it('rule creation requires mask_kind exactly for masked; inactive rules do not apply',async()=>{
    for (const input of [{treatment:'masked'},{treatment:'clear',maskKind:'all'},{treatment:'masked',maskKind:'unknown'}])
      expect(await rules.create(ctx,{matcher:'*',matchKind:'name_glob',...input})).toMatchObject({ok:false,error:{code:'validation_failed'}});
    await create({active:false}); await run(); expect(await decisions()).toEqual([]);
  });

  it('rules, completion events and observations remain tenant scoped',async()=>{
    const rule=await create({treatment:'tokenized'}); await run();
    expect(await rules.delete(other,rule.id)).toMatchObject({ok:false,error:{code:'not_found'}});
    for (const table of ['pattern_rule','introspection_completed','pattern_rule_application']) {
      expect(await withTenant(other,tx=>tx.query(`SELECT * FROM ${table}`))).toEqual([]);
    }
    await expect(withTenant(other,tx=>tx.query("INSERT INTO pattern_rule(project_id,matcher,match_kind,treatment) VALUES($1,'*','name_glob','clear')",[ctx.projectId]))).rejects.toMatchObject({code:'42501'});
  });
});

const element:RuleElement={id:ElementId(randomUUID()),exposedName:'customer_id',exposedType:'VARCHAR',exposedSchema:'public',tokenDomain:'customer1',caseInsensitive:false,canonId:null,epochUnit:null,sourceTimezone:null};
const rule:PatternRule={id:RuleId(randomUUID()),projectId:ctx.projectId,createdAt:Timestamp(new Date('2020-01-01T00:00:00Z')),matcher:'*',matchKind:'name_glob',treatment:'clear',maskKind:null,priority:100,active:true};
describe('pattern matching uses exposed metadata',()=>{
  it.each([
    ['name_glob','CUSTOMER_?D',true],['name_glob','customer*',true],['name_glob','customer.*',false],
    ['name_glob','*id?',false],['name_glob','*',true],['type','VARCHAR',true],['type','text',false],['type','varchar',false],
    ['schema','public',true],['schema','PUBLIC',false],
  ] as const)('%s %s matches literally with only the specified wildcard semantics',(matchKind,matcher,expected)=>{
    expect(matchesPatternRule({...rule,matchKind,matcher},element)).toBe(expected);
  });
  it('R-026: integer timestamp canonicalisation requires an explicit epoch unit',()=>{
    const result=validateRuleTreatment({...rule,treatment:'tokenized'},{...element,exposedType:'BIGINT',caseInsensitive:null,canonId:'stdtime1'});
    expect(result).toMatchObject({ok:false}); if (!result.ok) expect(result.error.message).toContain('epochUnit');
  });
});
