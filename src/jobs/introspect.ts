import { UuidV7IdFactory } from '../shared/kernel/index.js';
import { IntrospectionJob, PostgresIntrospectionStore, type IntrospectionSource } from '../modules/sources/index.js';
import type { SourceConnector } from '../modules/sources/index.js';
import type { AuthorizationPort } from '../modules/authz/index.js';
import type { RunId } from '../shared/kernel/index.js';

/** Host entry point: run queued IDs using its request-scoped sidecar connector. */
export function createIntrospectionJob(connector: (source: IntrospectionSource,runId: RunId) => SourceConnector, authorization?: AuthorizationPort) {
  return new IntrospectionJob(new PostgresIntrospectionStore(new UuidV7IdFactory()),connector,
    (runId,state) => console.info({event:'introspection.state',runId,state}), authorization);
}
