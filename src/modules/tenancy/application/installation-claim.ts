import {ok,type DomainError,type InstallationClaimId,type Result,type SessionId,type Timestamp,type UserId} from '../../../shared/kernel/index.js';
import type {AuthorizationPort} from '../../authz/index.js';
import type {CreateCompanyInput} from './create-company.js';
import type {RelationshipOutbox} from './relationship-outbox.js';

// Add future claimant kinds here; an email claim never implies domain/group membership.
export type InstallationClaimant={kind:'email';email:string};
export type InstallationClaimInput={claimant:InstallationClaimant;company:CreateCompanyInput};
export type InstallationClaim={id:InstallationClaimId;expiresAt:Timestamp};
export type ClaimLogin={claim:InstallationClaimId;email:string;userId:UserId;tokenId:string;sessionId:SessionId};
export interface InstallationClaimWriter {create(input:InstallationClaimInput):Promise<Result<InstallationClaim,DomainError>>;}
export interface InstallationClaimRepository {
 pendingGrants():Promise<bigint[]>;
 find(email:string):Promise<InstallationClaimId|null>;
 prepare(claim:InstallationClaimId,email:string):Promise<Result<{id:UserId;email:string},DomainError>>;
 redeem(input:ClaimLogin):Promise<Result<{outboxId:bigint},DomainError>>;
}
export class InstallationClaimAdmission {
 constructor(private readonly repository:InstallationClaimRepository,private readonly outbox:RelationshipOutbox,private readonly authorization:AuthorizationPort){}
 async reconcile(){for(const id of await this.repository.pendingGrants())await this.outbox.dispatchOne(this.authorization,id);}
 find(email:string){return this.repository.find(email);}
 prepare(claim:InstallationClaimId,email:string){return this.repository.prepare(claim,email);}
 async redeem(input:ClaimLogin):Promise<Result<void,DomainError>>{
  const result=await this.repository.redeem(input);if(!result.ok)return result;
  try{await this.outbox.dispatchOne(this.authorization,result.value.outboxId);}
  catch{/* Normal login is complete. Access remains fail-closed until the durable outbox delivers the grant. */}
  return ok(undefined);
 }
}
