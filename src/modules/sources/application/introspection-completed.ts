import type { ProjectId, RunId, SourceId } from '../../../shared/kernel/index.js';
import type { IntrospectionContext } from './introspection-store.js';

/** runId is the stable event identity; payload carries identifiers only. */
export type IntrospectionCompleted = Readonly<{ type: 'IntrospectionCompleted'; runId: RunId; projectId: ProjectId; sourceId: SourceId }>;
export interface IntrospectionCompletedHandler {
  handle(ctx: IntrospectionContext, event: IntrospectionCompleted): Promise<void>;
}
