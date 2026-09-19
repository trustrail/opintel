import { join } from 'node:path';
import { periodAsAt, type FilingParty, type FilingPartyRule } from '../../src/modules/ingest/index.js';
import type { WatchedFiling } from './watch.js';
import type { LandingPort, LandingReceiptPort, LandingSource } from './landing-port.js';
import type { SpreadsheetExtractor } from './extract.js';

export class FilingLander {
  constructor(private readonly directory: string, private readonly source: LandingSource, private readonly writer: LandingPort,
    private readonly extractor: SpreadsheetExtractor, private readonly receipts: LandingReceiptPort) {}
  async process(filing: WatchedFiling, filingParty: FilingParty | undefined, rule: FilingPartyRule | undefined): Promise<WatchedFiling> {
    if (filing.status !== 'ready' || !filing.extraction || filing.landing?.registered) return filing;
    let receipt = filing.landing?.receipt;
    if (!receipt) {
      if (!filingParty || !rule || !filing.period || !filing.kind || !filing.partyId) return { ...filing, status: 'quarantined', reason: 'The original landing attribution is unavailable.' };
      const asAt = periodAsAt(filing.period, rule.periodAsAtFormat ?? null);
      if (!asAt.ok) return { ...filing, status: 'quarantined', reason: asAt.error.message };
      const landed = await this.writer.land({ source: this.source, filingId: filing.id, partyId: filing.partyId, partyCode: filingParty.code,
        kind: filing.kind, period: filing.period, asAt: asAt.value, receivedAt: filing.receivedAt, fileSha256: filing.sha256, supersedes: filing.supersedes,
        columns: filing.extraction.columns }, this.extractor.rows(join(this.directory, filing.path), filing.sha256, filingParty, rule));
      if (!landed.ok) return landed.error.code === 'source_unavailable' || landed.error.code === 'dependency_unavailable'
        ? { ...filing, reason: landed.error.message } : { ...filing, status: 'quarantined', reason: landed.error.message };
      receipt = landed.value;
    }
    // Failure after the database commit never attempts to undo customer rows.
    // If local persistence fails too, the writer replays its atomic commit receipt.
    const registered = await this.receipts.send(receipt);
    return { ...filing, reason: null, landing: { receipt, registered: registered.ok, error: registered.ok ? null : registered.error.message } };
  }
}
