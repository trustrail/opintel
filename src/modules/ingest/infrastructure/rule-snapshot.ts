import { z } from 'zod';
import { ProjectId, type UserId } from '../../../shared/kernel/index.js';
import type { CedantId, CedantFileRuleId } from '../domain/identify.js';

const project = z.uuid().transform(ProjectId);
export const identificationRulesSchema = z.strictObject({
  cedants: z.array(z.strictObject({ id: z.uuid().transform((id) => id as CedantId), projectId: project, code: z.string().min(1), name: z.string().min(1), active: z.boolean() })),
  rules: z.array(z.strictObject({
    id: z.uuid().transform((id) => id as CedantFileRuleId), cedantId: z.uuid().transform((id) => id as CedantId), projectId: project,
    matchKind: z.enum(['filename_regex', 'folder']), pattern: z.string().min(1), kind: z.enum(['premium', 'claims', 'submission']).nullable(),
    periodGroup: z.string().min(1).nullable(), priority: z.number().int(), active: z.boolean(),
  })),
});

// Deployment exports metadata through the tenant scope. The sidecar reads a
// provisioned snapshot locally; no customer file travels to this application.
export async function readIdentificationRules(context: { projectId: ProjectId; userId: UserId }) {
  const { withTenant } = await import('../../../platform/db/scope.js');
  return withTenant(context, async (tx) => identificationRulesSchema.parse({
    cedants: await tx.query('SELECT id, project_id AS "projectId", code, name, active FROM cedant ORDER BY id'),
    rules: await tx.query(`SELECT id, cedant_id AS "cedantId", project_id AS "projectId", match_kind AS "matchKind", pattern, kind,
      period_group AS "periodGroup", priority, active FROM cedant_file_rule ORDER BY id`),
  }));
}
