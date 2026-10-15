import {authenticatedWithSql} from './authenticated-with.js';
import {withPlatform,withTenant,type Tx} from '../../../platform/db/scope.js';
import {DomainError,err,ok,Timestamp,type PoolId} from '../../../shared/kernel/index.js';
import {PoolDetail,PoolSummary,AgentTwin} from '../../../shared/api/pools.js';
import {PresenceSettings} from '../../../shared/api/agent-presence.js';
import {PoolKeyGraceSeconds} from '../../../shared/api/pool-keys.js';
import type {PoolReader} from '../application/read.js';
import type {PoolKeyContext} from '../application/keys.js';
import {agePresence,type AgentPresence} from '../domain/presence.js';
const missing=()=>err(new DomainError('not_found','The pool or agent was not found in this project.'));
const summary=`SELECT p.id,p.name,p.mode_query AS "modeQuery",p.mode_prompt AS "modePrompt",
 ARRAY(SELECT source_id::text FROM pool_source_binding WHERE pool_id=p.id ORDER BY source_id) AS "sourceIds",
 (SELECT count(*)::int FROM pool_key WHERE pool_id=p.id AND (state='current' OR state='retiring' AND grace_until>now())) AS "workingKeys",
 (SELECT count(*)::int FROM agent_presence WHERE pool_id=p.id) AS agents,
 (SELECT count(*)::int FROM agent_presence a WHERE pool_id=p.id AND state='active' AND last_request_at>now()-interval '60 seconds' AND last_heartbeat_at>now()-make_interval(secs=>$3::int*3)) AS "activeAgents",
 totals.clear AS "clearElements",totals.total AS "activeElements"
 FROM pool p CROSS JOIN LATERAL (SELECT count(*)::int AS total,count(*) FILTER(WHERE t.treatment='clear')::int AS clear
 FROM pool_source_binding b JOIN data_source s ON s.id=b.source_id AND s.status<>'archived'
 JOIN catalog_object o ON o.source_id=s.id AND o.status='active' JOIN catalog_element e ON e.object_id=o.id AND e.status='active'
 LEFT JOIN entitlement t ON t.element_id=e.id AND t.pool_id=p.id WHERE b.pool_id=p.id) totals`;
async function keys(tx:Tx,pool:PoolId){return tx.query<{credentialId:string;label:string;poolId:string;keyVersion:string;prefix:string;custodyAlias:string;createdAt:Date;state:'current'|'retiring'|'expired'|'revoked';graceUntil:Date|null}>(`SELECT credential_id AS "credentialId",(SELECT label FROM pool_credential c WHERE c.id=credential_id) AS label,pool_id AS "poolId",id AS "keyVersion",key_prefix AS prefix,custody_alias AS "custodyAlias",created_at AS "createdAt",CASE WHEN state='retiring' AND grace_until<=now() THEN 'expired' ELSE state END AS state,grace_until AS "graceUntil" FROM pool_key WHERE pool_id=$1 ORDER BY created_at DESC,id DESC`,[pool]);}
const keyView=(k:Awaited<ReturnType<typeof keys>>[number])=>({...k,createdAt:k.createdAt.toISOString(),graceUntil:k.graceUntil?.toISOString()??null});
export class PostgresPoolReader implements PoolReader {
 private async settings(ctx:PoolKeyContext){const [p]=await withPlatform(tx=>tx.query<{settings:Record<string,unknown>}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));return p?.settings;}
 async list(ctx:PoolKeyContext,after:string|null,limit:number){const settings=await this.settings(ctx);if(!settings)return missing();return withTenant(ctx,async tx=>ok((await tx.query<PoolSummary>(`${summary} WHERE ($1::uuid IS NULL OR p.id>$1) ORDER BY p.id LIMIT $2`,[after,limit,PresenceSettings.parse(settings).agentHeartbeatSeconds])).map(r=>PoolSummary.parse(r))));}
 async detail(ctx:PoolKeyContext,pool:PoolId){const settings=await this.settings(ctx);if(!settings)return missing();return withTenant(ctx,async tx=>{const [row]=await tx.query<PoolSummary>(`${summary} WHERE p.id=$1 LIMIT $2`,[pool,1,PresenceSettings.parse(settings).agentHeartbeatSeconds]);if(!row)return missing();return ok(PoolDetail.parse({...row,keys:(await keys(tx,pool)).map(keyView),credentials:await tx.query(`SELECT id,label,(SELECT count(*)::int FROM release_grant g WHERE NOT g.escrow_revoked AND EXISTS(SELECT 1 FROM release_event e WHERE e.grant_id=g.id AND e.kind='revoked') AND (g.claims->>'sub'=c.custody_alias OR EXISTS(SELECT 1 FROM pool_key k WHERE k.credential_id=c.id AND k.custody_alias=g.claims->>'sub'))) AS "pendingCleanupCount",custody_alias AS "custodyAlias",CASE WHEN revoked_at IS NULL THEN 'active' ELSE 'revoked' END AS state,to_char(last_used_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "lastUse" FROM pool_credential c WHERE pool_id=$1 ORDER BY created_at,id`,[pool]),graceSeconds:PoolKeyGraceSeconds.parse(settings.poolKeyGraceSeconds)}));});}
 async twin(ctx:PoolKeyContext,pool:PoolId,agent:string){const settings=await this.settings(ctx);if(!settings)return missing();return withTenant(ctx,async tx=>{
 const [row]=await tx.query<{presence:AgentPresence;authenticatedWith:unknown}>(`SELECT jsonb_build_object('projectId',project_id,'poolId',pool_id,'agentId',agent_id,'client',client,'verified',verified,'keyVersion',key_version,'firstSeen',first_seen,'lastSeen',last_seen,'lastRequestAt',last_request_at,'lastHeartbeatAt',last_heartbeat_at,'staleAt',stale_at,'reconnects',reconnects,'state',state) AS presence,${authenticatedWithSql} AS "authenticatedWith" FROM agent_presence a WHERE pool_id=$1 AND agent_id=$2`,[pool,agent]);if(!row)return missing();
 const key=(await keys(tx,pool)).find(k=>k.keyVersion===row.presence.keyVersion);if(!key)return missing();
 const p=agePresence(row.presence,Timestamp(new Date()),PresenceSettings.parse(settings));
 return ok(AgentTwin.parse({presence:{authenticatedWith:row.authenticatedWith,poolId:p.poolId,agentId:p.agentId,client:p.client,verified:p.verified,keyVersion:p.keyVersion,reconnects:p.reconnects,state:p.state,firstSeen:new Date(p.firstSeen).toISOString(),lastSeen:new Date(p.lastSeen).toISOString(),lastHeartbeatAt:new Date(p.lastHeartbeatAt).toISOString(),lastRequestAt:p.lastRequestAt?new Date(p.lastRequestAt).toISOString():null,staleAt:p.staleAt?new Date(p.staleAt).toISOString():null},keyMetadata:keyView(key)}));
 });}
}
