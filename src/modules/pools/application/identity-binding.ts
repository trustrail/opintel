import type {Result,PoolId} from '../../../shared/kernel/index.js';
import type {IdentityEnrollment} from '../../../shared/api/credential-identity.js';
import type {CredentialId} from '../domain/pool.js';
import type {PoolKeyContext} from './keys.js';
export type PresentedIdentity={fingerprint:string;subject:string};
export type IdentityDiagnostic={boundFingerprintPrefix:string|null;challengeState:'escrowed'|'redeemed'|'expired'|'not returned'|null};
export interface CredentialBindings{
 authenticate(ctx:PoolKeyContext,pool:PoolId,credential:CredentialId,certificate:PresentedIdentity|undefined,enrollment:IdentityEnrollment|undefined,diagnostic?:(value:IdentityDiagnostic)=>void):Promise<Result<void>>;
 change(ctx:PoolKeyContext,pool:PoolId,credential:CredentialId,action:'approve'|'reset',confirmation:string):Promise<Result<void>>;
}

/** Existing XQ escrow path; private device redemption stays agent-side. */
export interface EnrollmentEscrow {
 escrowEnrollment(ctx:PoolKeyContext,nonce:Uint8Array,recipient:string,ttlSeconds:number,correlation?:{enrollmentId:string;credentialId:CredentialId}):Promise<string>;
 revokeEnrollment?(ctx:PoolKeyContext,locator:string):Promise<void>;
}
