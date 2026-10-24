import type {DomainError,InstallationClaimId,Result,SessionId,UserId} from '../../../shared/kernel/index.js';
import type {UserAccount} from './magic-link.js';

/** Normal login proves identity; this port only resolves the operator's claim. */
export interface InitialOwnerAdmission {
 find(email:string):Promise<InstallationClaimId|null>;
 prepare(claim:InstallationClaimId,email:string):Promise<Result<UserAccount,DomainError>>;
 redeem(input:{claim:InstallationClaimId;email:string;userId:UserId;tokenId:string;sessionId:SessionId}):Promise<Result<void,DomainError>>;
}
