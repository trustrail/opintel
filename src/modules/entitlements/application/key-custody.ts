import type { z } from 'zod';
import type { CustodyOperation, CustodyResponse, custodyOperations, TokenKeyView } from '../../../shared/custody-contract.js';
import { DomainError, err, ok, type Result, type ProjectId, type UserId, type CompanyId } from '../../../shared/kernel/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
export type CustodyContext={projectId:ProjectId;userId:UserId};
export interface CustodyPort {call<K extends CustodyOperation>(project:ProjectId,operation:K,payload:z.input<(typeof custodyOperations)[K]['request']>):Promise<Result<CustodyResponse<K>>>;}
export type KeyRecord={version:number;sentinel:string;state:'current'|'retired';verified:boolean};
export type KeyIntent={id:string;kind:'initialize'|'rotate'|'restore';version:number;sentinel:string;candidateId:string|null;reason:string|null;actor:UserId};
export interface CustodySession {
 project:{name:string;companyId:CompanyId};
 keys():Promise<KeyRecord[]>;
 pending():Promise<KeyIntent|null>;
 operation(requestKey:string):Promise<KeyIntent|null>;
 intent(value:Omit<KeyIntent,'id'>,requestKey?:string):Promise<KeyIntent>;
 replaceCandidate(value:KeyIntent):Promise<void>;
 finish(value:KeyIntent):Promise<void>;
 rehearsal(version:number,outcome:'ok'|'failed'|'mismatch'):Promise<void>;
 view():Promise<TokenKeyView>;
}
export interface CustodyRepository {
 exclusive<T>(ctx:CustodyContext,work:(session:CustodySession)=>Promise<Result<T>>):Promise<Result<T>>;
 due():Promise<CustodyContext[]>;
}
export class KeyCustodyService {
 constructor(private readonly repository:CustodyRepository,private readonly port:CustodyPort,private readonly authorization:Pick<AuthorizationPort,'checkMany'>){}
 private async rehearse(ctx:CustodyContext,session:CustodySession):Promise<Result<void>>{
  const keys=await session.keys();const response=await this.port.call(ctx.projectId,'rehearse',{});let failed=false;
  for(const key of keys){const matches=response.ok?response.value.results.filter(result=>result.keyVersion===key.version):[];
   const result=matches.length===1?matches[0]:undefined;
   const outcome=!result||result.outcome==='failed'?'failed':result.sentinelToken===key.sentinel?'ok':'mismatch';
   await session.rehearsal(key.version,outcome);failed ||= outcome!=='ok';
  }
  return failed?err(new DomainError('dependency_unavailable','Token key escrow rehearsal failed. Review the affected versions in Observations before connecting a source.')):ok(undefined);
 }
 private async recover(ctx:CustodyContext,s:CustodySession):Promise<Result<void>>{
  const pending=await s.pending();if(!pending)return ok(undefined);
  const status=await this.port.call(ctx.projectId,'status',{});if(!status.ok)return status;
  // A lost commit response is resolved from a fresh rehearsal/status, using the
  // sentinel durably recorded BEFORE commit, never trusting a new replacement.
  const rehearsal=await this.port.call(ctx.projectId,'rehearse',{});if(!rehearsal.ok)return rehearsal;
  const found=rehearsal.value.results.find(r=>r.keyVersion===pending.version);
  const alreadyCommitted=pending.kind==='restore'?false:status.value.currentVersion===pending.version;
  if(alreadyCommitted&&found?.outcome==='derived'&&found.sentinelToken===pending.sentinel){await s.finish(pending);return this.rehearse(ctx,s);}
  if(!pending.candidateId)return err(new DomainError('dependency_unavailable','Token key initialization metadata could not be reconciled. Retry initialization.'));
  let committed=await this.port.call(ctx.projectId,pending.kind==='restore'?'restore/commit':'rotate/commit',{candidateId:pending.candidateId});
  if(!committed.ok&&committed.error.code==='conflict'){
   const prepared=pending.kind==='restore'?await this.port.call(ctx.projectId,'restore/prepare',{keyVersion:pending.version}):await this.port.call(ctx.projectId,'rotate/prepare',{expectedCurrentVersion:status.value.currentVersion!});
   if(!prepared.ok)return prepared;
   if(prepared.value.keyVersion!==pending.version||(pending.kind==='restore'&&prepared.value.sentinelToken!==pending.sentinel))return err(new DomainError('conflict','The recovery candidate differs from the recorded key version.'));
   pending.candidateId=prepared.value.candidateId;pending.sentinel=prepared.value.sentinelToken;await s.replaceCandidate(pending);
   committed=await this.port.call(ctx.projectId,pending.kind==='restore'?'restore/commit':'rotate/commit',{candidateId:pending.candidateId});
  }
  if(!committed.ok)return committed;
  if(committed.value.keyVersion!==pending.version||committed.value.sentinelToken!==pending.sentinel)return err(new DomainError('conflict','The committed custody version does not match its prepared sentinel.'));
  await s.finish(pending);return this.rehearse(ctx,s);
 }
 async execute(ctx:CustodyContext,action:'status'|'initialize'|'rotate'|'restore'|'rehearse',input:{confirmation?:string;reason?:string;keyVersion?:number;requestKey?:string}={}):Promise<Result<TokenKeyView>>{
  return this.repository.exclusive(ctx,async s=>{
   if(action==='rotate'||action==='restore'){
    if(input.confirmation!==s.project.name)return err(new DomainError('validation_failed','Type the project name exactly to confirm the token key operation.'));
    if(action==='restore'){
     const checks=await this.authorization.checkMany([{resource:{type:'project',id:ctx.projectId},permission:'administer',subject:{type:'user',id:ctx.userId}},{resource:{type:'company',id:s.project.companyId},permission:'administer',subject:{type:'user',id:ctx.userId}}]);
     if(checks.length!==2||checks.some(c=>!c.allowed))return err(new DomainError('forbidden','You must administer both the project and its company to restore a token key.'));
    }
   }
   if(action==='status')return ok(await s.view());
   if(input.requestKey){const prior=await s.operation(input.requestKey);if(prior){if(prior.kind!==action||prior.reason!==(input.reason??null))return err(new DomainError('conflict','This Idempotency-Key was used for a different custody request.'));const recovered=await this.recover(ctx,s);return recovered.ok?ok(await s.view()):recovered;}}
   const hadPending=await s.pending();const recovered=await this.recover(ctx,s);if(!recovered.ok)return recovered;
   if(hadPending&&hadPending.kind===action)return ok(await s.view());
   if(action==='rehearse'){await this.rehearse(ctx,s);return ok(await s.view());}
   if(action==='initialize'){
    const initialized=await this.port.call(ctx.projectId,'initialize',{});if(!initialized.ok)return initialized;
    const existing=(await s.keys()).find(k=>k.version===initialized.value.keyVersion);
    if(existing&&existing.sentinel!==initialized.value.sentinelToken)return err(new DomainError('conflict','The primary token key differs from the recorded sentinel. Restore the recorded key before connecting a source.'));
    if(!existing){if((await s.keys()).length)return err(new DomainError('conflict','The custody current version has no recorded operation. Reconcile custody before connecting a source.'));
     const intent=await s.intent({kind:'initialize',version:initialized.value.keyVersion,sentinel:initialized.value.sentinelToken,candidateId:null,actor:ctx.userId,reason:null});await s.finish(intent);}
    const checked=await this.rehearse(ctx,s);return checked.ok?ok(await s.view()):checked;
   }
   const keys=await s.keys();const current=keys.find(k=>k.state==='current');if(!current)return err(new DomainError('conflict','Initialize token key custody before rotating or restoring.'));
   const prepared=action==='rotate'?await this.port.call(ctx.projectId,'rotate/prepare',{expectedCurrentVersion:current.version}):await this.port.call(ctx.projectId,'restore/prepare',{keyVersion:input.keyVersion!});
   if(!prepared.ok)return prepared;
   if(action==='restore'&&keys.find(k=>k.version===prepared.value.keyVersion)?.sentinel!==prepared.value.sentinelToken){await s.rehearsal(prepared.value.keyVersion,'mismatch');return err(new DomainError('conflict','The escrow sentinel does not match the recorded key version. The key was not restored.'));}
   await s.intent({kind:action,version:prepared.value.keyVersion,sentinel:prepared.value.sentinelToken,candidateId:prepared.value.candidateId,actor:ctx.userId,reason:input.reason??null},input.requestKey);
   const committed=await this.recover(ctx,s);return committed.ok?ok(await s.view()):committed;
  });
 }
 async ensure(ctx:CustodyContext):Promise<Result<void>>{const result=await this.execute(ctx,'initialize');return result.ok?ok(undefined):result;}
 async daily(){for(const ctx of await this.repository.due())await this.execute(ctx,'rehearse');}
}
