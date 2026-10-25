import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdtemp,readFile,chmod,symlink,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {matchingSettings,lifecycleReady} from '../scripts/operator/preconditions.js';
import {privateRead,privateWrite,locked} from '../scripts/operator/common.js';
import {demoManifest} from '../scripts/soak/manifest.js';
import {syntheticSource} from '../scripts/operator/infrastructure/synthetic-source.js';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
const cleanup:string[]=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const path of cleanup.splice(0))await rm(path,{recursive:true,force:true});});
describe('DEP-009 operator resume boundaries',()=>{
 it('adds absent settings, retains existing decisions, and reports conflicts without mutations',()=>{const old={query:{rowLimit:40},custody:{provider:'xq'}};expect(matchingSettings(old,{query:{memoryLimitMb:128}})).toEqual({...old,query:{rowLimit:40,memoryLimitMb:128}});expect(()=>matchingSettings(old,{query:{rowLimit:100}})).toThrow('conflict');expect(old).toEqual({query:{rowLimit:40},custody:{provider:'xq'}});});
 it('writes private manifests, rejects insecure/symlink inputs and refuses concurrent operators',async()=>{const dir=await mkdtemp(join(tmpdir(),'stage4-private-'));cleanup.push(dir);const file=join(dir,'manifest.json');await privateWrite(file,{key:'synthetic-private-value'});expect((await stat(file)).mode&0o777).toBe(0o600);await locked(file,async()=>{await expect(locked(file,async()=>{})).rejects.toThrow();});await symlink(file,join(dir,'link'));await expect(privateRead(join(dir,'link'))).rejects.toThrow();await chmod(file,0o644);await expect(privateRead(file)).rejects.toThrow();expect(JSON.parse(await readFile(file,'utf8'))).toEqual({key:'synthetic-private-value'});});
});
it('DEP-011 fails missing, expired and too-short lifecycle coverage before timing',()=>{const agent={poolIndex:0,pool:randomUUID(),credentialId:randomUUID(),key:'synthetic',keyVersion:randomUUID(),done:true};const m=demoManifest.parse({version:2,projectId:randomUUID(),definitionHash:'test',agents:[],objects:{}});expect(()=>lifecycleReady(m,120,0)).toThrow('Missing');m.lifecycle={retiring:{...agent,graceUntil:new Date(1000).toISOString()},revoked:agent};expect(()=>lifecycleReady(m,120,2000)).toThrow('expired');m.lifecycle.retiring!.graceUntil=new Date(200000).toISOString();expect(()=>lifecycleReady(m,120,0)).toThrow('too short');m.lifecycle.retiring!.graceUntil=new Date(300000).toISOString();expect(()=>lifecycleReady(m,120,0)).not.toThrow();});
it('DEP-010 seeds a separate database, proves estimates, preserves unrelated data and refuses changed/empty existing tables',async()=>{
 const admin=new Client({connectionString:process.env.TEST_DATABASE_URL});await admin.connect();const database='stage4_seed_'+randomUUID().replaceAll('-','');
 await admin.query('CREATE DATABASE "'+database+'"');const url=new URL(process.env.TEST_DATABASE_URL!);url.pathname='/'+database;
 const source=new Client({connectionString:url.href});await source.connect();
 try{vi.stubEnv('OPINTEL_DEMO_DATABASE_URL',url.href);vi.stubEnv('OPINTEL_DEMO_FIXTURE','V-01');vi.stubEnv('OPINTEL_DEMO_SEED','1');vi.stubEnv('OPINTEL_DEMO_SCHEMAS','soak_policies,soak_claims,soak_recoveries');
 await source.query('CREATE TABLE public.untouched(value text); INSERT INTO public.untouched VALUES(\'customer-owned sentinel\')');
 const first=await syntheticSource(true);expect(first.tables).toHaveLength(6);for(const t of first.tables)expect(t.estimate).toBe(t.count);expect(await syntheticSource(true)).toEqual(first);expect(await syntheticSource(false)).toEqual(first);
 await source.query("UPDATE soak_recoveries.open_reference SET description='changed'");await expect(syntheticSource(true)).rejects.toThrow('conflict');expect((await source.query('SELECT value FROM public.untouched')).rows).toEqual([{value:'customer-owned sentinel'}]);
 await source.query('TRUNCATE soak_recoveries.open_reference');await expect(syntheticSource(true)).rejects.toThrow('conflict');expect((await source.query('SELECT count(*)::int AS n FROM soak_recoveries.open_reference')).rows[0].n).toBe(0);
 }finally{await source.end();await admin.query('DROP DATABASE "'+database+'"');await admin.end();}
});
