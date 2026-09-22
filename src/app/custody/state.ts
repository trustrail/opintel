import { create } from 'zustand';
type Form = {projectId:string;action:'rotate'|'restore'|null;version:number|null;confirmation:string;reason:string;idempotencyKey:string};
const empty:Form={projectId:'',action:null,version:null,confirmation:'',reason:'',idempotencyKey:''};
export const useCustodyUi = create<Form & {
  show(projectId:string,action:'rotate'|'restore',version?:number):void;
  edit(patch:Partial<Pick<Form,'confirmation'|'reason'>>):void;close():void;
}>(set=>({...empty,show:(projectId,action,version)=>set({...empty,projectId,action,version:version??null,idempotencyKey:crypto.randomUUID()}),
  edit:patch=>set(state=>({...patch,...(patch.reason!==undefined&&patch.reason!==state.reason?{idempotencyKey:crypto.randomUUID()}:{})})),close:()=>set({...empty})}));
