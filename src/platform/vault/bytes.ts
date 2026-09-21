import { DomainError } from '../../shared/kernel/index.js';
import type { VaultRef } from './types.js';
/** Shared, strict binary-secret decoding; never put the supplied value in errors. */
export function decodeVaultBytes(ref: VaultRef, value: string): Uint8Array {
 if (!/^[0-9a-f]{64}$/u.test(value)) throw new DomainError('dependency_unavailable', `Secret ${ref} must contain exactly 64 lowercase hexadecimal characters.`);
 return Buffer.from(value,'hex');
}
