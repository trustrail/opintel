import {it,expect} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {companionCustodyAcceptance} from '../scripts/images/companion-custody-acceptance.mjs';
it.each([false,true])('candidate custody companion uses kit export, private env file and all six live assertions; fails=%s',fail=>{
 const directory=mkdtempSync(join(tmpdir(),'companion-acceptance-')),calls=[];
 const run=(binary,args)=>{
  calls.push({binary,args});
  if(binary.endsWith('/identities'))writeFileSync(args.at(-1),JSON.stringify({secret:'PRIVATE_SENTINEL'}),{mode:0o600});
  if(args[0]==='port')return {status:0,stdout:'127.0.0.1:18080\n'};
  if(args[0]?.endsWith('live-check.mjs')){writeFileSync(args.at(-1),JSON.stringify({status:'passed',checks:Array.from({length:6},(_,i)=>({name:String(i)}))}));return {status:fail?1:0,stdout:'redacted checks only'};}
  return {status:0,stdout:''};
 };
 writeFileSync(join(directory,'gateway-ca.pem'),'PUBLIC_TEST_CA',{mode:0o600});
 const options={directory,agent:directory,key:join(directory,'key'),apiKeyFile:join(directory,'api'),base:'https://gateway.example',project:'fixture-project',sql:'SELECT custody_label FROM fixture.public.records',aggregateSql:'SELECT SUM(amount) AS total FROM fixture.public.records',revision:'abcdef0',run};
 try{
  if(fail)expect(()=>companionCustodyAcceptance(options)).toThrow('Companion rows/aggregate/replay');else expect(companionCustodyAcceptance(options).checks).toHaveLength(6);
  expect(statSync(join(directory,'companion.env')).mode&0o777).toBe(0o600);
  expect(JSON.stringify(calls)).not.toContain('PRIVATE_SENTINEL');
  expect(calls.find(c=>c.binary.endsWith('/identities')).args[0]).toBe('export-companion');
  const cases=JSON.parse(readFileSync(join(directory,'companion-cases.json'),'utf8'));expect(cases.map(c=>c.name)).toEqual(['rows','aggregate']);expect(cases[1].lookup).toBe('both');
  expect(calls.some(c=>c.args.includes('--env-file'))).toBe(true);expect(calls.at(-1).args).toContain('--force');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
