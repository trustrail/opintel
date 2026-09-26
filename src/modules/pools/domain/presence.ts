import type { PoolId,ProjectId,Timestamp } from '../../../shared/kernel/index.js';
import type { PoolKeyId } from './pool.js';
export type PresenceState='connecting'|'active'|'idle'|'stale'|'disconnected';
export type AgentPresence=Readonly<{projectId:ProjectId;poolId:PoolId;agentId:string;client:string|null;verified:false;keyVersion:PoolKeyId;firstSeen:Timestamp;lastSeen:Timestamp;lastRequestAt:Timestamp|null;lastHeartbeatAt:Timestamp;staleAt:Timestamp|null;reconnects:number;state:PresenceState}>;
export type PresenceTiming={agentHeartbeatSeconds:number;agentDisconnectGraceSeconds:number};
/** Deadlines are event times, not the time a delayed sweep happens to run. */
export function agePresence(row:AgentPresence,at:Timestamp,timing:PresenceTiming):AgentPresence {
 if(row.state==='disconnected')return row;
 const now=Date.parse(at),staleAt=row.staleAt??new Date(Date.parse(row.lastHeartbeatAt)+3*timing.agentHeartbeatSeconds*1000).toISOString() as Timestamp;
 if(now>=Date.parse(staleAt)+timing.agentDisconnectGraceSeconds*1000)return {...row,state:'disconnected',staleAt};
 if(now>=Date.parse(staleAt))return {...row,state:'stale',staleAt};
 if(row.state==='active'&&now>=Date.parse(row.lastRequestAt??row.firstSeen)+60000)return {...row,state:'idle'};
 return row;
}
export function observePresence(row:AgentPresence,kind:'connect'|'request'|'heartbeat',keyVersion:PoolKeyId,client:string|null,at:Timestamp,timing:PresenceTiming):AgentPresence {
 const aged=agePresence(row,at,timing);
 const reconnect=aged.state==='stale'||aged.state==='disconnected';
 const lastRequestAt=kind==='request'?at:row.lastRequestAt;
 const state:PresenceState=kind==='connect'?'connecting':kind==='request'?'active':Date.parse(at)-Date.parse(lastRequestAt??row.firstSeen)>=60000?'idle':'active';
 return {...aged,client:client??row.client,keyVersion,lastSeen:at,lastHeartbeatAt:at,lastRequestAt,staleAt:null,reconnects:aged.reconnects+(reconnect?1:0),state};
}
