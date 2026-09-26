export type { CatalogSnapshot, ObjectRef, SourceConnector, SourceConnectorContext, SourceKind, TopValue } from './application/source-connector.js';
export { SidecarSourceConnector, type SidecarOptions } from './infrastructure/sidecar-source-connector.js';
export { IntrospectionJob } from './application/introspection-job.js';
export { PostgresIntrospectionStore } from './infrastructure/postgres-introspection-store.js';
export type { IntrospectionContext, IntrospectionRun, IntrospectionSource, IntrospectionStore, SourceStatus } from './application/introspection-store.js';
export { runStates, transitions, transitionRun, enforceTransition, type IntrospectionState } from './domain/introspection-run.js';
export { loadSidecarClientOptions } from './infrastructure/sidecar-client-config.js';

export type { DemoProvisioningPort } from './application/demo-provisioning.js';

export type { SourceRef } from './application/source-connector.js';
export type { IntrospectionCompleted, IntrospectionCompletedHandler } from './application/introspection-completed.js';
