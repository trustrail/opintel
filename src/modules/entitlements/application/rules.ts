import { z } from 'zod';
import { DomainError, err, ok, type Result, type RuleId, type ProjectId, type Timestamp, type ElementId } from '../../../shared/kernel/index.js';
import { validateTokenDeclarations, validateTokenizedTemporal, type ExposedType, type TemporalDeclarations } from '../../catalog/index.js';
import { treatments, maskKinds } from '../domain/entitlement.js';
import { validateMaskType } from './mask-compatibility.js';
import { validateCanonicaliserType } from './canonicalisers.js';

export const patternRuleInput = z.object({
  matcher: z.string().min(1), matchKind: z.enum(['name_glob','type','schema']), treatment: z.enum(treatments),
  priority: z.number().int().min(-2147483648).max(2147483647).default(100), active: z.boolean().default(true),
  maskKind: z.enum(maskKinds).nullable().default(null),
}).strict().refine(rule => (rule.treatment === 'masked') === (rule.maskKind !== null), {
  message: 'Choose a mask kind exactly when the rule treatment is masked.', path: ['maskKind'],
});
export type PatternRule = Readonly<z.infer<typeof patternRuleInput> & { id: RuleId; projectId: ProjectId; createdAt: Timestamp }>;
export type RuleElement = Readonly<{
  id: ElementId; exposedName: string | null; exposedType: ExposedType | null; exposedSchema: string;
  tokenDomain: string | null; caseInsensitive: boolean | null; canonId: string | null;
} & TemporalDeclarations>;

/** Literal glob matching, not regex: * and ? are the only metacharacters. */
function glob(pattern: string, value: string): boolean {
  const p = Array.from(pattern.toLowerCase()), v = Array.from(value.toLowerCase());
  let i=0, j=0, star=-1, retry=0;
  while (j<v.length) {
    if (p[i]==='?' || p[i]===v[j]) { i++; j++; }
    else if (p[i]==='*') { star=i++; retry=j; }
    else if (star>=0) { i=star+1; j=++retry; }
    else return false;
  }
  while (p[i]==='*') i++;
  return i===p.length;
}
export function matchesPatternRule(rule: PatternRule, element: RuleElement): boolean {
  if (!rule.active) return false;
  switch (rule.matchKind) {
    case 'name_glob': return element.exposedName !== null && glob(rule.matcher, element.exposedName);
    case 'type': return rule.matcher === element.exposedType;
    case 'schema': return rule.matcher === element.exposedSchema;
  }
}

/** Receives only rules older than discovery, selected by the repository using
 * PostgreSQL timestamp precision. Existing decisions are checked before this. */
export function selectPatternRule(rules: readonly PatternRule[], element: RuleElement): Result<PatternRule | null> {
  const matches = rules.filter(rule => matchesPatternRule(rule, element));
  const priorities = new Map<number, PatternRule[]>();
  for (const rule of matches) priorities.set(rule.priority, [...(priorities.get(rule.priority) ?? []), rule]);
  const tied = [...priorities.values()].filter(group => group.length > 1).flat().sort((a,b)=>a.id.localeCompare(b.id));
  if (tied.length) return err(new DomainError('conflict', `Rules ${tied.map(r=>`${r.id} (${r.matcher})`).join(', ')} match element ${element.exposedName ?? element.id} (${element.id}) at equal priority. No entitlement was created.`, { ruleIds: tied.map(r=>r.id) }));
  return ok(matches.sort((a,b)=>b.priority-a.priority)[0] ?? null);
}

export function validateRuleTreatment(rule: PatternRule, element: RuleElement): Result<void> {
  const problems: string[] = [];
  if (element.exposedType === null || element.exposedName === null) problems.push('The element has no supported exposed type or name.');
  if (rule.maskKind !== null) {
    const valid = validateMaskType(rule.maskKind, element.exposedType);
    if (!valid.ok) problems.push(`Mask ${rule.maskKind} does not suit ${element.exposedType ?? 'unsupported type'}. ${valid.error.message}`);
  }
  if (rule.treatment === 'tokenized') {
    const declarations = validateTokenDeclarations(element.exposedType, element, true);
    if (!declarations.ok) problems.push(declarations.error.message);
    const temporal = validateTokenizedTemporal(element.exposedType, element);
    if (!temporal.ok) problems.push(temporal.error.message);
    if (element.canonId === 'stdtime1' && element.exposedType !== null && ['TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT'].includes(element.exposedType) && element.epochUnit === null) {
      problems.push('Declare epochUnit for the integer timestamp before tokenization.');
    } else if (element.canonId !== null) {
      const canon = validateCanonicaliserType(element.canonId, element.exposedType, element.epochUnit);
      if (!canon.ok) problems.push(canon.error.message);
    }
    const type = element.exposedType;
    if (type !== null && !['VARCHAR','UUID','DATE','TIMESTAMP','TIMESTAMPTZ','TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT'].includes(type) && !type.startsWith('DECIMAL(')) problems.push(`Type ${type} cannot be tokenized; cast it to a supported type upstream.`);
  }
  return problems.length ? err(new DomainError('validation_failed', `Rule ${rule.id} (${rule.matcher}) cannot apply to element ${element.exposedName ?? element.id} (${element.id}): ${problems.join(' ')}`)) : ok(undefined);
}
