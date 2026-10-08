import type {ActivityEntry} from '../../shared/api/activity.js';

/** Labels depend on recorded object references, never parsed/hidden arguments. */
export function requestLabel(r:ActivityEntry){
 if(r.status==='incomplete')return 'Started a request';
 if(r.recordKind==='rollup')return 'Retained answer summary';
 const n=r.metadata.objects?.length;
 if(n===undefined)return r.status==='refused'?'Request refused · plan not recorded':r.status==='failed'?'Request failed · plan not recorded':'Answer recorded · plan not captured';
 const objects=`${n} ${n===1?'object':'objects'}`;
 return r.status==='refused'||r.status==='failed'?`Planned to read ${objects}`:`Read ${objects}`;
}
export const treatmentLabels:Record<string,string>={clear:'In the clear',tokenized:'Tokenized',masked:'Masked',aggregate_only:'Aggregate only',withheld:'Withheld',undecided:'Needs a decision'};
export function shortPath(value:string){return value.split('.').slice(-2).join('.');}
export function evidenceElementName(r:Pick<import('../../shared/api/activity.js').EvidenceDetail,'objects'>,id:string|null,name:string){
 const objects=id?r.objects.filter(o=>o.columns.some(c=>c.elementId===id)):[];
 return {short:objects.length===1?`${objects[0]!.name}.${name}`:name,full:objects.map(o=>`${o.catalog}.${o.schema}.${o.name}.${name}`).join(' · ')||name};
}
