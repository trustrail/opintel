import type { ProjectId } from '../../shared/kernel/index.js';
import type { ProjectChange, StreamEvent } from '../../shared/api/stream.js';
export interface ProjectEvents {
 publish(project: ProjectId, event: ProjectChange): Promise<void>;
}
export interface ProjectStream extends ProjectEvents {
 subscribe(project: ProjectId, receive: (event: StreamEvent) => void, disconnected: () => void): Promise<() => Promise<void>>;
}
// Notifications cannot turn a committed mutation into a failed mutation.
export async function notify(events: ProjectEvents | undefined, project: ProjectId, event: ProjectChange): Promise<void> {
 if (!events) return;
 try { await events.publish(project, event); }
 catch { console.warn({ event: 'sse.publish_failed', projectId: project, category: 'dependency_unavailable' }); }
}
