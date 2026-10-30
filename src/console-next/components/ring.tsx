import {consoleLink} from '../../shared/console-destinations.mjs';
import {Pie} from '@visx/shape';
import {Group} from '@visx/group';
import type {Spectrum} from '../../shared/api/dashboard.js';
import {treatmentOrder,treatmentColor,treatmentNames,type Treatment} from './treatment.js';
export type RingSegment={key:string;label:string;value:number;color:string;kind?:Treatment};
/** Shared chart for report bands. It has no independent data or loading animation. */
export function Ring({spectrum,selected,onSelect,center,caption,compactCaption,labels,segments,onSegment,onCenter,label='Column treatments across pools'}:{spectrum:Spectrum;selected:Treatment|null;onSelect:(kind:Treatment|null)=>void;center?:string;caption?:string;compactCaption?:string;labels?:Partial<Record<Treatment,string>>;label?:string;segments?:RingSegment[];onSegment?:(key:string)=>void;onCenter?:()=>void}){
 const name=(kind:Treatment)=>labels?.[kind]??treatmentNames[kind];
 const data:RingSegment[]=segments??treatmentOrder.map(kind=>({key:kind,kind,label:name(kind),color:treatmentColor(kind),value:spectrum[kind]})),total=data.reduce((n,d)=>n+d.value,0);
 const choose=(d:RingSegment)=>{if(segments)onSegment?.(d.key);else if(d.kind)onSelect(selected===d.kind?null:d.kind);};
 if(!total&&!segments)return <p data-state="empty">No column decisions yet.</p>;
 return <svg data-ring viewBox="0 0 280 280" role="group" aria-label={label}>
  {!total&&<circle cx={140} cy={140} r={99} fill="none" stroke="var(--rail-active)" strokeWidth={34}/>}<Group top={140} left={140}><Pie data={data} pieValue={d=>d.value} pieSort={null} pieSortValues={null} innerRadius={82} outerRadius={116}>{({arcs,path})=>arcs.filter(a=>a.data.value>0).map(arc=><a key={arc.data.key} href={consoleLink("#exposure")} onClick={event=>{event.preventDefault();choose(arc.data);}} aria-label={`${arc.data.value} ${arc.data.label}`}><path d={path(arc)??undefined} fill={arc.data.color} opacity={selected&&selected!==arc.data.kind?0.25:1}><title>{arc.data.label}: {arc.data.value}</title></path></a>)}</Pie></Group>
  <a href={consoleLink("#exposure")} aria-label={center?`View ${caption}`:'View clear columns'} onClick={event=>{event.preventDefault();if(onCenter)onCenter();else onSelect('clear');}}><text x={140} y={147} data-ring-number textAnchor="middle">{center??(selected?spectrum[selected]:`${Math.round(spectrum.clear/total*100)}%`)}</text><text x={140} y={175} data-ring-caption textAnchor="middle"><tspan data-ring-wide-caption>{caption??(selected?treatmentNames[selected]:'in the clear')}</tspan>{compactCaption&&<tspan data-ring-compact-caption>{compactCaption}</tspan>}</text></a>
 </svg>;
}
