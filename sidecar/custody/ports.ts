import type { VaultPort } from '../../src/platform/vault/index.js';
/** Separate configured custody locations. Only the sidecar receives key material. */
export interface KeyStore extends VaultPort {
 readonly location:string;
 write(name:string,hex:string,replace?:boolean):Promise<void>;
 exists(name:string):Promise<boolean>;
 discardUncommitted(name:string):Promise<void>;
 removeCandidate(name:string):Promise<void>;
}
export interface KeyEscrow extends KeyStore {}
