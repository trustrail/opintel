export type CellValue = { text: string; kind: 'text' | 'number' | 'boolean' | 'date' } | null;
export type SheetRow = { number: number; cells: CellValue[] };
export type Merge = { firstRow: number; lastRow: number; firstColumn: number; lastColumn: number };
export type ExtractedColumn = { name: string; header: string | null; type: 'TEXT' | 'NUMERIC' | 'BOOLEAN' | 'DATE' };
export type ExtractionSummary = { sheet: string; sheetIndex: number; headerRow: number; rowCount: number; columns: ExtractedColumn[] };
