import type { Result } from '../../../shared/kernel/index.js';
import type { SecretRef } from '../../../platform/secrets/types.js';
import type { ProvisionDemoPayload, ProvisionDemoResponse } from '../../../shared/demo-contract.js';
export interface DemoProvisioningPort {
  provisionDemo(ref: SecretRef, payload: ProvisionDemoPayload, signal?: AbortSignal): Promise<Result<ProvisionDemoResponse>>;
}
