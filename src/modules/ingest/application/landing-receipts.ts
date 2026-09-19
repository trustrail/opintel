import type { Result } from '../../../shared/kernel/index.js';
import type { LandingReceipt } from '../../../shared/landing-contract.js';
export interface LandingReceiptRepository { accept(receipt: LandingReceipt): Promise<Result<void>> }
export class AcceptLandingReceipt {
  constructor(private readonly repository: LandingReceiptRepository) {}
  execute(receipt: LandingReceipt): Promise<Result<void>> { return this.repository.accept(receipt); }
}
