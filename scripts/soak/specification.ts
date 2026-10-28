/** Serializable contract emitted by the demo seeder. Contains synthetic values only. */
import {z} from 'zod';
export const cell=z.union([z.string(),z.number(),z.boolean(),z.null()]);
export const treatment=z.enum(['clear','tokenized','masked','aggregate_only','withheld','custody','undecided']);
export const objectExpectation=z.object({name:z.string(),poolIndex:z.number().int(),contributorKey:z.string().nullable().optional(),rowFilter:z.string().nullable(),rowMode:z.enum(['filtered','unfiltered','missing']),expectedRowCount:z.number().int(),rows:z.array(z.record(z.string(),cell)),columns:z.array(z.object({name:z.string(),tokenDomain:z.string().nullable().optional(),type:z.string(),treatment,outcome:z.string(),mask:z.literal('last4').nullable()}))});
export const scenario=z.object({id:z.string(),poolIndex:z.number().int(),kind:z.string(),sql:z.string(),objects:z.array(z.string()),columns:z.array(z.object({object:z.string(),name:z.string(),alias:z.string(),side:z.string()})),credentialId:z.string().optional(),expected:z.object({outcome:z.string(),reason:z.string().optional(),cause:z.string().optional(),suggestionCandidate:z.boolean().optional(),resultColumns:z.array(z.string()).optional(),resultRows:z.array(z.array(cell)).optional(),tokenRelations:z.array(z.object({left:z.string(),right:z.string(),equal:z.boolean()})).optional(),rowCount:z.number().int().optional(),rows:z.array(z.record(z.string(),cell)).optional()}),credential:z.enum(['normal','retiring','revoked']).default('normal'),requiresCustody:z.boolean().default(false)});
export const specification=z.object({version:z.literal(2),objects:z.array(objectExpectation),scenarios:z.array(scenario),literals:z.array(z.string())});
export type Specification=z.infer<typeof specification>;
export type Scenario=z.infer<typeof scenario>;
export type ObjectExpectation=z.infer<typeof objectExpectation>;
export class Coverage {
 private observations=new Map<string,{count:number;matched:number;observed:Record<string,number>}>();
 constructor(readonly scenarios:Scenario[]){}
 observe(s:Scenario,actual:{outcome:string;rowCount?:number;reason?:string;cause?:string}){const r=this.observations.get(s.id)??{count:0,matched:0,observed:{}};r.count++;const matches=(s.expected.cause===undefined||s.expected.cause===actual.cause)&&actual.outcome===s.expected.outcome&&(s.expected.reason===undefined||s.expected.reason===actual.reason)&&(s.expected.rowCount===undefined||s.expected.rowCount===actual.rowCount);if(matches)r.matched++;const key=JSON.stringify(actual);r.observed[key]=(r.observed[key]??0)+1;this.observations.set(s.id,r);return matches;}
 summary(){const scenarios=this.scenarios.map(s=>{const r=this.observations.get(s.id);return {id:s.id,expected:s.expected,count:r?.count??0,matched:r?.matched??0,observed:r?.observed??{},status:!r?'NOT EXERCISED':r.matched===r.count?'PASS':'FAIL'};});const exercised=scenarios.filter(s=>s.count>0).length;return {declared:scenarios.length,exercised,percent:scenarios.length?Math.round(100*exercised/scenarios.length):0,unhit:scenarios.filter(s=>!s.count).map(s=>s.id),scenarios};}
}
