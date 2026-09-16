import { CompanyId, InviteId, Timestamp } from '../../../shared/kernel/index.js';
import { redisKeyPrefix, type RedisClient } from '../../../platform/redis/index.js';
import type { OidcFlowState, OidcFlowStore } from '../application/oidc.js';

const flows = redisKeyPrefix('oidc');
const flowLifetimeMs = 10 * 60 * 1_000;

function parseFlow(raw: string): OidcFlowState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (
      typeof value.codeVerifier !== 'string' || typeof value.nonce !== 'string' ||
      typeof value.provider !== 'string' || typeof value.redirectUri !== 'string' ||
      typeof value.deviceNonce !== 'string' || typeof value.createdAt !== 'string' ||
      (value.companyId !== null && typeof value.companyId !== 'string') ||
      (value.inviteId !== null && typeof value.inviteId !== 'string')
    ) return null;
    return {
      codeVerifier: value.codeVerifier,
      nonce: value.nonce,
      provider: value.provider,
      companyId: value.companyId === null ? null : CompanyId(value.companyId),
      redirectUri: value.redirectUri,
      inviteId: value.inviteId === null ? null : InviteId(value.inviteId),
      deviceNonce: value.deviceNonce,
      createdAt: Timestamp(new Date(value.createdAt)),
    };
  } catch {
    return null;
  }
}

export class RedisOidcFlowStore implements OidcFlowStore {
  constructor(private readonly client: RedisClient) {}

  async save(state: string, flow: OidcFlowState): Promise<void> {
    const saved = await this.client.set(flows.key(state), JSON.stringify(flow), { PX: flowLifetimeMs, NX: true });
    if (saved !== 'OK') throw new Error('Could not persist OIDC flow state.');
  }

  async consume(state: string): Promise<OidcFlowState | null> {
    const raw = await this.client.getDel(flows.key(state));
    return raw === null ? null : parseFlow(raw);
  }
}
