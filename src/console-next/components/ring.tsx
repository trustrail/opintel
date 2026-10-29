import {Pie} from '@visx/shape';
import {Group} from '@visx/group';
import type {Spectrum} from '../../shared/api/dashboard.js';
import {treatmentOrder,treatmentColor,treatmentNames,type Treatment} from './treatment.js';
/** Shared chart for report bands. It has no independent data or loading animation. */
export function Ring({spectrum,selected,onSelect}:{spectrum:Spectrum;selected:Treatment|null;onSelect:(kind:Treatment|null)=>void}){
 const total=treatmentOrder.reduce((n,k)=>n+spectrum[k],0),data=treatmentOrder.map(kind=>({kind,value:spectrum[kind]}));
 if(!total)return <p data-state="empty">No column decisions yet.</p>;
 return <svg data-ring viewBox="0 0 280 280" role="group" aria-label="Column treatments across pools">
  <Group top={140} left={140}><Pie data={data} pieValue={d=>d.value} pieSort={null} pieSortValues={null} innerRadius={82} outerRadius={116}>{({arcs,path})=>arcs.filter(a=>a.data.value>0).map(arc=><a key={arc.data.kind} href="#exposure" onClick={event=>{event.preventDefault();onSelect(selected===arc.data.kind?null:arc.data.kind);}} aria-label={`${arc.data.value} ${treatmentNames[arc.data.kind]}`}><path d={path(arc)??undefined} fill={treatmentColor(arc.data.kind)} opacity={selected&&selected!==arc.data.kind?0.25:1}><title>{treatmentNames[arc.data.kind]}: {arc.data.value}</title></path></a>)}</Pie></Group>
  <a href="#exposure" aria-label="View clear columns" onClick={event=>{event.preventDefault();onSelect('clear');}}><text x={140} y={147} data-ring-number textAnchor="middle">{selected?spectrum[selected]:`${Math.round(spectrum.clear/total*100)}%`}</text><text x={140} y={175} data-ring-caption textAnchor="middle">{selected?treatmentNames[selected]:'in the clear'}</text></a>
 </svg>;
}
