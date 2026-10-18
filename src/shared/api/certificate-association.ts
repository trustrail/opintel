import {z} from 'zod';

export const publicAssociationOnly='Only public certificate association metadata is accepted. Never submit a private key, transport key, PEM block or PKCS#8 material.';
// Opintel must not accept private/transport keys: holding either agent bundle
// would let it fetch the agent's K1 and collapse the two-party custody boundary.
// Opaque identifiers are never decoded, trimmed, normalized or derived.
export function resemblesKeyMaterial(value:string):boolean {
 return /-----\s*(?:BEGIN|END)\b|PKCS\s*#?\s*8|(?:private|transport)[_\s-]*key/iu.test(value)
  || /^[A-Za-z0-9+/_-]{43,}={0,2}$/u.test(value);
}
export const publicAssociationText=z.string().min(1).refine(value=>!resemblesKeyMaterial(value),publicAssociationOnly);
export const CertificateAssociation=z.strictObject({
 certificateId:z.number().int().positive().max(2147483647),
 deviceName:publicAssociationText.refine(value=>[...value].length<=48,'Device name must contain 1 to 48 characters.'),
 recipientIdentifier:publicAssociationText,
},{error:publicAssociationOnly});
export type CertificateAssociation=z.infer<typeof CertificateAssociation>;
export const IdentityKind=z.enum(['certificate']);

export function matchesObservedRecipient(association:CertificateAssociation):boolean {
 const prefix=association.deviceName+'_crt_'+association.certificateId+'@';
 return association.recipientIdentifier.startsWith(prefix)
  && /^[0-9]+\.trusted\.local$/u.test(association.recipientIdentifier.slice(prefix.length));
}
