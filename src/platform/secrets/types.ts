import { InvariantViolation } from '../../shared/kernel/index.js';

export type SecretRef = string & { readonly __brand: 'SecretRef' };

export function SecretRef(raw: string): SecretRef {
  if (!raw.startsWith('secret://')) throw new InvariantViolation('SecretRef', raw);
  return raw as SecretRef;
}

export interface SecretStorePort {
  resolve(ref: SecretRef): Promise<string>;
  resolveBytes(ref: SecretRef): Promise<Uint8Array>;
  store(path: string, secret: string): Promise<SecretRef>;
}
