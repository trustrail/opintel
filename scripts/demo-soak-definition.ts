/** Seeder-owned generator and expectations. Never imports a database or a query reader. */
import pack from '../src/modules/sources/demo/reinsurance.json' with {type:'json'};
import {specification,type Specification,type Scenario} from './soak/specification.js';
const base=pack.conformance;
type Row=Record<string,string|number|boolean|null>;
export const demoTables:Array<{schema:string;name:string;rows:Row[]}>= [
 {schema:'soak_policies',name:'policies',rows:base.policies},
 {schema:'soak_claims',name:'claims',rows:base.claims},
 {schema:'soak_policies',name:'treaty_reference',rows:base.treaty_reference},
 {schema:'soak_recoveries',name:'recoveries',rows:base.policies.flatMap((r,i)=>[{cedant:r.cedant,policy_id:r.policy_id,recovery_id:'REC-'+i,insured_name:i%3===0?null:i%3===1?'':'Élodie 東京 🦊',pool_only:'POOL-'+i,undecided_note:'NOT-DECIDED-'+i,recovery_secret:'SECRET-'+i,shape_value:[null,'','Élodie 東京 🦊','x'.repeat(8192),'v1_policy_00000000000000000000000000'][i%5]!},...(i===0?[{cedant:r.cedant,policy_id:r.policy_id,recovery_id:'REC-DUPLICATE',insured_name:'Duplicate entity',pool_only:'POOL-DUP',undecided_note:'NOT-DECIDED-DUP',recovery_secret:'SECRET-DUP',shape_value:'duplicate'}]:[])])},
 {schema:'soak_recoveries',name:'unmatched',rows:base.cedants.map((cedant,i)=>({cedant,policy_id:'DISJOINT-'+i,reference_id:'UNMATCHED-'+i}))},
 ...['semantics_left','semantics_right'].map(name=>({schema:'soak_recoveries',name,rows:base.cedants.flatMap(cedant=>['AA-1111','BB-1111','AA-1111','CC-2222',null].map((value,i)=>({cedant,case_id:'CASE-'+i,masked_value:value,shared_key:value,isolated_key:value})))})),
 {schema:'soak_recoveries',name:'open_reference',rows:[{reference_id:'OPEN-1',description:null},{reference_id:'OPEN-2',description:''},{reference_id:'OPEN-3',description:'東京'}]},
];
export function declaredTokenDomain(column:string){return column==='policy_id'?'policy':column==='shared_key'?'soakshared':null;}
export function declaredContributorKey(object:string){return object==='claims'?'policy_id':null;}
export function declaredTreatment(object:string,column:string,pool:number){
 if(column==='undecided_note'||column==='pool_only'&&pool===1)return 'undecided' as const;
 if(['policy_id','shared_key','isolated_key'].includes(column))return 'tokenized' as const;
 if(column==='insured_name'||column==='masked_value')return 'masked' as const;
 if(column==='claim_amount')return 'aggregate_only' as const;
 if(column==='underwriter_note')return 'withheld' as const;
 if(column==='risk_code')return pool===0?'custody' as const:'masked' as const;
 if(column==='recovery_secret')return pool===1?'custody' as const:'clear' as const;
 // Existing operator demo uses this second custody path too.
 if(object==='policies'&&column==='broker_reference'&&pool===1)return 'custody' as const;
 return 'clear' as const;
}
export function declaredRows(name:string,pool:number){const rows=demoTables.find(t=>t.name===name)!.rows;return name==='open_reference'?rows:name==='treaty_reference'?[]:rows.filter(r=>r.cedant===base.cedants[pool]);}
export function declaredFilter(name:string,pool:number){return name==='open_reference'||name==='treaty_reference'&&pool===1?null:name==='treaty_reference'?"treaty_ref = 'NO_SUCH_TREATY'":`cedant = '${base.cedants[pool]}'`;}
const q=(s:string)=>'"'+s.replaceAll('"','""')+'"',table=(s:string)=>s.split('.').map(q).join('.');
export function generateSpecification(names:Record<string,string>,agents:Array<{credentialId:string;poolIndex:number;association?:unknown}>=[]):Specification {
 const objects= [0,1].flatMap(poolIndex=>demoTables.map(t=>({name:names[t.name]!,poolIndex,contributorKey:declaredContributorKey(t.name),rowFilter:declaredFilter(t.name,poolIndex),rowMode:t.name==='open_reference'?'unfiltered' as const:t.name==='treaty_reference'&&poolIndex===1?'missing' as const:'filtered' as const,expectedRowCount:declaredRows(t.name,poolIndex).length,rows:declaredRows(t.name,poolIndex),columns:Object.keys(t.rows[0]!).map(name=>{const treatment=declaredTreatment(t.name,name,poolIndex);return {name,tokenDomain:treatment==='tokenized'?declaredTokenDomain(name):null,type:name==='claim_amount'?'INTEGER':name==='loss_date'?'DATE':'VARCHAR',treatment,outcome:treatment==='undecided'?'entitlement_missing':treatment==='withheld'?'element_withheld':treatment==='aggregate_only'?'unsupported_on_aggregate_only':'success',mask:treatment==='masked'?'last4' as const:null};})})));
 const scenarios:Scenario[]=[];
 for(const o of objects){
  for(const c of o.columns){const anchor=o.columns.find(c=>c.treatment==='clear'&&['recovery_id','claim_id','treaty_ref','reference_id','case_id'].includes(c.name))??o.columns.find(c=>c.treatment==='clear')!;const columns=[...new Set([anchor.name,c.name])].map(name=>({object:o.name,name,alias:name,side:'a'}));
   scenarios.push({id:`pool${o.poolIndex}/${o.name}/${c.name}/${c.treatment}`,poolIndex:o.poolIndex,kind:'declared column',sql:`SELECT ${columns.map(c=>q(c.name)).join(',')} FROM ${table(o.name)}`,objects:[o.name],columns,expected:{outcome:c.outcome,...c.outcome==='success'?{rowCount:o.expectedRowCount,rows:o.rows}:{}},credential:'normal',requiresCustody:c.treatment==='custody'});
   if(c.treatment==='aggregate_only'){const v=o.rows.map(r=>r[c.name]).filter((v):v is number=>typeof v==='number');scenarios.push({id:`pool${o.poolIndex}/${o.name}/${c.name}/aggregate`,poolIndex:o.poolIndex,kind:'declared aggregate',sql:`SELECT COUNT(${q(c.name)}) AS n,SUM(${q(c.name)}) AS total FROM ${table(o.name)}`,objects:[o.name],columns:[],expected:{outcome:'success',rowCount:1,rows:[{n:v.length,total:v.reduce((a,b)=>a+b,0)}]},credential:'normal',requiresCustody:false});}
  }
 }
 for(const poolIndex of [0,1])for(const group of [['policies','unmatched'],['policies','claims','recoveries']]){
  const joined=group.map(n=>objects.find(o=>o.poolIndex===poolIndex&&o.name===names[n])!);let matches=joined[0]!.rows.map(r=>[r]);for(const o of joined.slice(1))matches=matches.flatMap(rs=>o.rows.filter(r=>r.policy_id===rs[0]!.policy_id).map(r=>[...rs,r]));
  const columns=joined.flatMap((o,i)=>o.columns.filter(c=>c.name==='policy_id'||c.treatment==='clear').map(c=>({object:o.name,name:c.name,alias:String.fromCharCode(97+i)+'_'+c.name,side:String.fromCharCode(97+i)})));
  scenarios.push({id:`pool${poolIndex}/join/${group.join('-')}`,poolIndex,kind:'declared join',sql:`SELECT ${columns.map(c=>`${c.side}.${q(c.name)} AS ${q(c.alias)}`).join(',')} FROM ${table(joined[0]!.name)} a `+joined.slice(1).map((o,i)=>`JOIN ${table(o.name)} ${String.fromCharCode(98+i)} ON a.policy_id=${String.fromCharCode(98+i)}.policy_id`).join(' '),objects:joined.map(o=>o.name),columns,expected:{outcome:'success',rowCount:matches.length,rows:matches.map(rs=>Object.fromEntries(columns.map(c=>[c.alias,rs[c.side.charCodeAt(0)-97]![c.name]!])))},credential:'normal',requiresCustody:false});
 }
 for(const poolIndex of [0,1]){
  const o=objects.find(o=>o.poolIndex===poolIndex&&o.name===names.recoveries)!;
  for(const [label,predicate] of Object.entries({null:(r:Row)=>r.shape_value===null,empty:(r:Row)=>r.shape_value==='',unicode:(r:Row)=>r.shape_value==='Élodie 東京 🦊',long:(r:Row)=>typeof r.shape_value==='string'&&r.shape_value.length===8192,'token-looking literal':(r:Row)=>r.shape_value==='v1_policy_00000000000000000000000000',duplicate:(r:Row)=>r.recovery_id==='REC-DUPLICATE'})){
   const selected=o.rows.filter(predicate);if(!selected.length)continue;
   const row=selected[0]!;const columns=['recovery_id','policy_id','insured_name','shape_value'].map(name=>({object:o.name,name,alias:name,side:'a'}));
   scenarios.push({id:`pool${poolIndex}/shape/${label}`,poolIndex,kind:'declared shape',sql:`SELECT ${columns.map(c=>q(c.name)).join(',')} FROM ${table(o.name)} WHERE recovery_id = '${row.recovery_id}'`,objects:[o.name],columns,expected:{outcome:'success',rowCount:1,rows:[row]},credential:'normal',requiresCustody:false});
  }
 }
 // J-029 and A1/B4a: expectations derive only from this synthetic declaration.
 for(const poolIndex of [0,1]){
  const left=objects.find(o=>o.poolIndex===poolIndex&&o.name===names.semantics_left)!,right=objects.find(o=>o.poolIndex===poolIndex&&o.name===names.semantics_right)!;
  const masks=left.rows.map(r=>r.masked_value===null?null:'••••'+String(r.masked_value).slice(-4));
  const groups=[...new Set(masks)].map(value=>[value,masks.filter(v=>v===value).length]);
  const common={poolIndex,kind:'treatment semantics',credential:'normal' as const,requiresCustody:false};
  const maskedColumn={object:left.name,name:'masked_value',alias:'masked_value',side:'a'};
  scenarios.push(
   {...common,id:`pool${poolIndex}/semantics/masked-group`,sql:`SELECT masked_value, COUNT(*) AS n FROM ${table(left.name)} GROUP BY masked_value`,objects:[left.name],columns:[maskedColumn],expected:{outcome:'success',rowCount:groups.length,resultColumns:['masked_value','n'],resultRows:groups}},
   {...common,id:`pool${poolIndex}/semantics/masked-distinct`,sql:`SELECT DISTINCT masked_value FROM ${table(left.name)}`,objects:[left.name],columns:[maskedColumn],expected:{outcome:'success',rowCount:groups.length,resultColumns:['masked_value'],resultRows:groups.map(r=>[r[0]!])}},
   {...common,id:`pool${poolIndex}/semantics/union`,sql:`SELECT masked_value FROM ${table(left.name)} UNION SELECT masked_value FROM ${table(right.name)}`,objects:[left.name,right.name],columns:[maskedColumn],expected:{outcome:'sql_not_permitted'}},
   {...common,id:`pool${poolIndex}/semantics/isolated-join`,sql:`SELECT a.case_id FROM ${table(left.name)} a JOIN ${table(right.name)} b ON a.isolated_key=b.isolated_key`,objects:[left.name,right.name],columns:[{object:left.name,name:'case_id',alias:'case_id',side:'a'}],expected:{outcome:'unsupported_on_token',cause:'unsatisfiable_token_join',suggestionCandidate:true}},
  );
  const columns=[{object:left.name,name:'case_id',alias:'case_id',side:'a'},...[{side:'a',o:left},{side:'b',o:right}].flatMap(({side,o})=>['shared_key','isolated_key'].map(name=>({object:o.name,name,alias:side+'_'+name,side})))];
  scenarios.push({...common,id:`pool${poolIndex}/semantics/token-domains`,sql:`SELECT ${columns.map(c=>`${c.side}.${q(c.name)} AS ${q(c.alias)}`).join(',')} FROM ${table(left.name)} a JOIN ${table(right.name)} b ON a.case_id=b.case_id`,objects:[left.name,right.name],columns,expected:{outcome:'success',rowCount:left.rows.length,rows:left.rows.map(r=>({case_id:r.case_id!,a_shared_key:r.shared_key!,a_isolated_key:r.isolated_key!,b_shared_key:r.shared_key!,b_isolated_key:r.isolated_key!})),tokenRelations:[{left:'a_shared_key',right:'b_shared_key',equal:true},{left:'a_isolated_key',right:'b_isolated_key',equal:false}]}});
 }
 const custody=scenarios.find(s=>s.poolIndex===0&&s.requiresCustody)!;
 scenarios.push({...custody,id:'credential/retiring/custody',credential:'retiring'},{...custody,id:'credential/revoked',credential:'revoked',requiresCustody:false,expected:{outcome:'unauthenticated'}});
 const declared=agents.length?scenarios.flatMap(s=>s.requiresCustody&&s.credential==='normal'?agents.filter(a=>a.poolIndex===s.poolIndex).map(a=>({...s,id:s.id+'/credential/'+a.credentialId,credentialId:a.credentialId,expected:a.association?s.expected:{outcome:'dependency_unavailable',reason:'certificate_association_missing'}})):[s]):scenarios;
 return specification.parse({version:2,objects,scenarios:declared,literals:demoTables.flatMap(t=>t.rows.flatMap(r=>Object.values(r).filter(v=>typeof v==='string'&&v.length>0)))});
}
