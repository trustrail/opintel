import { once } from 'node:events';
import { createClient, type RedisClientType } from 'redis';

export type RedisClient = RedisClientType<{}, {}, {}, 3, {}>;

export interface RedisConnection {
  readonly client: RedisClient;
  connect(): Promise<void>;
  close(): Promise<void>;
}

export interface RedisConnectionOptions {
  readonly url: string;
  readonly onError?: (error: Error) => void;
}

function reconnectDelay(attempt: number): number {
  return Math.min(50 * 2 ** attempt, 1_000);
}

export function createRedisConnection(options: RedisConnectionOptions): RedisConnection {
  const client = createClient({
    url: options.url,
    socket: { reconnectStrategy: reconnectDelay },
  });
  client.on('error', (error: Error) => options.onError?.(error));

  return {
    client,
    async connect(): Promise<void> {
      if (client.isReady) return;
      if (client.isOpen) {
        await once(client, 'ready');
        return;
      }
      await client.connect();
    },
    async close(): Promise<void> {
      if (client.isOpen) await client.close();
    },
  };
}
