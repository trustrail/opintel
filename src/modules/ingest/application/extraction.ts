import type { Result } from '../../../shared/kernel/index.js';
import type { FilingParty, FilingPartyRule } from '../domain/identify.js';

import type { SheetRow, Merge, ExtractionSummary } from '../domain/extraction-types.js';
export type { CellValue, SheetRow, Merge, ExtractedColumn, ExtractionSummary } from '../domain/extraction-types.js';
export interface Workbook {
  sheet: string;
  sheetIndex: number;
  merges: readonly Merge[];
  rows(): AsyncIterable<SheetRow>;
  close(): Promise<void>;
}
export interface WorkbookReader {
  open(path: string, selection: { sheet: string | null; sheetIndex: number | null }): Promise<Result<Workbook>>;
}
export interface FileExtractor {
  inspect(path: string, sha256: string, filingParty: FilingParty, rule: FilingPartyRule): Promise<Result<ExtractionSummary>>;
}
