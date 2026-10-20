import {z} from 'zod';
import {withPlatform} from '../../../platform/db/scope.js';
import {PresenceSettings} from '../../../shared/api/agent-presence.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import type {McpConfiguration,McpPrincipal} from '../application/access.js';
const sessionState=z.object({key_version:z.uuid(),pool_id:z.uuid(),project_id:z.uuid(),credential_id:z.uuid(),mode_query:z.boolean(),mode_prompt:z.boolean(),settings:z.unknown()});
const invalid=()=>err(new DomainError('unauthenticated','The pool key is not valid.'));
export class PostgresMcpConfiguration implements McpConfiguration {
 async readMany(principals:readonly McpPrincipal[]){
  if(!principals.length)return [];
  // One fresh scoped transaction for the complete set, across projects. The
  // narrow worker function returns no secret or customer/source metadata.
  const rows=sessionState.array().parse(await withPlatform(tx=>tx.query('SELECT * FROM public.read_mcp_session_states($1::uuid[])',[[...new Set(principals.map(p=>p.keyVersion))]])));
  const states=new Map(rows.map(row=>[row.key_version,row]));
  return principals.map(principal=>{
   const row=states.get(principal.keyVersion);
   if(!row||row.pool_id!==principal.pool.id||row.project_id!==principal.pool.projectId||row.credential_id!==principal.credentialId)return invalid();
   const settings=PresenceSettings.safeParse(row.settings);
   if(!settings.success)return err(new DomainError('validation_failed','The agent presence timing settings are invalid.'));
   return ok({modes:{query:row.mode_query,prompt:row.mode_prompt},heartbeatSeconds:settings.data.agentHeartbeatSeconds});
  });
 }
}
