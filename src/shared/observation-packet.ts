import {ObservationGroup,ObservationMember} from './api/observations.js';
import {observationCopy,resolutionLabel} from './observation-copy.js';
export function prepareOperatorPacket(groups:readonly {group:ObservationGroup;members:readonly ObservationMember[]}[],preparedAt:string){
 return ['Opintel — prepared for the Engine operator',`Prepared at: ${preparedAt}`,'This packet is prepared for the reader to carry. Opintel has not sent it to anyone.',
 'The full reason stays in the customer environment because it may contain file contents. No filenames, file contents or customer-local reasons are included.',
 ...groups.flatMap(entry=>{
  // Re-parse the allowlisted projection; extras never become packet content.
  const group=ObservationGroup.parse(entry.group),copy=observationCopy(group);if(group.kind!=='filing')return [];
  const members=entry.members.map(m=>ObservationMember.parse(m));
  return ['',copy.title,group.state==='open'?copy.consequence:'Recorded quarantine history; see each filing’s resolution below.',`Resolved by: ${copy.owner}.`,`What the operator needs to do: ${group.state==='open'?copy.instructions:'Review the local register if diagnosing the earlier quarantine; no retry is requested for a landed filing.'}`,
   ...members.flatMap(m=>['',`Filing ID: ${m.metadata.filingId}`,`Landing zone ID: ${m.metadata.zoneId}`,`Engine: ${m.metadata.engineName??'Not recorded'}; engine ID: ${m.metadata.engineId??'Not recorded'}`,`Received: ${m.observedAt}`,`State: ${m.state}`,...(m.resolvedAt?[`Resolution: ${resolutionLabel(m.resolution)} Recorded at: ${m.resolvedAt}`]:[]),...m.history.map(h=>`History: ${h.at} — ${h.cause} — ${h.state}${h.resolution?`; ${resolutionLabel(h.resolution)}`:''}`)])];
 })].join('\n');
}
