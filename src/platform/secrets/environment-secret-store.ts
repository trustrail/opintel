import { decodeSecretBytes } from './bytes.js';
import { DomainError } from '../../shared/kernel/index.js';
import type { SecretStorePort, SecretRef as SecretRefType } from './types.js';

type Environment = Readonly<Record<string, string | undefined>>;

function environmentVariableFor(ref: SecretRefType): string {
  const path = ref.slice('secret://'.length);
  return `OPINTEL_SECRET_${path.toUpperCase().replace(/[^A-Z0-9]/gu, '_')}`;
}

export class EnvironmentSecretStore implements SecretStorePort {
  constructor(private readonly environment: Environment = process.env) {}

  async resolve(ref: SecretRefType): Promise<string> {
    const secret = this.environment[environmentVariableFor(ref)];
    if (secret === undefined) {
      throw new DomainError('dependency_unavailable', `Secret ${ref} is not configured.`, undefined, true);
    }
    return secret;
  }

  async resolveBytes(ref: SecretRefType): Promise<Uint8Array> {
    return decodeSecretBytes(ref, await this.resolve(ref));
  }

  async store(path: string, _secret: string): Promise<SecretRefType> {
    throw new DomainError('dependency_unavailable', `Secret storage is unavailable for secret://${path}.`, undefined, false);
  }
}

export { environmentVariableFor };
