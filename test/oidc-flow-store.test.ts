import { afterEach, describe, expect, it } from 'vitest';
import { CompanyId, InviteId, Timestamp } from '../src/shared/kernel/index.js';
import { RedisOidcFlowStore } from '../src/modules/identity/infrastructure/oidc-flow-store.js';
import { createRedisConnection, type RedisConnection } from '../src/platform/redis/index.js';

const redisUrl = process.env.REDIS_URL;
const required = process.env.REQUIRE_DB_TESTS === '1';
const integration = redisUrl === undefined && !required ? describe.skip : describe;
let connection: RedisConnection | undefined;

afterEach(async () => {
  if (connection !== undefined) await connection.close();
  connection = undefined;
});

integration('OIDC Redis flow state', () => {
  it('stores oidc:{state} for ten minutes and consumes it atomically', async () => {
    if (redisUrl === undefined) throw new Error('REDIS_URL is required when REQUIRE_DB_TESTS=1.');
    connection = createRedisConnection({ url: redisUrl });
    await connection.connect();
    const store = new RedisOidcFlowStore(connection.client);
    const state = 'oidc-state-integration-test';
    const flow = {
      codeVerifier: 'a'.repeat(43), nonce: 'nonce', provider: 'google',
      companyId: CompanyId('018f8f9d-7f83-7abc-8def-000000000001'),
      redirectUri: 'https://console.example/auth/callback',
      inviteId: InviteId('018f8f9d-7f83-7abc-8def-000000000002'),
      deviceNonce: 'device-nonce', createdAt: Timestamp(new Date('2026-01-01T00:00:00.000Z')),
    };

    await store.save(state, flow);
    const ttl = await connection.client.pTTL(`oidc:${state}`);
    expect(ttl).toBeGreaterThan(9 * 60 * 1_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1_000);
    await expect(store.consume(state)).resolves.toEqual(flow);
    await expect(store.consume(state)).resolves.toBeNull();
  });
});
