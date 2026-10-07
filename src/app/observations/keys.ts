import {projectKeys} from '../tenancy/data.js';
export const observationKeys={all:(p:string)=>[...projectKeys.scope(p),'observation'] as const,groups:(p:string,view:string,custody:boolean)=>[...observationKeys.all(p),'groups',view,custody] as const,members:(p:string,group:string,view:string,custody:boolean)=>[...observationKeys.all(p),'members',group,view,custody] as const};
