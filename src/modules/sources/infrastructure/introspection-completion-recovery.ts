import { withPlatform } from '../../../platform/db/scope.js';
import type { ProjectId, UserId } from '../../../shared/kernel/index.js';
import type { IntrospectionContext } from '../application/introspection-store.js';

/** Same project-discovery boundary as ordinal repair; event reads and writes
 * remain inside the store's tenant scopes. No customer values are read here. */
export async function recoverIntrospectionCompletions(dispatch: (ctx: IntrospectionContext) => Promise<void>): Promise<void> {
  const projects = await withPlatform(tx => tx.query<{projectId:ProjectId;userId:UserId|null}>(`SELECT p.id AS "projectId", COALESCE(
    (SELECT user_id FROM project_member WHERE project_id=p.id AND role='admin' ORDER BY user_id LIMIT 1),
    (SELECT user_id FROM company_member WHERE company_id=p.company_id AND role='admin' ORDER BY user_id LIMIT 1)
  ) AS "userId" FROM project p`));
  for (const project of projects) {
    if (project.userId === null) continue;
    try { await dispatch({ projectId:project.projectId,userId:project.userId }); }
    catch { console.warn({event:'introspection.rules_delivery_pending',projectId:project.projectId,category:'dependency_unavailable'}); }
  }
}
