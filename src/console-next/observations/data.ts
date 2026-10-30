import {z} from 'zod';
import {createApiClient} from '../../shared/api/client.js';
import {ObservationPage,ObservationMemberPage,type ObservationGroup,type ObservationMember} from '../../shared/api/observations.js';
import type {NeedsYouItem} from '../../shared/api/needs-you.js';
import type {ProjectHealthItem,ProjectHealth} from '../../shared/api/project-health.js';
import {CatalogTreeResponse} from '../../shared/api/catalog.js';
import {pages,read,type Client} from '../api.js';
export const observationKeys={all:(p:string)=>['console-next','project',p,'contextual-observations'] as const,open:(p:string)=>[...observationKeys.all(p),'open'] as const,group:(p:string,g:string,view:string)=>[...observationKeys.all(p),'group',g,view] as const};
export async function readObservationGroup(project:string,group:string,client:Client=createApiClient(),view:'open'|'resolved'='open'){return (await pages(client,`/api/v1/projects/${project}/observations/members?${new URLSearchParams({group,view,limit:'100'})}`,ObservationMemberPage,Infinity)).items;}
export async function openObservations(project:string,client:Client=createApiClient()){
 const groups=(await pages(client,`/api/v1/projects/${project}/observations?view=open&limit=100`,ObservationPage,Infinity)).items;
 const result:Array<{group:ObservationGroup;members:ObservationMember[]}>=[];
 for(const group of groups)result.push({group,members:await readObservationGroup(project,group.id,client)});
 return result;
}
export const backupProblem=(h:ProjectHealthItem)=>h.kind==='token_key'&&h.status!=='ok'&&/backup|rehears/i.test(h.reason);
export function contextualHealth(project:string,items:ProjectHealthItem[]):ProjectHealth{
 const backup=items.find(backupProblem);return {items:items.map(h=>backup&&(h.kind==='custody'||h.kind==='token_key')?{...h,status:'down',reason:backup.reason,next_action:{label:'Verify key backup',href:`/projects/${project}/token-key?verify=true`}}:h)};
}
export async function contextualNeeds(project:string,items:NeedsYouItem[],client:Client=createApiClient()):Promise<NeedsYouItem[]>{
 const base=items.map(i=>i.id.startsWith('check:token-key:')?{...i,title:'Verify key backup',targetRoute:`/projects/${project}/token-key?verify=true`}:i);
 if(!base.some(i=>i.kind==='observation'&&!i.id.startsWith('observation:custody:')))return base;
 const observations=await openObservations(project,client),held=observations.filter(g=>g.group.kind==='filing'),types=observations.filter(g=>g.group.kind==='type'),out:NeedsYouItem[]=[];
 const unsupported=new Map<string,Set<string>>();
 if(types.length){
  const sourceIds=new Set(types.flatMap(g=>g.members.flatMap(m=>m.metadata.sourceId?[m.metadata.sourceId]:[])));
  for(const source of sourceIds){let cursor:string|null=null;const seenTables=new Set<string>();do{const page:z.infer<typeof CatalogTreeResponse>=await read(client,`/api/v1/projects/${project}/catalog?${new URLSearchParams({parent:'objects:'+source,limit:'100',...cursor?{cursor}:{}})}`,CatalogTreeResponse);for(const table of page.nodes){let next:string|null=null;const seenColumns=new Set<string>();do{const columns:z.infer<typeof CatalogTreeResponse>=await read(client,`/api/v1/projects/${project}/catalog?${new URLSearchParams({parent:table.id,limit:'100',...next?{cursor:next}:{}})}`,CatalogTreeResponse);const names=unsupported.get(table.id)??new Set<string>();for(const c of columns.nodes)if(c.state==='unsupported'&&c.label)names.add(c.label);unsupported.set(table.id,names);next=columns.nextCursor;if(next&&seenColumns.has(next))throw new Error('Catalogue changed while loading. Retry.');if(next)seenColumns.add(next);}while(next);}cursor=page.nextCursor;if(cursor&&seenTables.has(cursor))throw new Error('Catalogue changed while loading. Retry.');if(cursor)seenTables.add(cursor);}while(cursor);}
 }
 for(const item of base){
  if(item.kind==='observation'&&(item.id.startsWith('observation:filing:')||item.id.startsWith('observation:type:')))continue;
  if(item.kind==='undecided_entitlement'&&item.context){const targets=item.context.targets.filter(t=>!t.columnName||!unsupported.get(t.tableId)?.has(t.columnName));if(!targets.length)continue;out.push({...item,count:targets.length,context:{...item.context,targets}});}else out.push(item);
 }
 if(held.length){const count=held.reduce((n,g)=>n+g.members.length,0),sources=[...new Set(held.flatMap(g=>g.members.flatMap(m=>m.metadata.sourceId?[m.metadata.sourceId]:[])))];if(count)out.push({id:'context:held-filings',kind:'observation',title:`${count} ${count===1?'filing':'filings'} held`,count,roles:['admin','operator'],targetRoute:`/projects/${project}/data-sources?${new URLSearchParams({held:'true',operator:'true',...sources.length===1?{sourceId:sources[0]!}:{}})}`});}
 return out;
}
