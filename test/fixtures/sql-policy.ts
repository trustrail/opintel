import { ElementId } from '../../src/shared/kernel/index.js';
import type { TreatmentPolicy } from '../../sidecar/sql/index.js';
export function sqlPolicy(tables:{catalog:string;schema:string;name:string;columns:{name:string;treatment?:'clear'|'masked'|'tokenized'|'aggregate_only';tokenDomain?:string}[]}[],threshold=5):TreatmentPolicy{
 let next=0;
 const entitlements:TreatmentPolicy['entitlements']=[];
 const readPlan=tables.map(t=>({...t,columns:t.columns.map(c=>{
  const elementId=ElementId(`00000000-0000-4000-8000-${String(++next).padStart(12,'0')}`);
  entitlements.push({elementId,treatment:c.treatment??'clear'});return {name:c.name,elementId,...(c.treatment==='tokenized'?{tokenDomain:c.tokenDomain??'fixture'}:{})};
 })}));
 return {aggregateMinGroupSize:threshold,readPlan,entitlements};
}
