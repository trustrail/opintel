import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { expect,it } from 'vitest';
import { DuckDBSessionEngine,TwoSessionExecutor,type SessionStatement,type SessionEngine } from '../sidecar/session/index.js';
const limits={memoryMb:32,threads:1};
it('S2a: actual completed statement log puts lock_configuration last before uninspected agent SQL',async()=>{
 const log:SessionStatement[]=[],executor=new TwoSessionExecutor(new DuckDBSessionEngine(entry=>log.push(entry)));
 const sql='SELECT 42 AS answer';
 expect(await executor.execute(sql,limits)).toEqual({columns:['answer'],rows:[[42]]});
 const agent=log.filter(entry=>entry.role==='agent'),privileged=log.filter(entry=>entry.role==='privileged');
 const expected=["SET temp_directory = ''","SET max_temp_directory_size = '0B'",'SET enable_external_access = false','SET autoinstall_known_extensions = false','SET autoload_known_extensions = false','SET allow_unsigned_extensions = false',"SET memory_limit = '32MB'",'SET threads = 1','SET lock_configuration = true'];
 expect(agent.map(entry=>entry.sql)).toEqual([...expected,sql]);
 expect(agent.at(-2)).toMatchObject({sql:'SET lock_configuration = true',outcome:'completed'});
 expect(privileged.map(entry=>entry.sql)).toEqual(expected.filter(sql=>sql!=='SET enable_external_access = false'));
 expect(log.every(entry=>entry.outcome==='completed')).toBe(true);
 expect(new Set(log.map(entry=>entry.sessionId)).size).toBe(2);
 expect(privileged.some(entry=>entry.sql===sql)).toBe(false);
});
it('S2a: two engine sessions have independent instance configuration, not just separate connections',async()=>{
 const engine=new DuckDBSessionEngine(),privileged=await engine.open('privileged'),agent=await engine.open('agent');
 try{
  await privileged.execute("SET memory_limit = '17MB'");await agent.execute("SET memory_limit = '31MB'");
  const p=await privileged.execute("SELECT current_setting('memory_limit')"),a=await agent.execute("SELECT current_setting('memory_limit')");
  expect(p.rows).not.toEqual(a.rows);
 }finally{agent.close();privileged.close();}
});
it('J-013/J-014: engine refuses search_path toward a base catalogue and external-access re-enabling after lock',async()=>{
 const log:SessionStatement[]=[],executor=new TwoSessionExecutor(new DuckDBSessionEngine(entry=>log.push(entry)));
 await expect(executor.execute("SET search_path = 'pg_warehouse.public'",limits)).rejects.toThrow(/No catalog \+ schema|locked/iu);
 await expect(executor.execute('SET enable_external_access = true',limits)).rejects.toThrow(/configuration.*locked/iu);
 for(const entry of log.filter(entry=>entry.outcome==='failed'))expect(entry.role).toBe('agent');
});
it('S2a: the raw execute seam has no statement-kind filter; in-memory writes are left for S2c',async()=>{
 const sql='CREATE TABLE example(i INTEGER); INSERT INTO example VALUES (7); SELECT i FROM example';
 expect(await new TwoSessionExecutor().execute(sql,limits)).toEqual({columns:['i'],rows:[[7]]});
});
it('S2a: hardening settings are effective in the engine',async()=>{
 const result=await new TwoSessionExecutor().execute(`SELECT current_setting('temp_directory') AS temp,
 current_setting('max_temp_directory_size') AS spill,current_setting('enable_external_access') AS external,
 current_setting('autoinstall_known_extensions') AS install,current_setting('autoload_known_extensions') AS load,
 current_setting('allow_unsigned_extensions') AS unsigned,current_setting('threads') AS threads,current_setting('lock_configuration') AS locked`,limits);
 expect(result.rows[0]).toEqual(['','0 bytes',false,false,false,false,'1',true]);
});
it('S2a: sessions close on success, agent failure, hardening failure and partial construction',async()=>{
 for(const fail of ['none','agent-sql','hardening','privileged-hardening','agent-open'] as const){
  const events:string[]=[];
  const engine:SessionEngine={open:async role=>{
   events.push(`open:${role}`);if(fail==='agent-open'&&role==='agent')throw new Error('open failed');
   return {execute:async sql=>{events.push(`${role}:${sql}`);if(fail==='hardening'&&role==='agent'&&sql==='SET threads = 1'||fail==='privileged-hardening'&&role==='privileged'||fail==='agent-sql'&&sql==='SELECT 1')throw new Error('execution failed');return {columns:[],rows:[]};},close:()=>{events.push(`close:${role}`);}};
  }};
  const running=new TwoSessionExecutor(engine).execute('SELECT 1',limits);
  if(fail==='none')await running;else await expect(running).rejects.toThrow();
  expect(events.at(-1)).toBe('close:privileged');
  if(fail!=='agent-open'&&fail!=='privileged-hardening')expect(events.slice(-2)).toEqual(['close:agent','close:privileged']);
  if(fail==='privileged-hardening')expect(events).not.toContain('open:agent');
  if(fail==='hardening'||fail==='agent-open')expect(events).not.toContain('agent:SELECT 1');
  expect(events).not.toContain('privileged:SELECT 1');
 }
});
it('J-020: a real memory-limit failure does not spill into the isolated working directory',async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'opintel-session-memory-'));
 try{
  const {stdout}=await promisify(execFile)(process.execPath,['--import',resolve('node_modules/tsx/dist/loader.mjs'),resolve('test/fixtures/session-construction/memory.ts')],{cwd,timeout:25000});
  const result=JSON.parse(stdout) as {message:string;files:string[]};
  expect(result.message).toMatch(/Out of Memory Error/iu);expect(result.files).toEqual([]);
 }finally{await rm(cwd,{recursive:true,force:true});}
},30000);
