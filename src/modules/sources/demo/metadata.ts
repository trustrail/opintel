import { createHash } from 'node:crypto';
import { identificationRulesSchema } from '../../ingest/index.js';
import type { ProjectId, SourceId } from '../../../shared/kernel/index.js';
import type { GeneratorSpec } from '../../../shared/demo-contract.js';

function stableId(value: string): string {
  const hex = createHash('sha256').update(value).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function demoIdentification(projectId: ProjectId, sourceId: SourceId, generator: GeneratorSpec) {
  const files = generator.files ?? [];
  const parties = [...new Map(files.map((file) => [file.party,file])).values()];
  return identificationRulesSchema.parse({
    filingParties: parties.map((file) => ({ id: stableId(`${sourceId}:party:${file.party}`), projectId, code: file.party, name: file.party, active: true, decimalSeparator: file.decimalSeparator, dateFormat: file.dateFormat })),
    rules: files.map((file) => ({ id: stableId(`${sourceId}:rule:${file.id}`), projectId, partyId: stableId(`${sourceId}:party:${file.party}`), active: true,
      matchKind: 'filename_regex', pattern: `^${file.id}_(?<period>${file.period})\\.xlsx$`, kind: file.kind, periodGroup: 'period', priority: 1,
      sheet: file.sheetName, sheetIndex: null, headerRow: file.headerRow, periodAsAtFormat: 'month_end',
    })),
  });
}
