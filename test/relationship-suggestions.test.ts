import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {beforeEach,afterEach,it,expect} from 'vitest';
import {policyFixture,unwrap,type PolicyFixture} from './fixtures/policy-version/fixture.js';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {withTenant,withPlatform} from '../src/platform/db/scope.js';
import {EvidenceQuery,PostgresEvidenceReader,DuckDBEvidenceText} from '../src/modules/evidence/index.js';
import {PostgresSuggestions,suggestionRoutes} from '../src/modules/relationships/index.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {Timestamp} from '../src/shared/kernel/index.js';
import type {AuthorizationPort,AuthorizationRevision} from '../src/modules/authz/index.js';
resetDatabaseBeforeEach('company');
let f:PolicyFixture,repo:PostgresSuggestions,server:ReturnType<typeof createHttpServer>,base:string,admin:boolean,unredacted:boolean,failStrip:boolean;
async function attempt(operation:'query'|'explain'='explain',reverse=false,atOverride?:string){const id=randomUUID();await withTenant(f.ctx,async tx=>{
 const at=operation==='query'?(await tx.query<{at:string}>(`INSERT INTO query_run(id,project_id,pool_id,key_prefix,mode,versions,started_at) VALUES($1,$2,$3,'test','query','{"policy":1,"catalog":1,"vocabulary":1,"tokenKeyVersionSelected":null}',clock_timestamp()) RETURNING started_at::text AS at`,[id,f.ctx.projectId,f.pool]))[0]!.at:atOverride??(await tx.query<{at:string}>('SELECT clock_timestamp()::text AS at'))[0]!.at;
 await tx.query(`INSERT INTO token_join_candidate(id,run_id,operation,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'claimed-agent',$10,$11)`,[id,operation==='query'?id:null,operation,f.ctx.projectId,f.pool,f.ids[reverse?1:0],f.ids[reverse?0:1],reverse?'warehouse.public.records.field_2':'warehouse.public.records.field_1',reverse?'warehouse.public.records.field_1':'warehouse.public.records.field_2',"SELECT field_1 FROM warehouse.public.records WHERE field_1='SUG_PRIVATE_SENTINEL'",at]);
 });return id;}
const list=async()=>unwrap(await repo.list(f.ctx,undefined,25));
beforeEach(async()=>{
 f=await policyFixture(3);await f.set('tokenized',randomUUID(),f.ids.slice(0,2));admin=true;unredacted=false;failStrip=false;await withPlatform(tx=>tx.query("INSERT INTO user_account(id,email,full_name) VALUES($1,$2,'Reviewer')",[f.ctx.userId,`${f.ctx.userId}@example.com`]));
 const verdict=(allowed:boolean)=>({allowed,token:'test' as AuthorizationRevision,checkedAt:Timestamp(new Date()),snapshotAgeMs:0});const unexpected=async():Promise<never>=>{throw new Error('Unexpected auth mutation');};
 const auth:AuthorizationPort={check:async r=>verdict(r.permission==='administer'?admin:true),checkMany:async rs=>rs.map(()=>verdict(unredacted)),write:unexpected,explain:unexpected};
 repo=new PostgresSuggestions(new EvidenceQuery(new PostgresEvidenceReader(),auth,{stripSql:sql=>failStrip?Promise.resolve(null):new DuckDBEvidenceText().stripSql(sql)}));
 server=createHttpServer(suggestionRoutes(repo),{authorization:{port:auth,currentUser:async()=>({id:f.ctx.userId,email:'review@example.com',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})},logger:{error:()=>{}}});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error();base=`http://127.0.0.1:${address.port}/api/v1/projects/${f.ctx.projectId}/suggestions`;
});
afterEach(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));});
it('SUG-001/004: unordered pair groups attempt facts; not sure persists and later attempts raise it again without changing tokens',async()=>{
 const first=await attempt('query');await attempt('explain',true);const latest=await attempt('explain');const page=await list();expect(page.items).toHaveLength(1);const pair=page.items[0]!;
 expect(pair).toMatchObject({queries:1,explains:2,latestAttemptId:latest,status:'pending',raisedAgain:false,confirmationBlocked:null,agents:['claimed-agent']});
 const before=await withTenant(f.ctx,tx=>tx.query('SELECT * FROM token_domain_assignment ORDER BY element_id,version'));
 unwrap(await repo.decide(f.ctx,pair.id,{action:'not_sure',latestAttemptId:latest}));expect((await list()).items[0]).toMatchObject({status:'not_sure',raisedAgain:false,history:[{action:'not_sure',actorId:f.ctx.userId,domain:null}]});
 await attempt('query');expect((await list()).items[0]).toMatchObject({status:'not_sure',raisedAgain:true,queries:2,explains:2});
 const next=(await list()).items[0]!;unwrap(await repo.decide(f.ctx,pair.id,{action:'reject',latestAttemptId:next.latestAttemptId}));expect((await list()).items[0]!.history.map(h=>h.action)).toEqual(['not_sure','reject']);
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT * FROM token_domain_assignment ORDER BY element_id,version'))).toEqual(before);
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT id FROM token_join_candidate WHERE id=$1',[first]))).toHaveLength(1);
});
it('SUG-002/003: explicit shared-domain confirmation records assignment versions atomically; stale membership and unauthorized writes refuse',async()=>{
 const latest=await attempt(),pair=(await list()).items[0]!;
 await withTenant(f.ctx,tx=>tx.query("UPDATE catalog_element SET token_domain='shared' WHERE id=$1",[f.ids[2]]));
 const domain=unwrap(await repo.domains(f.ctx,undefined,25)).items.find(d=>d.domain==='shared')!;expect(domain.members[0]).toMatchObject({elementId:f.ids[2],name:'warehouse.public.records.field_3'});
 const body={action:'confirm' as const,domain:'shared',confirmation:'Bulk project',latestAttemptId:latest,members:domain.members.map(m=>({elementId:m.elementId,version:m.version}))};
 expect(await repo.decide(f.ctx,pair.id,{...body,members:[]})).toMatchObject({ok:false,error:{code:'conflict'}});
 expect(await repo.decide(f.ctx,pair.id,{...body,confirmation:'wrong'})).toMatchObject({ok:false,error:{code:'conflict'}});
 admin=false;expect((await fetch(`${base}/${pair.id}/decisions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})).status).toBe(403);admin=true;
 const other=await policyFixture(2);expect(unwrap(await repo.list(other.ctx,undefined,25)).items).toEqual([]);expect(await repo.decide(other.ctx,pair.id,body)).toMatchObject({ok:false,error:{code:'not_found'}});
 const response=await fetch(`${base}/${pair.id}/decisions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});expect(response.status).toBe(200);
 const confirmed=(await list()).items[0]!;expect(confirmed.history[0]).toMatchObject({action:'confirm',actorId:f.ctx.userId,domain:'shared',assignments:expect.arrayContaining(f.ids.slice(0,2).map(elementId=>({elementId,version:2})))});
 expect(unwrap(await repo.domains(f.ctx,undefined,25)).items.find(d=>d.domain==='shared')!.members).toHaveLength(3);
 unwrap(await repo.decide(f.ctx,pair.id,{action:'reject',latestAttemptId:latest}));expect((await list()).items[0]!.history.map(h=>h.action)).toEqual(['confirm','reject']);
 for(const sql of ['UPDATE token_join_review SET action=action','DELETE FROM token_join_review'])await expect(withTenant(f.ctx,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
});
it('SUG-003: changed domain membership or later attempts refuse; assignments roll back if the review cannot be recorded',async()=>{
 const latest=await attempt(),pair=(await list()).items[0]!;
 await attempt();expect(await repo.decide(f.ctx,pair.id,{action:'confirm',domain:'shared',confirmation:'Bulk project',members:[],latestAttemptId:latest})).toMatchObject({ok:false,error:{code:'conflict'}});
 const current=(await list()).items[0]!,body={action:'confirm' as const,domain:'shared',confirmation:'Bulk project',members:[],latestAttemptId:current.latestAttemptId};
 // Owner transaction installs an independent failing insert trigger. No product
 // method or assignment trigger is mocked or disabled.
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{await db.query("CREATE FUNCTION test_review_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test review refusal'; END $$; CREATE TRIGGER test_review_failure BEFORE INSERT ON token_join_review FOR EACH ROW EXECUTE FUNCTION test_review_failure()");
 await expect(repo.decide(f.ctx,pair.id,body)).rejects.toThrow('test review refusal');
 expect(await withTenant(f.ctx,tx=>tx.query("SELECT id FROM catalog_element WHERE token_domain='shared'"))).toEqual([]);
 }finally{await db.query('DROP TRIGGER IF EXISTS test_review_failure ON token_join_review; DROP FUNCTION IF EXISTS test_review_failure()');await db.end();}
});
it('SUG-003/004: tokenized/clear pairs remain visible but cannot confirm, and new domains cannot claim reserved namespaces',async()=>{
 const latest=await attempt();await f.set('clear',randomUUID(),[f.ids[1]!]);const pair=(await list()).items[0]!;expect(pair.confirmationBlocked).toContain('tokenized first');
 const response=await fetch(`${base}/${pair.id}/decisions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'confirm',domain:'shared',confirmation:'Bulk project',members:[],latestAttemptId:latest})});expect(response.status).toBe(409);
 for(const domain of ['sentinel','opintelisolated123'])expect((await fetch(`${base}/${pair.id}/decisions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'confirm',domain,confirmation:'Bulk project',members:[],latestAttemptId:latest})})).status).toBe(400);
 unwrap(await repo.decide(f.ctx,pair.id,{action:'not_sure',latestAttemptId:latest}));expect((await list()).items[0]!.status).toBe('not_sure');
});
it('SUG-005: query and explain SQL share Activity authorization and parsed redaction, failing closed on stripping failure',async()=>{
 await attempt('query');await attempt('explain');const pair=(await list()).items[0]!;
 for(const [allowed,mode] of [[false,'none'],[true,'aggressive'],[true,'allowlist'],[true,'none']] as const){unredacted=allowed;await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{evidence}',$2::jsonb) WHERE id=$1",[f.ctx.projectId,JSON.stringify({redaction:mode,allowlistedFields:['sql']})]));
 const response=await fetch(`${base}/${pair.id}/attempts`);expect(response.status).toBe(200);const body=await response.json();expect(JSON.stringify(body).includes('SUG_PRIVATE_SENTINEL')).toBe(allowed&&mode==='none');
 if(mode==='allowlist')expect(body.items.map((i:{argumentVisibility:string})=>i.argumentVisibility)).toEqual(['literal_stripped','literal_stripped']);
 }
 unredacted=true;failStrip=true;await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{evidence}',$2::jsonb) WHERE id=$1",[f.ctx.projectId,JSON.stringify({redaction:'allowlist',allowlistedFields:['sql']})]));expect(unwrap(await repo.attempts(f.ctx,pair.id,undefined,25)).items.every(i=>i.statement===null)).toBe(true);
 const first=unwrap(await repo.attempts(f.ctx,pair.id,undefined,1));expect(first.items).toHaveLength(1);expect(first.nextCursor).not.toBeNull();expect(unwrap(await repo.attempts(f.ctx,pair.id,first.nextCursor!,1)).items[0]!.id).not.toBe(first.items[0]!.id);
});
it('SUG-002: review migration round-trips and retains forced RLS; destructive downgrade refuses',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();try{await db.query('BEGIN');const down=await readFile('migrations/065_relationship_review.down.sql','utf8'),up=await readFile('migrations/065_relationship_review.up.sql','utf8');await db.query(down);await db.query(up);expect((await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='token_join_review'::regclass")).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true}]);}finally{await db.query('ROLLBACK');await db.end();}
 const latest=await attempt(),pair=(await list()).items[0]!;unwrap(await repo.decide(f.ctx,pair.id,{action:'reject',latestAttemptId:latest}));const down=await readFile('migrations/065_relationship_review.down.sql','utf8');
 const owner=new Client({connectionString:process.env.TEST_DATABASE_URL});await owner.connect();try{await owner.query('BEGIN');await expect(owner.query(down)).rejects.toThrow('Cannot downgrade while relationship review history exists');}finally{await owner.query('ROLLBACK');await owner.end();}
});

it('SUG-001/004: a late-recorded earlier attempt does not invalidate an existing review reference',async()=>{const latest=await attempt(),original=(await list()).items[0]!;await attempt('explain',false,'2000-01-01T00:00:00Z');expect(unwrap(await repo.attempts(f.ctx,original.id,undefined,25)).items).toHaveLength(2);unwrap(await repo.decide(f.ctx,original.id,{action:'not_sure',latestAttemptId:latest}));expect((await list()).items[0]).toMatchObject({status:'not_sure',explains:2,history:[{actorId:f.ctx.userId,action:'not_sure'}]});});
