import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {policyFixture,unwrap,type PolicyFixture} from './fixtures/policy-version/fixture.js';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {PostgresObservationReader,observationRoutes} from '../src/modules/observations/index.js';
import {PostgresFilingRegister} from '../src/modules/ingest/infrastructure/register.js';
import {FilingId,Timestamp} from '../src/shared/kernel/index.js';
import type {AuthorizationPort,AuthorizationRevision} from '../src/modules/authz/index.js';
import {createHttpServer} from '../src/platform/http/index.js';
import type {ArrivalNotice} from '../src/shared/landing-contract.js';
import {observationOpenApiDocument} from '../src/shared/api/observations.js';
import {prepareOperatorPacket} from '../src/shared/observation-packet.js';
resetDatabaseBeforeEach('company');
let f:PolicyFixture,reader:PostgresObservationReader,register:PostgresFilingRegister,server:ReturnType<typeof createHttpServer>|undefined,base:string,admin:boolean,allowed:boolean;
const privateSentinel='OBS_CUSTOMER_CONTENT_SENTINEL';
const groups=async(view:'open'|'resolved'='open',custody=false)=>unwrap(await reader.groups(f.ctx,{view,custody},null,25));
const members=async(group:string,view:'open'|'resolved'='open',custody=false)=>unwrap(await reader.members(f.ctx,{view,custody},group,null,25));
const notice=(id=FilingId(randomUUID()),category:ArrivalNotice['quarantineCategory']='no_rule_matched'):ArrivalNotice=>({filingId:id,projectId:f.ctx.projectId,sourceId:f.source,fileSha256:'a'.repeat(64),receivedAt:'2026-10-01T12:00:00Z',revision:1,outcome:'quarantined',partyCode:null,kind:null,period:null,quarantineCategory:category});
beforeEach(async()=>{
 f=await policyFixture(3);reader=new PostgresObservationReader();register=new PostgresFilingRegister();admin=true;allowed=true;
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET receives_landings=true,landing_strategy='append_as_at' WHERE id=$1",[f.source]));
 const verdict=(pass:boolean)=>({allowed:pass,checkedAt:Timestamp(new Date()),token:'test' as AuthorizationRevision,snapshotAgeMs:0});
 const auth:AuthorizationPort={check:async r=>verdict(allowed&&(r.permission!=='administer'||admin)),checkMany:async()=>[],write:async()=>'test' as AuthorizationRevision,explain:async()=>({allowed:false,path:[]})};
 server=createHttpServer(observationRoutes(reader),{authorization:{port:auth,currentUser:async()=>({id:f.ctx.userId,email:'review@example.test',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})},logger:{error:()=>{}}});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No test port');base=`http://127.0.0.1:${address.port}/api/v1/projects/${f.ctx.projectId}`;
});
afterEach(async()=>{const current=server;if(!current)return;current.closeAllConnections();await new Promise<void>(resolve=>current.close(()=>resolve()));server=undefined;});
it('RED-012: repeated causes form one group; latest arrival erases neither quarantine nor landing resolution',async()=>{
 const filings=[notice(),notice(),notice()];for(const item of filings)unwrap(await register.notice(item));const merged=notice(undefined,'merged_header');unwrap(await register.notice(merged));
 expect((await groups()).counts).toEqual({open:4,resolved:0});expect((await groups()).items.map(g=>[g.cause,g.count])).toEqual([['merged_header',1],['no_rule_matched',3]]);
 const first=filings[0]!;unwrap(await register.notice({...first,revision:2,outcome:'pending',quarantineCategory:null}));expect((await groups()).counts.open).toBe(4);
 unwrap(await register.notice({...first,revision:3,outcome:'duplicate',quarantineCategory:null}));expect((await groups()).counts.open).toBe(4); // A duplicate is not evidence of landing.
 unwrap(await register.notice({...first,revision:4,outcome:'landed',quarantineCategory:null}));expect((await groups()).counts).toEqual({open:3,resolved:1});
 const resolved=(await groups('resolved')).items[0]!;expect(resolved).toMatchObject({cause:'no_rule_matched',count:1});expect((await members(resolved.id,'resolved')).items[0]).toMatchObject({state:'resolved',resolution:'landed',metadata:{filingId:first.filingId,zoneId:f.source},history:[{state:'open',cause:'no_rule_matched'},{state:'resolved',cause:'no_rule_matched',resolution:'landed'}]});
 unwrap(await register.notice(first));expect((await groups()).counts).toEqual({open:3,resolved:1}); // stale retry never reopens.
});
it('RED-012: a changed quarantine cause is not a resolution; all prior causes remain recorded when the filing lands',async()=>{
 const item=notice();unwrap(await register.notice(item));unwrap(await register.notice({...item,revision:2,quarantineCategory:'merged_header'}));
 expect((await groups()).items.map(g=>g.cause)).toEqual(['merged_header']);expect((await groups('resolved')).items).toEqual([]);
 unwrap(await register.notice({...item,revision:3,outcome:'landed',quarantineCategory:null}));expect((await groups('resolved')).items.map(g=>g.cause)).toEqual(['merged_header','no_rule_matched']);expect((await groups()).items).toEqual([]);
});
it('RED-013: source mapping repair/removal and successful custody rehearsal retain resolution facts without an acknowledge command',async()=>{
 const run=randomUUID(),diff=f.ids.map(elementId=>({type:'CatalogElementUnsupported',elementId,sourceType:'inet',unsupportedReason:'unmapped'}));
 await withTenant(f.ctx,async tx=>{await tx.query("UPDATE catalog_element SET source_type='inet',exposed_type=NULL");await tx.query("INSERT INTO introspection_run(id,source_id,project_id,state,ended_at,diff) VALUES($1,$2,$3,'complete',now(),$4)",[run,f.source,f.ctx.projectId,JSON.stringify(diff)]);});
 const group=(await groups()).items[0]!;expect(group).toMatchObject({kind:'type',causeDetail:'inet',count:3});
 const repair=randomUUID();await withTenant(f.ctx,async tx=>{await tx.query("UPDATE catalog_element SET exposed_type='VARCHAR' WHERE id=$1",[f.ids[0]]);await tx.query("UPDATE catalog_element SET status='removed' WHERE id=$1",[f.ids[1]]);await tx.query("INSERT INTO introspection_run(id,source_id,project_id,state,ended_at,diff) VALUES($1,$2,$3,'failed',now(),'[]')",[repair,f.source,f.ctx.projectId]);});
 expect((await groups()).items[0]!.count).toBe(3); // Failed introspection cannot close findings.
 await withTenant(f.ctx,tx=>tx.query("UPDATE introspection_run SET state='complete' WHERE id=$1",[repair]));expect((await groups()).items[0]!.count).toBe(1);expect((await members(group.id,'resolved')).items.map(m=>m.resolution).sort()).toEqual(['mapping_repaired','removed']);
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET status='archived' WHERE id=$1",[f.source]));expect((await groups()).items).toEqual([]);expect((await members(group.id,'resolved')).items.map(m=>m.resolution).sort()).toEqual(['mapping_repaired','removed','source_archived']);
 await withPlatform(tx=>tx.query("INSERT INTO user_account(id,email) VALUES($1,$2)",[f.ctx.userId,`${f.ctx.userId}@example.test`]));
 await withTenant(f.ctx,tx=>tx.query("INSERT INTO token_key_version(project_id,version,sentinel_token,state,last_rehearsal,last_rehearsed_at) VALUES($1,1,$2,'current','failed',now())",[f.ctx.projectId,privateSentinel]));expect((await groups('open',true)).counts.open).toBe(1);expect((await members('custody:custody_failed:','open',true)).items[0]!.metadata.keyState).toBe('current');
 await withTenant(f.ctx,tx=>tx.query("UPDATE token_key_version SET last_rehearsal='ok',last_rehearsed_at=clock_timestamp(),backup_verified_at=now()"));expect((await groups('open',true)).items).toEqual([]);expect((await groups('resolved',true)).items[0]).toMatchObject({cause:'custody_failed',count:1});expect(JSON.stringify(await members('custody:custody_failed:','resolved',true))).not.toContain(privateSentinel);
});
it('RED-013/014: tenant scope, custody permission, cursor scope and immutable trigger-only history',async()=>{
 unwrap(await register.notice(notice()));unwrap(await register.notice(notice(undefined,'merged_header')));
 expect(Object.keys(observationOpenApiDocument().paths)).toHaveLength(4);
 const page=await (await fetch(base+'/observations?limit=1')).json();expect(page.items).toHaveLength(1);expect(page.nextCursor).toBeTruthy();
 expect((await fetch(base+'/observations?view=resolved&cursor='+page.nextCursor)).status).toBe(400);expect((await fetch(base+'/custody-observations?cursor='+page.nextCursor)).status).toBe(400);
 const rows=await members(page.items[0].id);const other=await policyFixture(1);expect(unwrap(await reader.groups(other.ctx,{view:'open',custody:false},null,25)).items).toEqual([]);
 await expect(withTenant(f.ctx,tx=>tx.query("INSERT INTO observation_event(project_id,kind,cause,entity_id,state,observed_at,metadata) VALUES($1,'filing','no_rule_matched','forged','open',now(),'{}')",[f.ctx.projectId]))).rejects.toMatchObject({code:'42501'});
 await expect(withTenant(f.ctx,tx=>tx.query('UPDATE observation_event SET cause=$1',[privateSentinel]))).rejects.toMatchObject({code:'42501'});
 admin=false;expect((await fetch(base+'/custody-observations')).status).toBe(403);expect((await fetch(base+'/observations')).status).toBe(200);allowed=false;expect((await fetch(base+'/observations')).status).toBe(404);
 expect(rows.items[0]!.metadata.zoneId).toBe(f.source);
});
it('RED-014: operator packet has complete ids and captured engine ownership, only whitelisted metadata, and no delivery',async()=>{
 const engine=randomUUID();await withTenant(f.ctx,async tx=>{await tx.query("INSERT INTO engine(id,project_id,name,address,certificate_pin) VALUES($1,$2,'Customer engine','https://engine.local:4444',$3)",[engine,f.ctx.projectId,'A'.repeat(64)]);await tx.query('UPDATE data_source SET engine_id=$1',[engine]);});
 const item=notice();unwrap(await register.notice(item));await withTenant(f.ctx,tx=>tx.query('UPDATE data_source SET engine_id=NULL'));
 const group=(await groups()).items[0]!,records=(await members(group.id)).items;const record=records[0]!;
 const packet=prepareOperatorPacket([{group,members:[{...record,metadata:{...record.metadata,filename:privateSentinel,reason:privateSentinel,payload:{file:privateSentinel}}} as typeof record]}],'2026-10-06T15:43:00Z');
 expect(packet).toContain(item.filingId);expect(packet).toContain(f.source);expect(packet).toContain(engine);expect(packet).toContain('Customer engine');expect(packet).toContain('No filing-party rule matched.');expect(packet).toContain('Inspect the filing in the local register');expect(packet).toContain('Opintel has not sent it to anyone.');expect(packet).not.toContain(privateSentinel);expect(packet).not.toContain(item.fileSha256);
});
it('RED-013: observation migration round-trips empty history and refuses to destroy retained facts',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();const up=await readFile('migrations/066_observation_history.up.sql','utf8'),down=await readFile('migrations/066_observation_history.down.sql','utf8');
 try{await db.query('BEGIN');await db.query(down);await db.query(up);expect((await db.query("SELECT policyname FROM pg_policies WHERE tablename='observation_event' ORDER BY policyname")).rows).toEqual([{policyname:'tenant_read'},{policyname:'tenant_write'}]);await db.query('ROLLBACK');
 unwrap(await register.notice(notice()));await db.query('BEGIN');await expect(db.query(down)).rejects.toThrow('Cannot downgrade while observation history exists');await db.query('ROLLBACK');
 }finally{await db.end();}
});

it('RED-013: accepted landing receipt closes a quarantine even before the notice projection catches up',async()=>{
 const {PostgresLandingReceiptRepository}=await import('../src/modules/ingest/infrastructure/landing-receipts.js');const repository=new PostgresLandingReceiptRepository(),item=notice();unwrap(await register.notice(item));
 const receipt={filingId:item.filingId,sourceId:f.source,projectId:f.ctx.projectId,partyCode:'party',kind:'return',period:'2026-10',asAt:null,strategy:'append_as_at' as const,landedTable:'landed_return',rowCount:2,fileSha256:item.fileSha256,supersedes:null,landedAt:'2026-10-06T15:00:00Z'};
 unwrap(await repository.accept(receipt));expect((await groups()).items).toEqual([]);expect((await members('filing:no_rule_matched:','resolved')).items[0]).toMatchObject({resolution:'landed',resolvedAt:new Date(receipt.landedAt).toISOString()});
 // A later delivered quarantine notice cannot overwrite the landing fact.
 unwrap(await register.notice({...item,revision:2}));expect((await groups()).items).toEqual([]);expect((await groups('resolved')).counts.resolved).toBe(1);
});
it('RED-012/014: member cursors preserve the complete packet across pages and cannot change scope',async()=>{
 const records=[notice(),notice(),notice()];for(const row of records)unwrap(await register.notice(row));
 const group=(await groups()).items[0]!;const q=new URLSearchParams({group:group.id,limit:'2'});const first=await(await fetch(base+'/observations/members?'+q)).json();expect(first.items).toHaveLength(2);expect(first.nextCursor).toBeTruthy();q.set('cursor',first.nextCursor);const second=await(await fetch(base+'/observations/members?'+q)).json();expect(second.items).toHaveLength(1);expect(new Set([...first.items,...second.items].map((row:ObservationMember)=>row.id)).size).toBe(3);
 q.set('group','filing:merged_header:');expect((await fetch(base+'/observations/members?'+q)).status).toBe(400);
});
