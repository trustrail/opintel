import {projectKeys} from '../tenancy/data.js';
export const custodyProviderKeys={status:(p:string)=>[...projectKeys.scope(p),'custody-provider'] as const};
