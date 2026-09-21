import { decodeVaultBytes } from './bytes.js';
import { DomainError } from '../../shared/kernel/index.js';
import type { VaultPort, VaultRef as VaultRefType } from './types.js';

type Environment = Readonly<Record<string, string | undefined>>;

function environmentVariableFor(ref: VaultRefType): string {
  const path = ref.slice('vault://'.length);
  return `OPINTEL_SECRET_${path.toUpperCase().replace(/[^A-Z0-9]/gu, '_')}`;
}

export class DevelopmentVaultAdapter implements VaultPort {
  constructor(private readonly environment: Environment = process.env) {}

  async resolve(ref: VaultRefType): Promise<string> {
    const secret = this.environment[environmentVariableFor(ref)];
    if (secret === undefined) {
      throw new DomainError('dependency_unavailable', `Secret ${ref} is not configured.`, undefined, true);
    }
    return secret;
  }

  async resolveBytes(ref: VaultRefType): Promise<Uint8Array> {
    return decodeVaultBytes(ref, await this.resolve(ref));
  }

  async store(path: string, _secret: string): Promise<VaultRefType> {
    throw new DomainError('dependency_unavailable', `Secret storage is unavailable for vault://${path}.`, undefined, false);
  }
}

export { environmentVariableFor };
