import { DomainError, err, ok, type Result, type ProjectId } from '../../../shared/kernel/index.js';

export type PartyId = string & { readonly __brand: 'PartyId' };
export type FilingPartyRuleId = string & { readonly __brand: 'FilingPartyRuleId' };
export type FilingParty = { id: PartyId; projectId: ProjectId; code: string; name: string; active: boolean; decimalSeparator?: string | null; dateFormat?: string | null };
export type FilingPartyRule = {
  id: FilingPartyRuleId; partyId: PartyId; projectId: ProjectId;
  matchKind: 'filename_regex' | 'folder'; pattern: string;
  periodAsAtFormat?: import('./landing.js').PeriodAsAtFormat | null;
  sheet?: string | null; sheetIndex?: number | null; headerRow?: number; verifyColumn?: string | null; verifyValue?: string | null;
  kind: string | null; periodGroup: string | null; priority: number; active: boolean;
};
export type Identification = { partyId: PartyId; ruleId: FilingPartyRuleId; period: string; kind: string };

// Only an unambiguous numeric month is normalised. Never Date.parse, locale,
// host timezone, a guessed epoch unit, or reinterpretation of customer labels.
export function normalizePeriod(label: string): string {
  const month = /^(\d{4})[-/](0?[1-9]|1[0-2])$/.exec(label);
  return month ? `${month[1]}-${month[2]?.padStart(2, '0')}` : label;
}

export function identifyFile(projectId: ProjectId, filename: string, folder: string, filingParties: readonly FilingParty[], rules: readonly FilingPartyRule[]): Result<Identification> {
  const matches: Array<{ rule: FilingPartyRule; period: string | undefined }> = [];
  for (const rule of rules) {
    if (!rule.active || rule.projectId !== projectId || !filingParties.some((filingParty) => filingParty.id === rule.partyId && filingParty.projectId === projectId && filingParty.active)) continue;
    let match: RegExpExecArray | null = null;
    try {
      if (rule.matchKind === 'filename_regex') match = new RegExp(rule.pattern, 'u').exec(filename);
    } catch { return err(new DomainError('validation_failed', 'Invalid identification rule.', { ruleIds: [rule.id] })); }
    if (rule.matchKind === 'folder' ? folder === rule.pattern : match !== null) {
      matches.push({ rule, period: rule.periodGroup === null ? undefined : match?.groups?.[rule.periodGroup] });
    }
  }
  if (matches.length !== 1) return err(new DomainError('validation_failed', matches.length === 0 ? 'No filing party rule matched.' : 'Multiple filing party rules matched.', { ruleIds: matches.map(({ rule }) => rule.id) }));
  const selected = matches[0]!;
  if (!selected.period || selected.rule.kind === null || selected.rule.kind.length === 0) return err(new DomainError('validation_failed', 'The matching rule did not supply a period and kind.', { ruleIds: [selected.rule.id] }));
  return ok({ partyId: selected.rule.partyId, ruleId: selected.rule.id, period: normalizePeriod(selected.period), kind: selected.rule.kind });
}
