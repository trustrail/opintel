import {z} from 'zod';
export const engineTransportPaths=['/health','/execute','/validate','/preview-rows','/schemas','/test-connection','/introspect','/sample','/estimate','/egress/register','/engine-heartbeat','/landing-receipt','/arrival-notice','/reconciliation-report','/custody/attest','/custody/initialize','/custody/rotate/prepare','/custody/restore/prepare','/custody/rotate/commit','/custody/restore/commit','/custody/rehearse','/custody/status','/other'] as const;
export const engineTransportSampleWindow=1024;
export const EngineTransportLatency=z.object({since:z.iso.datetime(),sampleWindow:z.literal(engineTransportSampleWindow),paths:z.array(z.object({path:z.enum(engineTransportPaths),count:z.number().int().positive(),failed:z.number().int().nonnegative(),p50Ms:z.number().nonnegative(),p95Ms:z.number().nonnegative(),lastMs:z.number().nonnegative(),lastAt:z.iso.datetime()}))});
export type EngineTransportLatency=z.infer<typeof EngineTransportLatency>;
