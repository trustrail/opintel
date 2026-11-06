import {acceptanceHostAddress} from '../scripts/images/first-hour-source.mjs';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {firstHourEngine} from '../scripts/images/first-hour-engine.mjs';
import {it,expect} from 'vitest';
import {firstHour,firstHourRefusal} from '../scripts/images/first-hour.mjs';
it('FH-011: the SMTP probe uses the installed daemon and cleanup tracks package projects as well as run labels',()=>{
 const driver=readFileSync('scripts/images/stage5-smoke.mjs','utf8'),relay=driver.split('\n').find(line=>line.includes('const relayOutput='));
 expect(relay).toContain("],{env:nested});");
 expect(driver).toContain('lab.trackCompose(gateway);lab.trackCompose(engine);');
 expect(driver).toContain('smtp-container-states.jsonl');
 expect(driver).toContain('smtp-container-list.jsonl');
});
it('FH-001: first-hour workflow imports only public transport tooling and cannot access Opintel stores',()=>{
 const text=readFileSync('scripts/images/first-hour.mjs','utf8');
 const imports=[...text.matchAll(/from '([^']+)'/gu)].map(m=>m[1]);
 expect(imports).toEqual(['node:assert/strict','node:crypto','node:timers/promises','node:url','@modelcontextprotocol/sdk/client/index.js','@modelcontextprotocol/sdk/client/streamableHttp.js']);
 expect(text).not.toMatch(/\b(?:withTenant|withPlatform|psql|provision|seed|child_process)\b/u);
 const driver=readFileSync('scripts/images/stage5-smoke.mjs','utf8');expect(driver).toContain("command('engine','sources','add'");expect(driver).toContain("if(firstHourActive)assert.ok([join(engine,'sources'),join(agent,'steps')].includes(command)");expect(driver).not.toContain("credentialRef:'secret://install/readiness'");
});
it('FH-002: rejects the old readiness reference and names an absent package source command',async()=>{
 await expect(firstHour({source:{credentialRef:'secret://install/readiness'}})).rejects.toThrow('Engine-host imported reference');
 const result=await firstHour({source:{credentialRef:'secret://sources/customer'}});expect(result.status).toBe('failed');expect(result.failure.message).toContain('Engine package sources add');
});

it('FH-007: refusal diagnostics retain only bounded classification and evidence identifiers, never free-form content',()=>{
 const evidenceId='01a18613-ebde-7372-8fb0-c8456b2a38c4';
 expect(firstHourRefusal({code:'unsupported_pushdown',cause:'scan_size_unknown',evidenceId,message:'private value',token:'synthetic-secret'})).toEqual({code:'unsupported_pushdown',cause:'scan_size_unknown',evidenceId});
 expect(firstHourRefusal({code:'x'.repeat(65),cause:'private payload!',evidenceId:'not a receipt'})).toEqual({code:'unknown',cause:'unknown'});
});

it('FH-008: acceptance registers the API pairing projection, never its original LAN address',()=>{
 const directory=mkdtempSync(join(tmpdir(),'first-hour-peer-'));
 try{
  mkdirSync(join(directory,'state/paired-engines'),{recursive:true});
  const identity={kind:'engine',address:'https://192.0.2.10:3100',pin:'00'.repeat(32)};
  writeFileSync(join(directory,'state/peer.json'),JSON.stringify(identity),{mode:0o600});
  expect(()=>firstHourEngine(directory)).toThrow();
  writeFileSync(join(directory,'state/paired-engines/peer.json'),JSON.stringify({...identity,address:'https://host.docker.internal:3100'}),{mode:0o600});
  expect(firstHourEngine(directory)).toEqual({address:'https://host.docker.internal:3100',pin:identity.pin});
  expect(readFileSync('scripts/images/stage5-smoke.mjs','utf8')).toContain('const peer=firstHourEngine(gateway)');
 }finally{rmSync(directory,{recursive:true,force:true});}
});

it.each([true,false])('FH-009: first hour honours automatic engine attachment (%s) without duplicate registration',async automatic=>{
 const project='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',engine={name:'Paired engine',address:'https://host.docker.internal:3100',certificatePin:'AA'.repeat(32)},calls=[];let exists=automatic;
 const request=async(path,method,body)=>{
  calls.push({path,method,body});let value;
  if(path.startsWith('/api/v1/companies?'))value={items:[{id:project,role:'admin'}],nextCursor:null};
  else if(path==='/api/v1/industries')value=[{id:project,slug:'reinsurance-treaty'}];
  else if(path==='/api/v1/projects')value={id:project,...automatic?{registeredEngine:{id,name:engine.name}}:{}};
  else if(path.includes('/pools?')||path.includes('/sources?'))value={items:[],nextCursor:null};
  else if(path.endsWith('/engines')&&method==='POST'){exists=true;value={ok:true};}
  else if(path.includes('/engines?'))value={items:exists?[{...engine,id}]:[],nextCursor:null};
  else if(path.endsWith('/verify'))value={ok:true};
  else return {status:503,text:JSON.stringify({error:{code:'fixture_stop'}})};
  return {status:200,text:JSON.stringify(value)};
 };
 const result=await firstHour({request,engine,source:{credentialRef:'secret://sources/customer'},addSource:async()=> 'secret://sources/customer'});
 expect(result.steps.some(step=>step.step==='verify-engine'&&step.status==='passed')).toBe(true);
 expect(calls.filter(call=>call.path.endsWith('/engines')&&call.method==='POST')).toHaveLength(automatic?0:1);
 expect(result.failure.step).toBe('designate-custody-engine');
});

it('FH-010: Stage 5 uses the existing console-harness Docker Desktop route for both gateway and source',()=>{
 expect(acceptanceHostAddress('darwin','192.0.2.10')).toBe('host.docker.internal');expect(acceptanceHostAddress('linux','192.0.2.10')).toBe('192.0.2.10');
 const driver=readFileSync('scripts/images/stage5-smoke.mjs','utf8');expect(driver).toContain("base='https://'+clientHost");expect(driver).toContain('customerPostgres,host:clientHost,env:outer');
});

it('FH-012: the external seed target uses the outer host address, independently of the engine caller alias',()=>{
 const driver=readFileSync('scripts/images/stage5-smoke.mjs','utf8');
 expect(acceptanceHostAddress('darwin','192.0.2.42')).toBe('host.docker.internal');
 expect(driver).toContain("const target=new URL('postgresql://'+hostAddress+':'+customerSource.port+'/'+customerSource.database)");
 expect(driver).toContain("command('engine','sources','add','v01','--host',customerSource.host");
 expect(driver).not.toContain("const target=new URL('postgresql://'+customerSource.host");
});
