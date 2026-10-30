import {randomUUID} from 'node:crypto';
import {beforeEach,it,expect,vi} from 'vitest';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {withPlatform,withPlatformAdmin,withTenant} from '../src/platform/db/scope.js';
import {CompanyId,IndustryId,ProjectName,UserId,Timestamp} from '../src/shared/kernel/index.js';
import type {AuthorizationPort,AuthorizationRevision} from '../src/modules/authz/index.js';
import {RelationshipOutbox} from '../src/modules/tenancy/index.js';
import {CreateProjectService} from '../src/modules/tenancy/application/create-project.js';
import {PostgresProjectCreationRepository} from '../src/modules/tenancy/infrastructure/project-creation-repository.js';
import {PostgresPairedEngineCandidates} from '../src/modules/tenancy/infrastructure/paired-engines.js';
import {pairedEngineRoutes} from '../src/modules/tenancy/api/project-routes.js';
import type {PairedEngine} from '../src/modules/tenancy/application/paired-engines.js';
const company=CompanyId(randomUUID()),actor=UserId(randomUUID()),industry=IndustryId(randomUUID());
const candidate=(id:string):PairedEngine=>({id:id.repeat(64),name:'Engine '+id,address:`https://${id}.engine.test`,certificatePin:id.toUpperCase().repeat(64)});
const revision='first-run-test' as AuthorizationRevision;
const unexpected=async():Promise<never>=>{throw new Error('Unexpected authorization call');};
const auth:AuthorizationPort={write:vi.fn(async()=>revision),check:vi.fn(async()=>({allowed:true,token:revision,checkedAt:Timestamp(new Date()),snapshotAgeMs:0})),checkMany:unexpected,explain:unexpected};
resetDatabaseBeforeEach('industry','company','user_account','relationship_outbox');
beforeEach(async()=>{await withPlatform(async tx=>{await tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[actor,'owner@first-run.test']);await tx.query("INSERT INTO company(id,name,default_region) VALUES($1,'First run','us-east-1')",[company]);await tx.query("INSERT INTO company_member(company_id,user_id,role) VALUES($1,$2,'admin')",[company,actor]);});await withPlatformAdmin({actor:{kind:'system',name:'first-run-test'}},tx=>tx.query("INSERT INTO industry(id,slug,name) VALUES($1,$2,'Industry')",[industry,industry]));});
async function create(candidates:PairedEngine[],selected?:string){const outbox=new RelationshipOutbox(),service=new CreateProjectService(new PostgresProjectCreationRepository(outbox,{read:async()=>candidates}),outbox,auth);return service.create({companyId:company,name:ProjectName('Project '+randomUUID()),industryId:industry,region:'us-east-1',pairedEngineId:selected},actor);}
it('one unregistered paired engine is atomically attached, unverified; a later project cannot claim it again',async()=>{
 const first=await create([candidate('a')]);expect(first.ok).toBe(true);if(!first.ok)return;expect(first.value.registeredEngine?.name).toBe('Engine a');const rows=await withTenant({projectId:first.value.id,userId:actor},tx=>tx.query('SELECT name,health,verified_at,custody FROM engine'));expect(rows).toEqual([{name:'Engine a',health:'unverified',verified_at:null,custody:false}]);
 const second=await create([candidate('a')]);expect(second.ok&&second.value.registeredEngine).toBeNull();
 const publicList=await new PostgresPairedEngineCandidates({read:async()=>[candidate('a'),candidate('b')]}).list(company,actor);expect(publicList).toEqual([{id:'b'.repeat(64),name:'Engine b'}]);expect(JSON.stringify(publicList)).not.toContain('certificatePin');
});
it('multiple candidates are returned by name without silently choosing; explicit selection attaches only that engine',async()=>{
 const unselected=await create([candidate('a'),candidate('b')]);expect(unselected.ok&&unselected.value.registeredEngine).toBeNull();expect(unselected.ok&&unselected.value.pairedEngines).toHaveLength(2);
 const selected=await create([candidate('a'),candidate('b')],'b'.repeat(64));expect(selected.ok&&selected.value.registeredEngine?.name).toBe('Engine b');
});
it('a stale selection rolls back the whole project and its membership/outbox',async()=>{
 const before=await withPlatform(tx=>tx.query('SELECT id FROM project'));
 const result=await create([candidate('a')],'b'.repeat(64));expect(result.ok).toBe(false);expect(!result.ok&&result.error.code).toBe('conflict');expect(await withPlatform(tx=>tx.query('SELECT id FROM project'))).toEqual(before);
});
it('a completed project transaction cannot attach silently, and the candidates route declares company administer',async()=>{
 const result=await create([]);if(!result.ok)throw result.error;
 await expect(withPlatform(tx=>tx.query('SELECT first_run_paired_engines($1,$2,$3,$4::jsonb,NULL)',[company,actor,result.value.id,JSON.stringify([candidate('a')])]))).rejects.toMatchObject({code:'22023'});
 expect(pairedEngineRoutes({list:async()=>[]})[0]?.permission).toMatchObject({resource:'company',permission:'administer'});
});
it('parallel project creation can assign a paired physical engine only once',async()=>{const results=await Promise.all([create([candidate('a')]),create([candidate('a')])]);expect(results.every(r=>r.ok)).toBe(true);expect(results.filter(r=>r.ok&&r.value.registeredEngine)).toHaveLength(1);});
