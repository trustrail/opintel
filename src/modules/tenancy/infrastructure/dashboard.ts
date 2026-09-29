import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {ok,err,DomainError,SystemClock,type Clock} from '../../../shared/kernel/index.js';
import {DashboardStats,DashboardFinding,PoolShield} from '../../../shared/api/dashboard.js';
import {PresenceSettings} from '../../../shared/api/agent-presence.js';
import type {DashboardReader,DashboardContext} from '../application/dashboard.js';
const pairs=`SELECT b.pool_id,s.id AS source_id,s.name AS source_name,e.id AS element_id,t.treatment FROM pool_source_binding b JOIN data_source s ON s.id=b.source_id AND s.status<>'archived' JOIN catalog_object o ON o.source_id=s.id AND o.status='active' JOIN catalog_element e ON e.object_id=o.id AND e.status='active' LEFT JOIN entitlement t ON t.pool_id=b.pool_id AND t.element_id=e.id`;
const spectrum=`jsonb_build_object('clear',count(*) FILTER(WHERE treatment='clear'),'tokenized',count(*) FILTER(WHERE treatment='tokenized'),'masked',count(*) FILTER(WHERE treatment='masked'),'aggregate_only',count(*) FILTER(WHERE treatment='aggregate_only'),'withheld',count(*) FILTER(WHERE treatment='withheld'),'undecided',count(*) FILTER(WHERE treatment IS NULL))`;
export class PostgresDashboardReader implements DashboardReader{
 constructor(private readonly clock:Clock=new SystemClock()){}
 async stats(ctx:DashboardContext){
 const [project]=await withPlatform(tx=>tx.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));if(!project)return err(new DomainError('not_found','The project was not found.'));
 const timing=PresenceSettings.parse(project.settings),asOf=this.clock.now(),utcDay=asOf.slice(0,10),start=utcDay+'T00:00:00.000Z';
 return withTenant(ctx,async tx=>{const [row]=await tx.query<Record<string,unknown>>(`WITH pairs AS (${pairs}), requests AS (SELECT r.mode,c.outcome FROM query_run r LEFT JOIN run_completion c ON c.run_id=r.id AND c.started_at=r.started_at WHERE r.started_at >= $1::timestamptz AND r.started_at <= $2::timestamptz), presence AS (SELECT state,COALESCE(stale_at,last_heartbeat_at+make_interval(secs=>$3::int*3)) AS deadline FROM agent_presence) SELECT
 (SELECT count(*)::int FROM pool) AS pools,(SELECT count(*)::int FROM data_source WHERE status<>'archived') AS sources,
 (SELECT ${spectrum} FROM pairs) AS spectrum,
 (SELECT count(*)::int FROM requests) AS requests,(SELECT count(*)::int FROM requests WHERE mode='query') AS queries,(SELECT count(*)::int FROM requests WHERE mode='prompt') AS prompts,
 (SELECT count(*)::int FROM requests WHERE outcome->>'kind'='refused') AS refused,(SELECT count(*)::int FROM requests WHERE outcome IS NULL) AS incomplete,
 (SELECT count(*)::int FROM presence WHERE state<>'disconnected' AND $2::timestamptz<deadline) AS "connectedAgents",
 (SELECT count(*)::int FROM presence WHERE state<>'disconnected' AND $2::timestamptz>=deadline AND $2::timestamptz<deadline+make_interval(secs=>$4::int)) AS "staleAgents"`,[start,asOf,timing.agentHeartbeatSeconds,timing.agentDisconnectGraceSeconds]);return ok(DashboardStats.parse({...row,asOf,utcDay}));});
 }
 feed(ctx:DashboardContext,after:string|null,limit:number){return withTenant(ctx,async tx=>{
 const rows=await tx.query<{item:unknown}>(`WITH pairs AS (${pairs}), findings AS (
 SELECT 'undecided:'||p.id||':'||v.source_id AS id,jsonb_build_object('id','undecided:'||p.id||':'||v.source_id,'kind','undecided','poolId',p.id,'poolName',p.name,'sourceId',v.source_id,'sourceName',v.source_name,'count',count(*)) AS item FROM pairs v JOIN pool p ON p.id=v.pool_id WHERE v.treatment IS NULL GROUP BY p.id,p.name,v.source_id,v.source_name
 UNION ALL SELECT 'source:'||s.id,jsonb_build_object('id','source:'||s.id,'kind','source_failure','sourceId',s.id,'sourceName',s.name,'runId',r.id,'message',r.error) FROM data_source s LEFT JOIN LATERAL(SELECT id,state,error FROM introspection_run WHERE source_id=s.id ORDER BY created_at DESC,id DESC LIMIT 1)r ON true WHERE s.status<>'archived' AND (r.state='failed' OR r.id IS NULL AND s.status='introspection_failed')
 UNION ALL SELECT 'quarantine:'||a.filing_id,jsonb_build_object('id','quarantine:'||a.filing_id,'kind','quarantine','filingId',a.filing_id,'zoneId',a.source_id,'category',a.payload->>'quarantineCategory','receivedAt',a.payload->>'receivedAt') FROM arrival_notice a WHERE a.payload->>'outcome'='quarantined'
 ) SELECT item FROM findings WHERE ($1::text IS NULL OR id COLLATE "C">$1 COLLATE "C") ORDER BY id COLLATE "C" LIMIT $2`,[after,limit]);return ok(rows.map(r=>DashboardFinding.parse(r.item)));});}
 pools(ctx:DashboardContext,after:string|null,limit:number){return withTenant(ctx,async tx=>{
 const rows=await tx.query<Record<string,unknown>>(`WITH pairs AS (${pairs}) SELECT p.id,p.name,(SELECT count(*)::int FROM agent_presence WHERE pool_id=p.id) AS agents,
 (SELECT ${spectrum} FROM pairs WHERE pool_id=p.id) AS spectrum,
 COALESCE((SELECT jsonb_agg(v ORDER BY v.name,v.id) FROM (SELECT s.id,s.name,(SELECT ${spectrum} FROM pairs WHERE pool_id=p.id AND source_id=s.id) AS spectrum FROM pool_source_binding b JOIN data_source s ON s.id=b.source_id AND s.status<>'archived' WHERE b.pool_id=p.id)v),'[]') AS sources
 FROM pool p WHERE ($1::uuid IS NULL OR p.id>$1) ORDER BY p.id LIMIT $2`,[after,limit]);return ok(rows.map(r=>PoolShield.parse(r)));});}
}
