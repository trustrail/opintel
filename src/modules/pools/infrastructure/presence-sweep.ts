import { withPlatform } from '../../../platform/db/scope.js';
import type { ProjectId,UserId } from '../../../shared/kernel/index.js';
import type { AgentPresenceRepository } from '../application/presence.js';
/** Project discovery uses the existing worker scope pattern; presence access
 * and each transition remain in tenant scope. */
export async function sweepAgentPresence(repository:AgentPresenceRepository):Promise<void>{
 const projects=await withPlatform(tx=>tx.query<{projectId:ProjectId;userId:UserId|null}>(`SELECT p.id AS "projectId",COALESCE(
  (SELECT user_id FROM project_member WHERE project_id=p.id AND role='admin' ORDER BY user_id LIMIT 1),
  (SELECT user_id FROM company_member WHERE company_id=p.company_id AND role='admin' ORDER BY user_id LIMIT 1)
 ) AS "userId" FROM project p`));
 for(const project of projects){if(project.userId===null)continue;try{await repository.sweep({projectId:project.projectId,userId:project.userId});}catch{console.warn({event:'agent.presence_sweep_failed',projectId:project.projectId,category:'dependency_unavailable'});}}
}
