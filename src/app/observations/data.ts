import {useQuery} from '@tanstack/react-query';
import {createApiClient,type AppError} from '../../shared/api/index.js';
import {ObservationPage,ObservationMemberPage} from '../../shared/api/observations.js';
import type {ObservationGroup,ObservationMember} from '../../shared/api/observations.js';
import {observationKeys} from './keys.js';
const api=createApiClient();
const base=(p:string,custody:boolean)=>`/api/v1/projects/${p}/${custody?'custody-observations':'observations'}`;
export async function readObservationMembers(project:string,group:string,view:'open'|'resolved',custody:boolean){
 const items:ObservationMember[]=[];let cursor:string|null=null;
 do{const q=new URLSearchParams({group,view});if(cursor)q.set('cursor',cursor);const result=await api.request({path:base(project,custody)+'/members?'+q,response:ObservationMemberPage});if(!result.ok)throw result.error;items.push(...result.value.items);cursor=result.value.nextCursor;}while(cursor);
 return items;
}
export function useObservationGroups(project:string,view:'open'|'resolved',custody=false,enabled=true){return useQuery<{items:ObservationGroup[];counts:{open:number;resolved:number}},AppError>({queryKey:observationKeys.groups(project,view,custody),enabled,queryFn:async()=>{
 const items:ObservationGroup[]=[];let cursor:string|null=null,counts={open:0,resolved:0};
 do{const q=new URLSearchParams({view});if(cursor)q.set('cursor',cursor);const result=await api.request({path:base(project,custody)+'?'+q,response:ObservationPage});if(!result.ok)throw result.error;items.push(...result.value.items);counts=result.value.counts;cursor=result.value.nextCursor;}while(cursor);return {items,counts};
 },retry:false,refetchInterval:30_000,staleTime:0});}
export function useObservationMembers(project:string,group:ObservationGroup,open:boolean){return useQuery<ObservationMember[],AppError>({queryKey:observationKeys.members(project,group.id,group.state,group.kind==='custody'),enabled:open,queryFn:()=>readObservationMembers(project,group.id,group.state,group.kind==='custody'),retry:false,refetchInterval:open?30_000:false,staleTime:0});}
