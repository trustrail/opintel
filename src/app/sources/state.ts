import { create } from 'zustand';
import type { NewSource } from '../../shared/api/source-schemas.js';
const empty:NewSource={name:'',kind:'postgres',credentialRef:'',includeSchemas:[],samplingConsent:false,receivesLandings:false,landingStrategy:null};
export const useSourceUi=create<{projectId:string;open:boolean;step:1|2;form:NewSource;show(id:string):void;close():void;next():void;edit(value:Partial<NewSource>):void;}>(set=>({projectId:'',open:false,step:1,form:empty,show:projectId=>set({projectId,open:true,step:1,form:{...empty}}),close:()=>set({open:false}),next:()=>set({step:2}),edit:value=>set(state=>({form:{...state.form,...value}}))}));
