import { withPlatform,withTenant,type Tx } from '../../../platform/db/scope.js';
import { notify,type ProjectEvents } from '../../../platform/sse/port.js';
import { DomainError,err,ok,SystemClock,Timestamp,type Clock,type PoolId,type Result } from '../../../shared/kernel/index.js';
import { PresenceSettings } from '../../../shared/api/agent-presence.js';
import type { AgentPresenceRepository,AuthenticatedPresence } from '../application/presence.js';
import type { AgentPresenceQuery,PoolKeyContext } from '../application/keys.js';
import type { PoolKeyId } from '../domain/pool.js';
import { agePresence,observePresence,type AgentPresence,type PresenceTiming } from '../domain/presence.js';
type Row=Omit<AgentPresence,'firstSeen'|'lastSeen'|'lastRequestAt'|'lastHeartbeatAt'|'staleAt'>&{firstSeen:Date;lastSeen:Date;lastRequestAt:Date|null;lastHeartbeatAt:Date;staleAt:Date|null};
const columns=`project_id AS "projectId",pool_id AS "poolId",agent_id AS "agentId",client,verified,key_version AS "keyVersion",first_seen AS "firstSeen",last_seen AS "lastSeen",last_request_at AS "lastRequestAt",last_heartbeat_at AS "lastHeartbeatAt",stale_at AS "staleAt",reconnects,state`;
function presence(row:Row):AgentPresence{return {...row,firstSeen:Timestamp(row.firstSeen),lastSeen:Timestamp(row.lastSeen),lastRequestAt:row.lastRequestAt===null?null:Timestamp(row.lastRequestAt),lastHeartbeatAt:Timestamp(row.lastHeartbeatAt),staleAt:row.staleAt===null?null:Timestamp(row.staleAt)};}
export class PostgresAgentPresence implements AgentPresenceRepository,AgentPresenceQuery {
 constructor(private readonly events:ProjectEvents,private readonly clock:Clock=new SystemClock()){}
 private async settings(ctx:PoolKeyContext):Promise<Result<PresenceTiming>>{
  const [project]=await withPlatform(tx=>tx.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));
  if(!project)return err(new DomainError('not_found','The project was not found.'));
  const settings=PresenceSettings.safeParse(project.settings);
  return settings.success?ok(settings.data):err(new DomainError('validation_failed','The agent presence timing settings are invalid.'));
 }
 async observe(ctx:PoolKeyContext,authenticated:AuthenticatedPresence,signal:{agentId:string;client:string|null;kind:'connect'|'request'|'heartbeat'}):Promise<Result<AgentPresence>>{
  const settings=await this.settings(ctx);if(!settings.ok)return settings;
  const result=await withTenant(ctx,async tx=>{
   // A revocation holds the same pool exclusively while querying affected agents.
   // No new last-authenticated-key update can slip into that decision's window.
   const pools=await tx.query('SELECT id FROM pool WHERE id=$1 FOR SHARE',[authenticated.poolId]);
   if(!pools.length)return err(new DomainError('not_found','The pool was not found in this project.'));
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['presence',authenticated.poolId,signal.agentId])]);
   const now=this.clock.now();
   const keys=await tx.query(`SELECT id FROM pool_key WHERE id=$1 AND pool_id=$2 AND created_at<=$3 AND (state='current' OR state='retiring' AND grace_until>$3)`,[authenticated.keyVersion,authenticated.poolId,now]);
   if(!keys.length)return err(new DomainError('unauthenticated','The pool key is not valid.'));
   const [old]=await tx.query<Row>(`SELECT ${columns} FROM agent_presence WHERE pool_id=$1 AND agent_id=$2 FOR UPDATE`,[authenticated.poolId,signal.agentId]);
   if(old&&Date.parse(now)<old.lastSeen.getTime())return err(new DomainError('conflict','Presence time cannot move backwards.'));
   const initial:AgentPresence=old?presence(old):{projectId:ctx.projectId,poolId:authenticated.poolId,agentId:signal.agentId,client:signal.client,verified:false,keyVersion:authenticated.keyVersion,firstSeen:now,lastSeen:now,lastRequestAt:null,lastHeartbeatAt:now,staleAt:null,reconnects:0,state:'connecting'};
   const updated=observePresence(initial,signal.kind,authenticated.keyVersion,signal.client,now,settings.value);
   await this.save(tx,updated);return ok(updated);
  });
  if(result.ok)await this.publish(result.value);
  return result;
 }
 async list(ctx:PoolKeyContext,pool:PoolId,after:string|null,limit:number):Promise<Result<AgentPresence[]>>{
  const settings=await this.settings(ctx);if(!settings.ok)return settings;
  return withTenant(ctx,async tx=>{
   if(!(await tx.query('SELECT id FROM pool WHERE id=$1',[pool])).length)return err(new DomainError('not_found','The pool was not found in this project.'));
   const rows=await tx.query<Row>(`SELECT ${columns} FROM agent_presence WHERE pool_id=$1 AND ($2::text IS NULL OR agent_id>$2 COLLATE "C") ORDER BY agent_id LIMIT $3`,[pool,after,limit]);
   const now=this.clock.now();return ok(rows.map(row=>agePresence(presence(row),now,settings.value)));
  });
 }
 async affected(ctx:PoolKeyContext,pool:PoolId,keyVersion:PoolKeyId){
  const settings=await this.settings(ctx);if(!settings.ok)return settings;
  return withTenant(ctx,tx=>this.affectedInScope(tx,pool,keyVersion,settings.value,this.clock.now()));
 }
 async affectedInScope(tx:Tx,pool:PoolId,keyVersion:PoolKeyId,settings:unknown,at:Timestamp){
  const timing=PresenceSettings.safeParse(settings);
  if(!timing.success)return err(new DomainError('validation_failed','The agent presence timing settings are invalid.'));
  if(!(await tx.query('SELECT id FROM pool_key WHERE pool_id=$1 AND id=$2',[pool,keyVersion])).length)return err(new DomainError('not_found','The pool key was not found in this project.'));
  const rows=await tx.query<Row>(`SELECT ${columns} FROM agent_presence WHERE pool_id=$1 AND key_version=$2 ORDER BY agent_id`,[pool,keyVersion]);
  const affectedAgents:string[]=[],previouslySeenAgents:string[]=[];
  for(const row of rows)(agePresence(presence(row),at,timing.data).state==='disconnected'?previouslySeenAgents:affectedAgents).push(row.agentId);
  return ok({affectedAgentCount:affectedAgents.length,affectedAgents,previouslySeenAgents});
 }
 async sweep(ctx:PoolKeyContext):Promise<void>{
  const settings=await this.settings(ctx);if(!settings.ok)return;
  let after:{poolId:PoolId;agentId:string}|undefined;
  for(;;){
   const rows=await withTenant(ctx,tx=>tx.query<{poolId:PoolId;agentId:string}>(`SELECT pool_id AS "poolId",agent_id AS "agentId" FROM agent_presence WHERE state<>'disconnected' AND ($1::uuid IS NULL OR (pool_id,agent_id)>($1::uuid,$2::text COLLATE "C")) ORDER BY pool_id,agent_id LIMIT 200`,[after?.poolId??null,after?.agentId??null]));
   for(const id of rows){
    const changed=await withTenant(ctx,async tx=>{
     const [row]=await tx.query<Row>(`SELECT ${columns} FROM agent_presence WHERE pool_id=$1 AND agent_id=$2 FOR UPDATE`,[id.poolId,id.agentId]);
     if(!row)return null;
     const original=presence(row),aged=agePresence(original,this.clock.now(),settings.value);
     if(aged.state===original.state&&aged.staleAt===original.staleAt)return null;
     await this.save(tx,aged);return aged;
    });
    if(changed)await this.publish(changed);
   }
   if(rows.length<200)return;
   after=rows.at(-1);
  }
 }
 private async save(tx:Tx,row:AgentPresence):Promise<void>{
  await tx.query(`INSERT INTO agent_presence(project_id,pool_id,agent_id,client,verified,key_version,first_seen,last_seen,last_request_at,last_heartbeat_at,stale_at,reconnects,state)
   VALUES($1,$2,$3,$4,false,$5,$6,$7,$8,$9,$10,$11,$12)
   ON CONFLICT(pool_id,agent_id) DO UPDATE SET client=EXCLUDED.client,key_version=EXCLUDED.key_version,last_seen=EXCLUDED.last_seen,last_request_at=EXCLUDED.last_request_at,last_heartbeat_at=EXCLUDED.last_heartbeat_at,stale_at=EXCLUDED.stale_at,reconnects=EXCLUDED.reconnects,state=EXCLUDED.state`,[row.projectId,row.poolId,row.agentId,row.client,row.keyVersion,row.firstSeen,row.lastSeen,row.lastRequestAt,row.lastHeartbeatAt,row.staleAt,row.reconnects,row.state]);
 }
 private publish(row:AgentPresence){return notify(this.events,row.projectId,{type:'agent.presence',poolId:row.poolId,agentId:row.agentId});}
}
