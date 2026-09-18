import { withPlatform } from '../../../platform/db/scope.js';
import { Timestamp, UserId, type ProjectId } from '../../../shared/kernel/index.js';
import type { MemberListRepository, ProjectMember } from '../application/list-members.js';

export class PostgresMemberListRepository implements MemberListRepository {
  async list(project: ProjectId, after: UserId | null, limit: number): Promise<ProjectMember[]> {
    const rows = await withPlatform((tx) => tx.query<{
      id: string; email: string; full_name: string | null;
      project_role: ProjectMember['projectRole']; company_role: ProjectMember['companyRole'];
      granted_at: Date | null; granted_by_id: string | null; granted_by_email: string | null;
    }>(
      `WITH candidates AS (
         SELECT user_id FROM project_member WHERE project_id = $1
         UNION
         SELECT cm.user_id FROM company_member cm JOIN project p ON p.company_id = cm.company_id WHERE p.id = $1
       )
       SELECT u.id, u.email, u.full_name, pm.role AS project_role, cm.role AS company_role,
              pm.granted_at, grantor.id AS granted_by_id, grantor.email AS granted_by_email
       FROM candidates c JOIN user_account u ON u.id = c.user_id JOIN project p ON p.id = $1
       LEFT JOIN project_member pm ON pm.project_id = p.id AND pm.user_id = u.id
       LEFT JOIN company_member cm ON cm.company_id = p.company_id AND cm.user_id = u.id
       LEFT JOIN user_account grantor ON grantor.id = pm.granted_by
       WHERE ($2::uuid IS NULL OR u.id > $2::uuid)
       ORDER BY u.id LIMIT $3`, [project, after, limit],
    ));
    return rows.map((row) => ({
      user: { id: UserId(row.id), email: row.email, fullName: row.full_name },
      projectRole: row.project_role, companyRole: row.company_role,
      via: row.project_role === null ? 'company' : row.company_role === null ? 'project' : 'both',
      grantedAt: row.granted_at === null ? null : Timestamp(row.granted_at),
      grantedBy: row.granted_by_id === null || row.granted_by_email === null ? null : { id: UserId(row.granted_by_id), email: row.granted_by_email },
    }));
  }
}
