import { createRedisConnection, type RedisClient, type RedisConnection } from '../redis/index.js';
import { changeEventSchema, streamFamilies, type StreamEvent, type ProjectChange } from '../../shared/api/stream.js';
import type { ProjectId } from '../../shared/kernel/index.js';
import type { ProjectStream } from './port.js';

// Sequence assignment and publication are atomic across API/worker instances.
const publishScript = `local n = redis.call('INCR', KEYS[1]); local e = cjson.decode(ARGV[1]); e.sequence = n; redis.call('PUBLISH', KEYS[2], cjson.encode(e)); return n`;
export class RedisProjectHub implements ProjectStream {
 private readonly subscriptions = new Set<() => Promise<void>>();
 constructor(private readonly client: RedisClient, private readonly url: string) {}
 async publish(project: ProjectId, event: ProjectChange): Promise<void> {
  const parsed = changeEventSchema.parse({ ...event, sequence: 0 });
  await this.client.withCommandOptions({ timeout: 2000 }).eval(publishScript, { keys: [`sse:${project}:sequence`, `sse:${project}:events`], arguments: [JSON.stringify(parsed)] });
 }
 async subscribe(project: ProjectId, receive: (event: StreamEvent) => void, disconnected: () => void): Promise<() => Promise<void>> {
  let closed = false;
  let ready = false;
  let sequence = -1;
  const pending: StreamEvent[] = [];
  let connection: RedisConnection;
  const close = async () => {
   if (closed) return;
   closed = true; this.subscriptions.delete(close);
   if (ready) disconnected();
   // Destroy instead of queueing QUIT behind a disconnected Redis socket.
   if (connection.client.isOpen) connection.client.destroy();
  };
  const lost = () => { void close(); };
  connection = createRedisConnection({ url: this.url, onError: lost });
  connection.client.on('reconnecting', lost);
  this.subscriptions.add(close);
  try {
   await connection.connect();
   await connection.client.subscribe(`sse:${project}:events`, message => {
    try {
     const event = changeEventSchema.parse(JSON.parse(message) as unknown);
     if (!ready) { if (pending.length >= 1024) lost(); else pending.push(event); }
     else if (event.sequence > sequence) { sequence = event.sequence; receive(event); }
    } catch { lost(); }
   });
   sequence = Number(await this.client.withCommandOptions({ timeout: 2000 }).get(`sse:${project}:sequence`) ?? 0);
   if (closed) throw new Error('Stream subscription disconnected.');
   receive({ type: 'snapshot', at: new Date().toISOString(), sequence, invalidate: [...streamFamilies] });
   ready = true;
   for (const event of pending) if (event.sequence > sequence) { sequence = event.sequence; receive(event); }
   pending.length = 0;
   return close;
  } catch (error) { await close(); throw error; }
 }
 async close(): Promise<void> { await Promise.all([...this.subscriptions].map(close => close())); }
}
