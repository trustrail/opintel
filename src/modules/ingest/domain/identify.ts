import { DomainError, err, ok, type Result, type ProjectId } from '../../../shared/kernel/index.js';

export type CedantId = string & { readonly __brand: 'CedantId' };
export type CedantFileRuleId = string & { readonly __brand: 'CedantFileRuleId' };
export type FilingKind = 'premium' | 'claims' | 'submission';
export type Cedant = { id: CedantId; projectId: ProjectId; code: string; name: string; active: boolean };
export type CedantFileRule = {
  id: CedantFileRuleId; cedantId: CedantId; projectId: ProjectId;
  matchKind: 'filename_regex' | 'folder'; pattern: string;
  kind: FilingKind | null; periodGroup: string | null; priority: number; active: boolean;
};
export type Identification = { cedantId: CedantId; ruleId: CedantFileRuleId; period: string; kind: FilingKind };

// Only an unambiguous numeric month is normalised. Never Date.parse, locale,
// host timezone, a guessed epoch unit, or reinterpretation of customer labels.
export function normalizePeriod(label: string): string {
  const month = /^(\d{4})[-/](0?[1-9]|1[0-2])$/.exec(label);
  return month ? `${month[1]}-${month[2]?.padStart(2, '0')}` : label;
}

export function identifyFile(projectId: ProjectId, filename: string, folder: string, cedants: readonly Cedant[], rules: readonly CedantFileRule[]): Result<Identification> {
  const matches: Array<{ rule: CedantFileRule; period: string | undefined }> = [];
  for (const rule of rules) {
    if (!rule.active || rule.projectId !== projectId || !cedants.some((cedant) => cedant.id === rule.cedantId && cedant.projectId === projectId && cedant.active)) continue;
    let match: RegExpExecArray | null = null;
    try {
      if (rule.matchKind === 'filename_regex') match = new RegExp(rule.pattern, 'u').exec(filename);
    } catch { return err(new DomainError('validation_failed', 'Invalid identification rule.', { ruleIds: [rule.id] })); }
    if (rule.matchKind === 'folder' ? folder === rule.pattern : match !== null) {
      matches.push({ rule, period: rule.periodGroup === null ? undefined : match?.groups?.[rule.periodGroup] });
    }
  }
  if (matches.length !== 1) return err(new DomainError('validation_failed', matches.length === 0 ? 'No cedant rule matched.' : 'Multiple cedant rules matched.', { ruleIds: matches.map(({ rule }) => rule.id) }));
  const selected = matches[0]!;
  if (!selected.period || selected.rule.kind === null) return err(new DomainError('validation_failed', 'The matching rule did not supply a period and kind.', { ruleIds: [selected.rule.id] }));
  return ok({ cedantId: selected.rule.cedantId, ruleId: selected.rule.id, period: normalizePeriod(selected.period), kind: selected.rule.kind });
}
