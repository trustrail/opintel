import type { PoolId, ProjectId } from './value-objects.js';

declare const projectId: ProjectId;
declare const poolId: PoolId;

const acceptsProjectAndPool = (_projectId: ProjectId, _poolId: PoolId): void => undefined;

acceptsProjectAndPool(projectId, poolId);
// @ts-expect-error Branded identifiers cannot be passed in the wrong position.
acceptsProjectAndPool(poolId, projectId);
