import type {Spectrum} from '../../shared/api/dashboard.js';
import {Tip} from './kind.js';
export const treatmentOrder=['clear','tokenized','masked','aggregate_only','custody','withheld','undecided'] as const;
export type Treatment=typeof treatmentOrder[number];
export const treatmentNames:Record<Treatment,string>={clear:'Clear',tokenized:'Tokenized',masked:'Masked',aggregate_only:'Aggregate only',custody:'Under custody',withheld:'Withheld',undecided:'Undecided'};
export const treatmentColor=(kind:Treatment)=>`var(--treatment-${kind})`;
/** One mark contract, including its accessible name, used in ring and legend. */
export function TreatmentMark({kind}:{kind:Treatment}){
 const mark=kind==='clear'?<circle cx={8} cy={8} r={6} fill="currentColor"/>:kind==='masked'?<><circle cx={8} cy={8} r={5.5}/><path d="M8 2.5a5.5 5.5 0 0 0 0 11Z" fill="currentColor"/></>:kind==='custody'?<><circle cx={8} cy={8} r={6} fill="currentColor"/><path d="M6.5 7V6a1.5 1.5 0 0 1 3 0v1M6 7.5h4V11H6Z" data-mark-inverse/></>:kind==='withheld'?<><circle cx={8} cy={8} r={5.5}/><path d="m4 12 8-8"/></>:kind==='undecided'?<circle cx={8} cy={8} r={5.5} strokeDasharray="2 2"/>:kind==='aggregate_only'?<><circle cx={8} cy={8} r={5.5}/><circle cx={6} cy={6} r={.5}/><circle cx={10} cy={6} r={.5}/><circle cx={8} cy={10} r={.5}/></>:<><circle cx={8} cy={8} r={5.5}/><circle cx={8} cy={8} r={1.5} fill="currentColor"/></>;
 return <span data-treatment={kind} role="img" aria-label={treatmentNames[kind]}><svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">{mark}</svg></span>;
}
export function TreatmentLegend({spectrum,selected,onSelect}:{spectrum:Spectrum;selected:Treatment|null;onSelect:(kind:Treatment|null)=>void}){return <ul data-treatment-legend>{treatmentOrder.map(kind=><li key={kind}><Tip label={treatmentNames[kind]}><a href="#exposure" aria-current={selected===kind?'true':undefined} onClick={event=>{event.preventDefault();onSelect(selected===kind?null:kind);}} aria-label={`${spectrum[kind]} ${treatmentNames[kind]}`}><TreatmentMark kind={kind}/><strong>{spectrum[kind]}</strong></a></Tip></li>)}</ul>;}
