import { InvariantViolation } from '../../shared/kernel/index.js';

export type VaultRef = string & { readonly __brand: 'VaultRef' };

export function VaultRef(raw: string): VaultRef {
  if (!raw.startsWith('vault://')) throw new InvariantViolation('VaultRef', raw);
  return raw as VaultRef;
}

export interface VaultPort {
  resolve(ref: VaultRef): Promise<string>;
  resolveBytes(ref: VaultRef): Promise<Uint8Array>;
  store(path: string, secret: string): Promise<VaultRef>;
}
