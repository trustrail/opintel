/** Compatibility entrypoint for installed operator commands. Governance writes
 * use public API contracts; no service/repository or metadata database access. */
import {seedOptions} from './seed-options.js';
import {api,required,OperatorConflict} from './common.js';
import {custodyAgents} from '../soak/custody.js';
import {setupV01} from '../soak/public-setup.js';
export async function provisionReinsurance(projectId:string,engineId:string,associationFile:string|undefined,file:string,credentialRef:string,lifecycle=false,renew=false){
 if(!associationFile)throw new OperatorConflict('Supply four authorized certificate identities');
 const options=await seedOptions();
 if(!options.sessionFile)throw new OperatorConflict('Normal administrator session required for public V-01 setup');
 const devices=custodyAgents(associationFile,required('OPINTEL_XQ_API_KEY'),()=>{},()=>{});
 try{return await setupV01({projectId,engineId,credentialRef,manifestFile:file,associations:await devices.associations(),call:(path,method,body)=>api(path,method,body,options.sessionFile),lifecycle,renew});}
 finally{await devices.close();}
}
