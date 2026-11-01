import JSZip from 'jszip';
import {writeFile} from 'node:fs/promises';
import ExcelJS from 'exceljs';
import type { DemoWorkbookPort, DemoFile, DemoObject } from '../workbook-port.js';
/** ZIP timestamps must not depend on the generator's wall clock. XML stays intact. */
export async function canonicalWorkbook(bytes:Uint8Array|ArrayBuffer){
 const archive=await JSZip.loadAsync(bytes);
 for(const entry of Object.values(archive.files))entry.date=new Date('2026-01-01T00:00:00Z');
 return archive.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6},platform:'DOS'});
}
export class DemoWorkbookWriter implements DemoWorkbookPort {
  async write(path: string, file: DemoFile, object: DemoObject, rows: Array<Array<string | null>>): Promise<void> {
    const workbook = new ExcelJS.Workbook();
    // Stable workbook metadata: retries must deliver byte-identical fixtures.
    workbook.created = new Date('2026-01-01T00:00:00Z'); workbook.modified = workbook.created;
    const sheet = workbook.addWorksheet(file.sheetName);
    for (let row = 1; row < file.headerRow; row += 1) sheet.addRow([`Generated filing ${file.id}`]);
    sheet.addRow(object.columns.map((column) => column.name));
    if (file.mergedHeader && object.columns.length >= 2) sheet.mergeCells(file.headerRow,1,file.headerRow,2);
    for (const row of rows) sheet.addRow(row);
    sheet.addRow([]); sheet.addRow(['End of generated filing']);
    await writeFile(path,await canonicalWorkbook(await workbook.xlsx.writeBuffer()));
  }
}
