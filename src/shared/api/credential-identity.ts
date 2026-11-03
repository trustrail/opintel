import {z} from 'zod';
import {CertificateAssociation} from './certificate-association.js';
export const CredentialKind=z.enum(['identity-bound','bearer-only']);
export type CredentialKind=z.infer<typeof CredentialKind>;
/** Labels describe a device; only the TLS-proven fingerprint is identity. */
export const EnrollmentProof=z.strictObject({id:z.uuid(),nonce:z.string().regex(/^[A-Za-z0-9_-]{43}$/u)});
export const EnrollmentChallenge=z.strictObject({id:z.uuid(),locator:z.string().min(1).max(4096),expiresAt:z.iso.datetime()});
export const IdentityEnrollment=CertificateAssociation.extend({proof:EnrollmentProof.optional()});
export type IdentityEnrollment=z.infer<typeof IdentityEnrollment>;
export const CredentialIdentity=z.object({kind:CredentialKind,status:z.enum(['unbound','pending','bound','reset']),fingerprint:z.string().regex(/^[0-9a-f]{64}$/u).nullable(),subject:z.string().nullable(),deviceName:z.string().nullable(),certificateId:z.number().int().positive().nullable(),boundAt:z.iso.datetime().nullable()});
export const ChangeIdentityBinding=z.strictObject({projectId:z.uuid(),action:z.enum(['approve','reset']),confirmation:z.string().min(1)});
export async function changeIdentityBinding(pool:string,credential:string,body:z.input<typeof ChangeIdentityBinding>){const {createApiClient}=await import('./client.js');return createApiClient().request({path:`/api/v1/pools/${pool}/credentials/${credential}/identity`,method:'POST',body,response:z.object({changed:z.literal(true)})});}
