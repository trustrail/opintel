import { withPlatform } from '../../../platform/db/scope.js';
import { UserId, type ProjectId } from '../../../shared/kernel/index.js';
import type { PermissionSubject, PermissionSubjectRepository } from '../application/explain-permissions.js';

export class PostgresPermissionSubjectRepository implements PermissionSubjectRepository {
  async read(project: ProjectId, user: UserId): Promise<PermissionSubject | null> {
    const rows = await withPlatform((tx) => tx.query<{
      id: string; email: string;
      project_role: PermissionSubject['projectRole']; company_role: PermissionSubject['companyRole'];
    }>(
      `SELECT u.id, u.email, pm.role AS project_role, cm.role AS company_role
       FROM project p CROSS JOIN user_account u
       LEFT JOIN project_member pm ON pm.project_id = p.id AND pm.user_id = u.id
       LEFT JOIN company_member cm ON cm.company_id = p.company_id AND cm.user_id = u.id
       WHERE p.id = $1 AND u.id = $2`, [project, user],
    ));
    const row = rows[0];
    return row === undefined ? null : {
      user: { id: UserId(row.id), email: row.email }, projectRole: row.project_role, companyRole: row.company_role,
    };
  }
}
