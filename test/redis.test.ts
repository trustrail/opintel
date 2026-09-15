import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createRedisConnection,
  redisKeyPrefix,
  type RedisConnection,
  type RedisKey,
} from '../src/platform/redis/index.js';

const redisUrl = process.env.REDIS_URL;
const redisTestsRequired = process.env.REQUIRE_DB_TESTS === '1';
const redisDescribe = redisUrl === undefined && !redisTestsRequired ? describe.skip : describe;
const connections: RedisConnection[] = [];

function redisConnection(): RedisConnection {
  if (redisUrl === undefined) throw new Error('REDIS_URL is required when REQUIRE_DB_TESTS=1.');
  const connection = createRedisConnection({ url: redisUrl });
  connections.push(connection);
  return connection;
}

async function waitForReady(connection: RedisConnection): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      if (connection.client.isReady && await connection.client.ping() === 'PONG') return;
    } catch {
      // The dropped socket may still have a command in flight; retry after reconnecting.
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Redis client did not reconnect within 5 seconds.');
}

afterEach(async () => {
  await Promise.all(connections.splice(0).map((connection) => connection.close()));
});

describe('Redis key prefix', () => {
  it('preserves the prefix in the key type and value', () => {
    const sessions = redisKeyPrefix('session');
    const key: RedisKey<'session'> = sessions.key('abc123');

    expect(key).toBe('session:abc123');
  });
});

redisDescribe('Redis connection lifecycle', () => {
  beforeEach(() => {
    if (redisUrl === undefined) throw new Error('REDIS_URL is required when REQUIRE_DB_TESTS=1.');
  });

  it('connects against Redis', async () => {
    const connection = redisConnection();

    await connection.connect();

    await expect(connection.client.ping()).resolves.toBe('PONG');
  });

  it('reconnects after its connection is dropped', async () => {
    const connection = redisConnection();
    const administrator = redisConnection();
    await connection.connect();
    await administrator.connect();
    const reconnecting = new Promise<void>((resolve) => connection.client.once('reconnecting', resolve));
    const clientId = await connection.client.clientId();

    await administrator.client.clientKill({ filter: 'ID', id: clientId });
    await reconnecting;
    await waitForReady(connection);
  });

  it('closes cleanly', async () => {
    const connection = redisConnection();
    await connection.connect();

    await connection.close();

    expect(connection.client.isOpen).toBe(false);
    expect(connection.client.isReady).toBe(false);
  });
});
