import type { Result } from '../../../shared/kernel/index.js';
import type { VaultRef } from '../../../platform/vault/types.js';
import type { ProvisionDemoPayload, ProvisionDemoResponse } from '../../../shared/demo-contract.js';
export interface DemoProvisioningPort {
  provisionDemo(ref: VaultRef, payload: ProvisionDemoPayload, signal?: AbortSignal): Promise<Result<ProvisionDemoResponse>>;
}
