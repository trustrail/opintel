import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect } from 'vitest';
// Published interface only. No implementation imports or source inspection.
import { DuckDBSessionEngine, TwoSessionExecutor, type SessionEngine, type SessionRows, type SessionStatement } from '../../sidecar/session/index.js';
export const literal=(value:string)=>`'${value.replaceAll("'","''")}'`;
export const secret='WITHHELD_SENTINEL_9b21',unknownSecret='UNDECIDED_SENTINEL_8c31',rawCard='4111111111111234';
export const allowedSql=`CREATE SCHEMA public;
 CREATE TABLE public.orders AS SELECT i::INTEGER AS id,(100+i)::INTEGER AS amount,CASE WHEN i=1 THEN 'x' ELSE 'noise' END AS transaction_id,
 'v1_c_'||CASE WHEN i=1 THEN repeat('A',26) ELSE repeat('B',26) END AS customer_id,'************1234' AS card_number,
 CASE WHEN i=1 THEN 42 ELSE 20 END AS age,CASE WHEN i=1 THEN '12345' ELSE '99999' END AS zip,CASE WHEN i=1 THEN 0.1 ELSE 0.9999 END AS random_col
 FROM range(1,7) r(i);
 CREATE VIEW public.records AS SELECT * FROM public.orders;
 CREATE VIEW public.t AS SELECT * FROM public.orders;
 CREATE TABLE public.copy_target(id INTEGER,payload VARCHAR); USE warehouse.public;`;
const rawSql=`CREATE SCHEMA __staging; CREATE TABLE __staging.warehouse__public__orders AS SELECT 1 AS id,${literal(secret)} AS salary,${literal(unknownSecret)} AS undecided_col;
 ATTACH ':memory:' AS pg_warehouse; CREATE SCHEMA pg_warehouse.public;
 CREATE TABLE pg_warehouse.public.orders AS SELECT * FROM __staging.warehouse__public__orders; CREATE VIEW __staging.raw_view AS SELECT salary FROM pg_warehouse.public.orders;`;
export type Outcome={ok:true;value:SessionRows}|{ok:false;message:string;code?:string};
export type RunOptions={positive?:boolean;brokenLock?:boolean;tracker?:boolean;memoryMb?:number;positiveSetup?:string;fileDatabase?:string};
export interface Finding {id:string;variant:string;status:string;detail:string}
export const findings:Finding[]=[];
export function record(id:string,variant:string,status:string,detail:string){findings.push({id,variant,status,detail});}
export async function fixtures(){
 const dir=await mkdtemp(join(tmpdir(),'opintel-bypass-'));
 await writeFile(join(dir,'data.csv'),'id,salary\n1,'+secret+'\n');
 await writeFile(join(dir,'data.json'),JSON.stringify([{id:1,salary:secret}]));
 await writeFile(join(dir,'data.txt'),secret);
 const engine=new DuckDBSessionEngine(),setup=await engine.open('privileged');
 try{
  await setup.execute(`COPY (SELECT ${literal(secret)} AS salary) TO ${literal(join(dir,'data.parquet'))} (FORMAT PARQUET)`);
  await setup.execute(`ATTACH ${literal(join(dir,'other.db'))} AS other; CREATE TABLE other.main.orders AS SELECT ${literal(secret)} AS salary; DETACH other`);
  for(const [fn,file] of [['read_csv','data.csv'],['read_parquet','data.parquet'],['read_json','data.json'],['read_text','data.txt']]){
   const control=await setup.execute(`SELECT * FROM ${fn}(${literal(join(dir,file!))})`);expect(JSON.stringify(control.rows),`Valid sentinel file control for ${fn}`).toContain(secret);
  }
 }finally{setup.close();}
 const baseline=await readdir(dir);
 return {dir,baseline,close:()=>rm(dir,{recursive:true,force:true})};
}
export async function run(sql:string,options:RunOptions={}):Promise<Outcome>{
 const log:SessionStatement[]=[],driver=new DuckDBSessionEngine(entry=>log.push(entry));
 const engine:SessionEngine={open:async role=>{
  const session=await driver.open(role);
  try{
   if(role==='privileged'){await session.execute(rawSql);if(options.fileDatabase)await session.execute(`ATTACH ${literal(options.fileDatabase)} AS fixture_database (READ_ONLY)`);}
   else {
    await session.execute(`ATTACH ':memory:' AS warehouse; USE warehouse; ${allowedSql}`);
    if(options.positive) {
     await session.execute(rawSql);
     await session.execute(`ALTER TABLE warehouse.public.orders ADD COLUMN salary VARCHAR; UPDATE warehouse.public.orders SET salary=${literal(secret)};
      ALTER TABLE warehouse.public.orders ADD COLUMN undecided_col VARCHAR; UPDATE warehouse.public.orders SET undecided_col=${literal(unknownSecret)};
      CREATE OR REPLACE VIEW warehouse.public.records AS SELECT * FROM warehouse.public.orders;CREATE OR REPLACE VIEW warehouse.public.t AS SELECT * FROM warehouse.public.orders;`);
    }
    if(options.positiveSetup)await session.execute(options.positiveSetup);
    if(options.tracker)await session.execute(`CREATE OR REPLACE VIEW public.t AS SELECT id,amount AS salary,age,zip,random_col FROM public.orders`);
   }
  }catch(error){session.close();throw error;}
  // Explicit mutation control only. Ordinary attacks never intercept or alter SQL.
  if(options.brokenLock)return {close:()=>session.close(),execute:sql=>sql==='SET lock_configuration = true'?Promise.resolve({columns:[],rows:[]}):session.execute(sql)};
  return session;
 }};
 let result:Outcome;
 try{result={ok:true,value:await new TwoSessionExecutor(engine).execute(sql,{memoryMb:options.memoryMb??32,threads:1})};}
 catch(error:unknown){
  const message=error instanceof Error?error.message:String(error);
  const object=typeof error==='object'&&error!==null?error as Record<string,unknown>:{};
  const nested=typeof object.error==='object'&&object.error!==null?object.error as Record<string,unknown>:object;
  result={ok:false,message,...(typeof nested.code==='string'?{code:nested.code}:{})};
 }
 expect(log.some(entry=>entry.role==='agent'&&entry.sql===sql),`PREREQUISITE: attack never reached agent session: ${sql}; ${result.ok?'':result.message}`).toBe(true);
 return result;
}
export function refused(id:string,variant:string,result:Outcome,code?:string,construct?:string){
 const unrelated=!result.ok&&/Parser Error|syntax error|No files found|Function.*does not exist|unrecognized configuration/iu.test(result.message);
 record(id,variant,result.ok?'ATTACK_SUCCEEDED':unrelated?'INVALID_PROBE':result.code?'REFUSED_STRUCTURED':'REFUSED_RAW',result.ok?JSON.stringify(result.value):result.message);
 expect(result.ok,`${id}: attack returned rows or completed`).toBe(false);
 if(result.ok)return;
 expect(result.message,`${id}: unrelated parser/fixture failure is not a security refusal`).not.toMatch(/Parser Error|syntax error|No files found|Function.*does not exist|unrecognized configuration/iu);
 if(code)expect(result.code,`${id}: J-048 requires a structured ${code} refusal, not a raw engine error`).toBe(code);
 if(construct)expect(result.message.toLowerCase()).toContain(construct.toLowerCase());
}
export function noLeak(id:string,variant:string,result:Outcome){
 const serialized=JSON.stringify(result);
 const leaked=[secret,unknownSecret,rawCard,'__staging','pg_warehouse','undecided_col','salary'].filter(value=>serialized.includes(value));
 record(id,variant,leaked.length?'ATTACK_SUCCEEDED':result.ok?'NO_LEAK':'REFUSED_RAW',leaked.length?`Disclosed: ${leaked.join(', ')}`:result.ok?'No forbidden metadata':result.message);
 expect(leaked,`${id}: leaked protected metadata`).toEqual([]);
}
export async function positive(sql:string){
 const result=await run(sql,{positive:true});expect(result.ok,`J-046 positive control failed: ${result.ok?'':result.message}`).toBe(true);
 if(!result.ok)throw new Error(result.message);expect(result.value.rows.length,'J-046 positive control returned no rows').toBeGreaterThan(0);return result.value;
}
