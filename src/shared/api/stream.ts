import { z } from 'zod';
import { SourceId, RunId, FilingId } from '../kernel/value-objects.js';
const identity = { sequence: z.number().int().nonnegative(), sourceId: z.string().uuid().transform(SourceId) };
export const changeEventSchema = z.discriminatedUnion('type', [
 z.object({ ...identity, type: z.literal('introspection.progress'), runId: z.string().uuid().transform(RunId), state: z.enum(['queued','connecting','reading','diffing']), objects: z.number().int().nonnegative(), total: z.number().int().nonnegative().nullable() }).strict(),
 z.object({ ...identity, type: z.literal('introspection.finished'), runId: z.string().uuid().transform(RunId), state: z.enum(['complete','failed','cancelled']) }).strict(),
 z.object({ ...identity, type: z.literal('catalog.changed') }).strict(),
 z.object({ ...identity, type: z.literal('source.changed') }).strict(),
 z.object({ ...identity, type: z.literal('filing.arrived'), filingId: z.string().uuid().transform(FilingId) }).strict(),
]);
export const snapshotEventSchema = z.object({ type: z.literal('snapshot'), at: z.string().datetime(), sequence: z.number().int().nonnegative(), invalidate: z.array(z.string()) }).strict();
export const streamEventSchema = z.union([snapshotEventSchema, changeEventSchema]);
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type ChangeEvent = z.infer<typeof changeEventSchema>;
type WithoutSequence<T> = T extends unknown ? Omit<T, 'sequence'> : never;
export type ProjectChange = WithoutSequence<ChangeEvent>;
export const streamFamilies = ['introspection', 'catalogElement', 'dataSource', 'filing'] as const;
export function streamOpenApiDocument() {
 return { openapi: '3.1.0', info: { title: 'Opintel project stream', version: '1' },
  components: { securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'opintel_session' } } },
  security: [{ sessionCookie: [] }], paths: { '/api/v1/projects/{id}/stream': { get: {
   'x-permission': 'project#view', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
   responses: { '200': { description: 'Snapshot followed by changes. Reconnect never replays.', content: { 'text/event-stream': { schema: z.toJSONSchema(streamEventSchema, { io: 'input' }) } } } },
  } } },
 };
}
