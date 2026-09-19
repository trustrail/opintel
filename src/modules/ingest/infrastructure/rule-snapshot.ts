import { z } from 'zod';
import { ProjectId, type UserId } from '../../../shared/kernel/index.js';
import type { PartyId, FilingPartyRuleId } from '../domain/identify.js';

const project = z.uuid().transform(ProjectId);
export const identificationRulesSchema = z.strictObject({
  filingParties: z.array(z.strictObject({ id: z.uuid().transform((id) => id as PartyId), projectId: project, code: z.string().min(1), name: z.string().min(1), active: z.boolean(), decimalSeparator: z.string().nullable().optional(), dateFormat: z.string().nullable().optional() })),
  rules: z.array(z.strictObject({
    id: z.uuid().transform((id) => id as FilingPartyRuleId), partyId: z.uuid().transform((id) => id as PartyId), projectId: project,
    matchKind: z.enum(['filename_regex', 'folder']), pattern: z.string().min(1), kind: z.string().min(1).nullable(),
    sheet: z.string().nullable().optional(), sheetIndex: z.number().int().nullable().optional(), headerRow: z.number().int().optional(),
    verifyColumn: z.string().nullable().optional(), verifyValue: z.string().nullable().optional(),
    periodAsAtFormat: z.enum(['month_end', 'month_start', 'quarter_end', 'exact_date']).nullable().optional(),
    periodGroup: z.string().min(1).nullable(), priority: z.number().int(), active: z.boolean(),
  })),
});

// Deployment exports metadata through the tenant scope. The sidecar reads a
// provisioned snapshot locally; no customer file travels to this application.
export async function readIdentificationRules(context: { projectId: ProjectId; userId: UserId }) {
  const { withTenant } = await import('../../../platform/db/scope.js');
  return withTenant(context, async (tx) => identificationRulesSchema.parse({
    filingParties: await tx.query('SELECT id, project_id AS "projectId", code, name, active, decimal_separator AS "decimalSeparator", date_format AS "dateFormat" FROM filing_party ORDER BY id'),
    rules: await tx.query(`SELECT id, party_id AS "partyId", project_id AS "projectId", match_kind AS "matchKind", pattern, kind,
      period_as_at_format AS "periodAsAtFormat", period_group AS "periodGroup", priority, active, sheet, sheet_index AS "sheetIndex", header_row AS "headerRow", verify_column AS "verifyColumn", verify_value AS "verifyValue" FROM filing_party_rule ORDER BY id`),
  }));
}
