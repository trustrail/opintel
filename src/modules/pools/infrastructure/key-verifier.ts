import { withPlatform } from '../../../platform/db/scope.js';
import { SystemClock, type Clock, type PoolId, type ProjectId } from '../../../shared/kernel/index.js';
import type { KeyVerifier, KeyVerdict } from '../application/keys.js';
import { hashPoolKey } from './key-material.js';
export class PostgresKeyVerifier implements KeyVerifier {
 constructor(private readonly clock:Clock=new SystemClock()) {}
 async verify(presented:string):Promise<KeyVerdict>{
  if(!/^opk_live_[A-Za-z0-9]{22}$/u.test(presented))return {ok:false,reason:'malformed'};
  const [row]=await withPlatform(tx=>tx.query<{pool_id:PoolId;project_id:ProjectId;name:string;mode_query:boolean;mode_prompt:boolean;clarification_policy:'pause'|'refuse';key_prefix:string;state:'current'|'retiring'|'expired'|'revoked';grace_until:Date|null;created_at:Date}>('SELECT * FROM public.resolve_pool_key($1)',[hashPoolKey(presented)]));
  if(!row)return {ok:false,reason:'unknown'};
  const now=new Date(this.clock.now());
  if(row.state==='revoked')return {ok:false,reason:'revoked'};
  if(row.state==='expired'||row.state==='retiring'&&(row.grace_until===null||row.grace_until<=now))return {ok:false,reason:'expired'};
  if(row.created_at>now)return {ok:false,reason:'unknown'};
  return {ok:true,pool:{id:row.pool_id,projectId:row.project_id,name:row.name,modes:{query:row.mode_query,prompt:row.mode_prompt},clarificationPolicy:row.clarification_policy},keyPrefix:row.key_prefix,keyState:row.state};
 }
}
