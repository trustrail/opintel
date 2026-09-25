import { readFile, readdir, open, rename, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ProjectId, DomainError, ok, err, type Result } from '../../../src/shared/kernel/index.js';
import { SecretRef } from '../../../src/platform/secrets/index.js';
import { custodyOperations, custodyMessages, type CustodyOperation } from '../../../src/shared/custody-contract.js';
import { TokenKey, TokenizationRun, IanaZoneResolver } from '../../tokenize/index.js';
import type { KeyStore, KeyEscrow } from '../ports.js';
const version=z.number().int().positive();
const stateSchema=z.object({current:version.nullable(),versions:z.array(version),initialSentinel:z.string().optional(),
 candidates:z.record(z.string(),z.object({kind:z.enum(['rotate','restore']),version,expected:version,expires:z.number(),sentinel:z.string(),committed:z.boolean(),cleanup:z.boolean().optional()})),
});
type State=z.infer<typeof stateSchema>;
const ref=(name:string)=>SecretRef('secret://custody/'+name);
function derive(bytes:Uint8Array):string {const key=TokenKey.take(bytes);if(!key.ok)throw key.error;try{const value=new TokenizationRun(key.value,new IanaZoneResolver()).sentinel();if(!value.ok||value.value===null)throw new Error('Sentinel derivation failed.');return value.value;}finally{key.value.dispose();}}
export class FileCustody {
 constructor(private readonly store:KeyStore,private readonly escrow:KeyEscrow,private readonly now:()=>number=Date.now){if(store.location===escrow.location)throw new Error('KeyStore and KeyEscrow must resolve to different locations.');}
 async sweep(){for(const entry of await readdir(this.store.location,{withFileTypes:true})){if(entry.isDirectory()&&/^[0-9a-f-]{36}$/u.test(entry.name))await this.invoke('status',entry.name,{});}}
 async resolveBytes(reference:import('../../../src/platform/secrets/index.js').SecretRef):Promise<Uint8Array>{
  const match=/^secret:\/\/opintel\/token-key\/([0-9a-f-]{36})$/u.exec(reference);
  if(!match)throw new DomainError('dependency_unavailable','Unknown token key reference.');
  const project=ProjectId(match[1]!);const state=stateSchema.parse(JSON.parse(await readFile(join(this.store.location,project,'state.json'),'utf8')));
  if(state.current===null)throw new DomainError('dependency_unavailable','Token key custody has not been initialized.');
  return this.store.resolveBytes(ref(project+'/v'+state.current));
 }
 private async save(project:string,state:State){const path=join(this.store.location,project,'state.json');const temp=path+'.'+randomUUID();const f=await open(temp,'wx',0o600);try{await f.writeFile(JSON.stringify(state));await f.sync();}finally{await f.close();}await rename(temp,path);const dir=await open(join(path,'..'),'r');try{await dir.sync();}finally{await dir.close();}}
 async invoke(operation:CustodyOperation,projectInput:string,payload:unknown):Promise<Result<unknown>>{
  const project=ProjectId(projectInput);const parsed=custodyOperations[operation].request.safeParse(payload);if(!parsed.success)return err(new DomainError('validation_failed','Invalid custody request.'));
  const directory=join(this.store.location,project);try{await mkdir(directory,{recursive:true,mode:0o700});}catch{return err(new DomainError('dependency_unavailable',custodyMessages.state));}const lock=join(directory,'lock');
  try{const f=await open(lock,'wx',0o600);await f.writeFile(String(process.pid));await f.close();}catch(error){return (error as {code?:string}).code==='EEXIST'?err(new DomainError('conflict',custodyMessages.busy)):err(new DomainError('dependency_unavailable',custodyMessages.state));}
  let step:keyof typeof custodyMessages='state';
  try{
   let state:State;
   try{state=stateSchema.parse(JSON.parse(await readFile(join(directory,'state.json'),'utf8')));}catch(error){if((error as {code?:string}).code!=='ENOENT')throw error;if((await readdir(directory)).some(name=>name!=='lock'))throw new Error('Custody history is missing.');state={current:null,versions:[],candidates:{}};}
   const save=()=>this.save(project,state);
   // Candidate bytes are separate from retained version names. Only expired,
   // uncommitted candidates are eligible for removal; current/retired keys never are.
   for(const [id,c] of Object.entries(state.candidates))if(c.committed||c.expires<=this.now()){
    await this.store.removeCandidate(project+'/candidate-'+id);await this.escrow.removeCandidate(project+'/candidate-'+id);
    if(!c.committed&&c.kind==='rotate'&&!state.versions.includes(c.version)){await this.store.discardUncommitted(project+'/v'+c.version);await this.escrow.discardUncommitted(project+'/v'+c.version);}
    delete state.candidates[id];
   }
   await save();
   const token=async(port:KeyStore,name:string)=>derive(await port.resolveBytes(ref(name)));
   if(operation==='initialize'){
    const v=state.current??1;const name=project+'/v'+v;step='read';const exists=await this.store.exists(name);const created=state.current===null&&!exists;
    if(state.current===null){
     // Exclusive create and read-before-generate make a failed initialization
     // resumable without replacing a key already written by an earlier attempt.
     if(!exists){if(state.initialSentinel||await this.escrow.exists(name))throw new Error('Recorded key is missing.');step='generate';const bytes=randomBytes(32);try{step='store';await this.store.write(name,bytes.toString('hex'));}finally{bytes.fill(0);}}
     step='read';const expected=await token(this.store,name);
     state.initialSentinel??=expected;if(state.initialSentinel!==expected)throw new Error('Primary integrity mismatch.');step='state';await save();
     step='escrow';if(!await this.escrow.exists(name)){const bytes=await this.store.resolveBytes(ref(name));try{await this.escrow.write(name,Buffer.from(bytes).toString('hex'));}finally{bytes.fill(0);}}
     step='verify';if(await token(this.escrow,name)!==expected)throw new Error('Escrow integrity mismatch.');
     state.current=1;state.versions=[1];step='state';await save();
    }
    step='read';const sentinelToken=await token(this.store,name);step='verify';if(await token(this.escrow,name)!==sentinelToken)throw new Error('Escrow integrity mismatch.');
    return ok({keyVersion:v,sentinelToken,created});
   }
   if(operation==='status')return ok({currentVersion:state.current,versions:await Promise.all(state.versions.map(async keyVersion=>({keyVersion,inStore:await this.store.exists(project+'/v'+keyVersion),inEscrow:await this.escrow.exists(project+'/v'+keyVersion)})))});
   if(operation==='rehearse'){
    const results:unknown[]=[];
    for(const keyVersion of state.versions){const name=project+'/v'+keyVersion;try{
      if(!await this.escrow.exists(name)){results.push({keyVersion,outcome:'failed',category:'escrow_missing'});continue;}
      results.push({keyVersion,outcome:'derived',sentinelToken:await token(this.escrow,name)});
     }catch(error){results.push({keyVersion,outcome:'failed',category:error instanceof DomainError?'malformed':'escrow_unreadable'});}}
    return ok({results});
   }
   if(state.current===null)return err(new DomainError('conflict',custodyMessages.conflict));
   if(operation.endsWith('/prepare')){
    const kind=operation==='rotate/prepare'?'rotate':'restore';
    const body=parsed.data;
    if(kind==='rotate'&&(!('expectedCurrentVersion'in body)||body.expectedCurrentVersion!==state.current))return err(new DomainError('conflict',custodyMessages.conflict));
    const v=kind==='rotate'?Math.max(...state.versions)+1:('keyVersion'in body?body.keyVersion:0);
    if(kind==='restore'&&!state.versions.includes(v))return err(new DomainError('conflict',custodyMessages.conflict));
    // Only one pending mutation per project prevents competing candidates for vN.
    if(Object.values(state.candidates).some(c=>!c.committed))return err(new DomainError('conflict',custodyMessages.busy));
    const id=randomUUID(),name=project+'/candidate-'+id;
    step=kind==='rotate'?'generate':'verify';
    const bytes=kind==='rotate'?randomBytes(32):await this.escrow.resolveBytes(ref(project+'/v'+v));
    try{
     const sentinelToken=derive(Uint8Array.from(bytes));
     state.candidates[id]={kind,version:v,expected:state.current,expires:this.now()+600000,sentinel:sentinelToken,committed:false};step='state';await save();
     step='store';await this.store.write(name,Buffer.from(bytes).toString('hex'));
     step='escrow';await this.escrow.write(name,Buffer.from(bytes).toString('hex'));
     step='verify';if(await token(this.escrow,name)!==sentinelToken||await token(this.store,name)!==sentinelToken)throw new Error('Candidate verification failed.');
     return ok({candidateId:id,keyVersion:v,sentinelToken});
    }finally{bytes.fill(0);}
   }
   const id='candidateId'in parsed.data?parsed.data.candidateId:'';const c=state.candidates[id];
   const kind=operation==='rotate/commit'?'rotate':'restore';
   if(!c||c.committed||c.kind!==kind||c.expires<=this.now()||c.expected!==state.current)return err(new DomainError('conflict',custodyMessages.conflict));
   const name=project+'/candidate-'+id;step='verify';
   const bytes=await this.store.resolveBytes(ref(name));
   try{
    if(derive(Uint8Array.from(bytes))!==c.sentinel||await token(this.escrow,name)!==c.sentinel)throw new Error('Candidate changed.');
    const target=project+'/v'+c.version;
    step=kind==='restore'?'restore':'store';
    if(kind==='restore')await this.store.write(target,Buffer.from(bytes).toString('hex'),true);
    else{
     for(const port of [this.store,this.escrow]){step=port===this.store?'store':'escrow';if(!await port.exists(target))await port.write(target,Buffer.from(bytes).toString('hex'));else if(await token(port,target)!==c.sentinel)throw new Error('Version integrity mismatch.');}
     state.current=c.version;if(!state.versions.includes(c.version))state.versions.push(c.version);
    }
    c.committed=true;step='state';await save();
    await this.store.removeCandidate(name);await this.escrow.removeCandidate(name);
    return ok({keyVersion:c.version,sentinelToken:c.sentinel});
   }finally{bytes.fill(0);}
  }catch{return err(new DomainError('dependency_unavailable',custodyMessages[step],undefined,true));}
  finally{await unlink(lock);}
 }
}
