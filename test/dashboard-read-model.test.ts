import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {it,expect} from 'vitest';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {PostgresDashboardReader} from '../src/modules/tenancy/index.js';
import {dashboardRoutes} from '../src/modules/tenancy/api/dashboard-routes.js';
import {PostgresEntitlementReader} from '../src/modules/entitlements/index.js';
import {entitlementReadRoutes} from '../src/modules/entitlements/api/read-routes.js';
import {PostgresObservationReader,observationRoutes} from '../src/modules/observations/index.js';
import {PostgresSuggestions,suggestionRoutes} from '../src/modules/relationships/index.js';
import {EvidenceQuery,PostgresEvidenceReader} from '../src/modules/evidence/index.js';
import {evidenceRoutes} from '../src/modules/evidence/api/routes.js';
import {AgentPresenceService,PostgresAgentPresence} from '../src/modules/pools/index.js';
import {agentPresenceRoutes} from '../src/modules/pools/api/presence-routes.js';
import {PostgresFilingRegister} from '../src/modules/ingest/infrastructure/register.js';
import {createApiClient} from '../src/shared/api/client.js';
import {PoolId,FilingId,TestClock,Timestamp} from '../src/shared/kernel/index.js';
import type {AuthorizationPort,AuthorizationRevision} from '../src/modules/authz/index.js';
import {readDashboardModel} from '../src/app/dashboard/read-model.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import {allowBulk} from './fixtures/bulk-entitlements/fixture.js';
import {resetDatabaseBeforeEach} from './database-fixture.js';
resetDatabaseBeforeEach('company');
it('RED-019: Dashboard totals are destination facts across pages, pools, observations, attempts and evidence',async()=>{
 const f=await policyFixture(55),second=PoolId(randomUUID()),day=new Date().toISOString().slice(0,10),clock=new TestClock(new Date(day+'T12:00:00Z'));
 await f.set('clear',randomUUID(),f.ids.slice(0,2));
 await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.test`]));
 await withTenant(f.ctx,async tx=>{
  await tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Second pool')",[second,f.ctx.projectId]);await tx.query('INSERT INTO pool_source_binding(pool_id,source_id,project_id) VALUES($1,$2,$3)',[second,f.source,f.ctx.projectId]);
  await tx.query("UPDATE data_source SET receives_landings=true,landing_strategy='append_as_at' WHERE id=$1",[f.source]);
  for(const [mode,outcome] of [['query',null],['query',{kind:'answered',rowCount:2,truncated:false}],['prompt',{kind:'refused',code:'sql_not_permitted',element:null,stage:'validate'}]] as const){const id=randomUUID(),at=day+'T01:00:00Z';await tx.query("INSERT INTO query_run(id,project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'test',$4,'DASH_PRIVATE_SENTINEL',$5,$6)",[id,f.ctx.projectId,f.pool,mode,{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:null},at]);if(outcome)await tx.query('INSERT INTO run_completion(run_id,started_at,outcome,completed_at) VALUES($1,$2,$3,$2)',[id,at,outcome]);}
  const previous=new Date(Date.parse(day+'T00:00:00Z')-86400000).toISOString().slice(0,10);await tx.query("INSERT INTO query_run(id,project_id,pool_id,key_prefix,mode,request,versions,started_at) VALUES($1,$2,$3,'test','query',NULL,$4,$5)",[randomUUID(),f.ctx.projectId,f.pool,{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:null},previous+'T23:59:59Z']);
  await tx.query("INSERT INTO token_join_candidate(id,run_id,operation,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at) VALUES($1,NULL,'explain',$2,$3,$4,$5,'warehouse.public.records.field_54','warehouse.public.records.field_55','claimed-agent','DASH_PRIVATE_SENTINEL',$6)",[randomUUID(),f.ctx.projectId,f.pool,f.ids[53],f.ids[54],day+'T02:00:00Z']);
 });
 const register=new PostgresFilingRegister(),notices=Array.from({length:4},(_,n)=>({filingId:FilingId(randomUUID()),projectId:f.ctx.projectId,sourceId:f.source,fileSha256:'a'.repeat(64),receivedAt:day+'T02:00:00Z',revision:1,outcome:'quarantined' as const,partyCode:null,kind:null,period:null,quarantineCategory:n===3?'merged_header' as const:'no_rule_matched' as const}));for(const notice of notices)unwrap(await register.notice(notice));
 const auth:AuthorizationPort={...allowBulk,checkMany:async rs=>rs.map(()=>({allowed:false,token:'test' as AuthorizationRevision,checkedAt:Timestamp(new Date()),snapshotAgeMs:0}))},evidence=new EvidenceQuery(new PostgresEvidenceReader(),auth,{stripSql:async()=>null}),suggestions=new PostgresSuggestions(evidence),entitlements=new PostgresEntitlementReader(),observations=new PostgresObservationReader();
 const server=createHttpServer([...dashboardRoutes(new PostgresDashboardReader(clock)),...entitlementReadRoutes(entitlements),...observationRoutes(observations),...suggestionRoutes(suggestions),...evidenceRoutes(evidence),...agentPresenceRoutes(new AgentPresenceService(new PostgresAgentPresence({publish:async()=>{}},clock)))],{authorization:{port:auth,currentUser:async()=>f.actor}});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing test listener.');const seen:string[]=[],client=createApiClient((path,init)=>{seen.push(path);return fetch(`http://127.0.0.1:${address.port}${path}`,init);});
 try{
  const model=await readDashboardModel(f.ctx.projectId,true,client);expect(model.spectrum).toMatchObject({clear:2,undecided:108});expect(model.pools.map(p=>p.pending).sort((a,b)=>a-b)).toEqual([53,55]);
  for(const p of model.pools){const destination=unwrap(await entitlements.groups(f.ctx,PoolId(p.pool.id),{projectId:f.ctx.projectId,prefix:'',decision:'undecided',mode:'name'},null,100));expect(p.pending).toBe(destination.totals.members);expect(p.groups).toBe(destination.totals.groups);expect(p.demand).toEqual(destination.items.filter(g=>g.queries+g.explains>0));}
  expect(seen.some(path=>path.includes('entitlement-groups')&&path.includes('cursor='))).toBe(true);
  expect(model.observations.filter(g=>g.kind==='filing').reduce((n,g)=>n+g.count,0)).toBe(4);expect(model.observations).toEqual(unwrap(await observations.groups(f.ctx,{view:'open',custody:false},null,100)).items);
  expect(model.suggestions).toEqual(unwrap(await suggestions.list(f.ctx,undefined,100,{view:'open'})).items);expect(model.suggestions).toHaveLength(1);
  const activity=unwrap(await evidence.summary(f.ctx,model.today));expect(model.days.at(-1)).toMatchObject({requests:activity.counts.all,refused:activity.counts.refused,incomplete:activity.counts.incomplete,queries:2,prompts:1});expect(model.days).toHaveLength(7);expect(model.days.at(-2)).toMatchObject({requests:1,queries:1,prompts:0,incomplete:1});expect(model.days.slice(0,5).every(d=>d.requests===0)).toBe(true);expect(model.recent).toHaveLength(4);expect(JSON.stringify(model)).not.toContain('DASH_PRIVATE_SENTINEL');
  const suggestion=model.suggestions[0]!;unwrap(await suggestions.decide(f.ctx,suggestion.id,{action:'not_sure',latestAttemptId:suggestion.latestAttemptId}));expect((await readDashboardModel(f.ctx.projectId,false,client)).suggestions).toHaveLength(1);
  unwrap(await suggestions.decide(f.ctx,suggestion.id,{action:'reject',latestAttemptId:suggestion.latestAttemptId}));for(const notice of notices)unwrap(await register.notice({...notice,revision:2,outcome:'landed',quarantineCategory:null}));const next=await readDashboardModel(f.ctx.projectId,false,client);expect(next.suggestions).toHaveLength(0);expect(next.observations.filter(g=>g.kind==='filing')).toHaveLength(0);
  seen.length=0;await readDashboardModel(f.ctx.projectId,false,client);expect(seen.some(p=>p.includes('custody-observations'))).toBe(false);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
