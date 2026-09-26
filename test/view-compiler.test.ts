import { describe, expect, it } from 'vitest';
import { CatalogElement, CatalogObject } from '../src/modules/catalog/index.js';
import { compileViews, Entitlement, type CompileInput } from '../src/modules/entitlements/index.js';
import { PoolId } from '../src/shared/kernel/index.js';
import { fixture, unwrap } from './fixtures/view-compiler/input.js';

describe('item 4.4 compiler acceptance cases', () => {
  it('VC-08: two pools compile the same element independently in either order', () => {
    const first = fixture([{name:'records',columns:[
      {name:'record_id',type:'BIGINT',treatment:'clear'},
      {name:'account_ref',type:'BIGINT',treatment:'clear'},
    ]}]);
    const secondPool = PoolId('00000000-0000-7000-8000-999999999999');
    const second: CompileInput = {...first,poolId:secondPool,entitlements:new Map(
      [...first.entitlements].map(([id,decision])=>[id,unwrap(Entitlement.decide({
        ...decision.state,poolId:secondPool,
        treatment:id===first.elements[1]!.state.id?'withheld':'clear',
      }))]),
    )};
    // Both inputs deliberately share the catalogue entities and element ids.
    expect(second.elements).toBe(first.elements);
    const a = unwrap(compileViews(first));
    const savedA = JSON.stringify(a);
    const b = unwrap(compileViews(second));
    const savedB = JSON.stringify(b);
    expect(a.views.map(v=>v.ddl)).toEqual([
      'CREATE VIEW "fixture_catalog"."fixture_schema"."records" AS SELECT "record_id", "account_ref" FROM "__staging"."fixture_catalog__fixture_schema__records";',
    ]);
    expect(b.views.map(v=>v.ddl)).toEqual([
      'CREATE VIEW "fixture_catalog"."fixture_schema"."records" AS SELECT "record_id" FROM "__staging"."fixture_catalog__fixture_schema__records";',
    ]);
    expect(a.views[0]!.readPlan.columns.map(c=>c.exposedName)).toEqual(['record_id','account_ref']);
    expect(b.views[0]!.readPlan.columns.map(c=>c.exposedName)).toEqual(['record_id']);
    expect(unwrap(compileViews(second))).toEqual(b);
    expect(unwrap(compileViews(first))).toEqual(a);
    expect(JSON.stringify(a)).toBe(savedA);
    expect(JSON.stringify(b)).toBe(savedB);
    expect(first.entitlements.get(first.elements[1]!.state.id)!.state.treatment).toBe('clear');
    expect(second.entitlements.get(first.elements[1]!.state.id)!.state.treatment).toBe('withheld');
  });

  it.each([
    {
      name:'text declarations',type:'VARCHAR',
      before:{tokenDomain:'account1',canonId:'stdtext1',caseInsensitive:false},
      after:{tokenDomain:'account2',canonId:'reviewed2',caseInsensitive:true},
      oldToken:{domain:'account1',canonId:'stdtext1',mode:'text',caseInsensitive:false},
      newToken:{domain:'account2',canonId:'reviewed2',mode:'text',caseInsensitive:true},
    },
    {
      name:'temporal declarations',type:'BIGINT',
      before:{tokenDomain:'instant1',canonId:'stdtime1',epochUnit:'seconds',sourceTimezone:'UTC'},
      after:{tokenDomain:'instant2',canonId:'stdtime1',epochUnit:'milliseconds',sourceTimezone:'Europe/Paris'},
      oldToken:{domain:'instant1',canonId:'stdtime1',mode:'timestamp',caseInsensitive:false,epochUnit:'seconds',sourceTimezone:'UTC'},
      newToken:{domain:'instant2',canonId:'stdtime1',mode:'timestamp',caseInsensitive:false,epochUnit:'milliseconds',sourceTimezone:'Europe/Paris'},
    },
  ] as const)('VC-33: next policyVersion copies changed $name into a new read plan', ({type,before,after,oldToken,newToken}) => {
    const input = fixture([{name:'records',columns:[{name:'account_ref',type,treatment:'tokenized',declarations:before}]}]);
    const old = unwrap(compileViews(input)), saved = JSON.stringify(old);
    const replacement = new CatalogElement({...input.elements[0]!.state,...after});
    const next: CompileInput = {...input,policyVersion:input.policyVersion+1,elements:[replacement],
      objects:[unwrap(CatalogObject.create(input.objects[0]!.state,[replacement]))]};
    const current = unwrap(compileViews(next));
    expect(current.views[0]!.readPlan.columns[0]!.token).toEqual(newToken);
    expect(old.views[0]!.readPlan.columns[0]!.token).toEqual(oldToken);
    expect(JSON.stringify(old)).toBe(saved);
    expect(current.views[0]!.ddl).toBe(old.views[0]!.ddl);
    // Compiling the old snapshot again cannot pick up the newer declarations.
    expect(unwrap(compileViews(input))).toEqual(old);
  });

  it('H-003: setting withheld removes a previously readable field from the compiled projection and source read', () => {
    const input = fixture([{name:'records',columns:[
      {name:'record_id',treatment:'clear'},{name:'restricted_amount',type:'BIGINT',treatment:'clear'},
    ]}]);
    const element = input.elements[1]!, previous = input.entitlements.get(element.state.id)!;
    expect(unwrap(compileViews(input)).views[0]!.ddl).toContain('"restricted_amount"');
    const decisions = new Map(input.entitlements);
    decisions.set(element.state.id,unwrap(Entitlement.decide({...previous.state,treatment:'withheld'})));
    const result = unwrap(compileViews({...input,entitlements:decisions,policyVersion:input.policyVersion+1}));
    expect(result.views).toHaveLength(1);
    expect(result.views.map(v=>v.ddl).join('\n')).not.toContain('restricted_amount');
    expect(result.views[0]!.readPlan.columns.map(c=>c.sourceIdentifier)).toEqual(['native_0']);
    expect(result.views[0]!.columns.find(c=>c.elementId===element.state.id)).toMatchObject({state:'withheld',treatment:'withheld',expression:null});
  });

  it('H-005: tokenizing a BIGINT changes its read treatment and exposed type, while the view still selects treated staging', () => {
    const input = fixture([{name:'records',schema:'customer_schema',exposedSchema:'public',
      columns:[{name:'account_ref',source:'CustomerAccount',type:'BIGINT',treatment:'clear'}]}]);
    const plain = unwrap(compileViews(input)).views[0]!;
    const element = input.elements[0]!, decision = input.entitlements.get(element.state.id)!;
    const tokenized = unwrap(compileViews({...input,policyVersion:input.policyVersion+1,
      entitlements:new Map([[element.state.id,unwrap(Entitlement.decide({...decision.state,treatment:'tokenized'}))]])})).views[0]!;
    expect(plain.readPlan.columns[0]).toMatchObject({exposedType:'BIGINT',readAs:'native',treatment:'clear'});
    expect(tokenized.readPlan).toEqual({catalog:'fixture_catalog',schema:'customer_schema',object:'records',columns:[{
      sourceIdentifier:'CustomerAccount',exposedName:'account_ref',exposedType:'VARCHAR',treatment:'tokenized',readAs:'text',
      token:{domain:'fixture1',canonId:'stdnum1',mode:'number',caseInsensitive:false},
    }]});
    expect(tokenized.columns[0]).toMatchObject({declaredType:'VARCHAR',expression:'"account_ref"'});
    expect(tokenized.ddl).toBe('CREATE VIEW "fixture_catalog"."public"."records" AS SELECT "account_ref" FROM "__staging"."fixture_catalog__public__records";');
    expect(tokenized.ddl).toBe(plain.ddl);
  });
});
