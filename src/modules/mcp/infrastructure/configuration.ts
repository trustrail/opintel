import { withTenant, withPlatform } from '../../../platform/db/scope.js';
import { PresenceSettings } from '../../../shared/api/agent-presence.js';
import { DomainError, err, ok } from '../../../shared/kernel/index.js';
import type { McpConfiguration, McpPrincipal } from '../application/access.js';
export class PostgresMcpConfiguration implements McpConfiguration {
 async read(principal: McpPrincipal) {
  const [project] = await withPlatform(tx => tx.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1 AND archived_at IS NULL',[principal.pool.projectId]));
  if (!project) return err(new DomainError('unauthenticated','The pool key is not valid.'));
  const settings = PresenceSettings.safeParse(project.settings);
  if (!settings.success) return err(new DomainError('validation_failed','The agent presence timing settings are invalid.'));
  const [row] = await withTenant({projectId:principal.pool.projectId,userId:principal.scopeUserId},tx=>tx.query<{query:boolean;prompt:boolean}>(
   `SELECT p.mode_query AS query,p.mode_prompt AS prompt FROM pool p JOIN pool_key k ON k.pool_id=p.id AND k.project_id=p.project_id
    WHERE p.id=$1 AND k.id=$2 AND k.created_at<=now() AND (k.state='current' OR k.state='retiring' AND k.grace_until>now())`,[principal.pool.id,principal.keyVersion]));
  return row ? ok({modes:row,heartbeatSeconds:settings.data.agentHeartbeatSeconds}) : err(new DomainError('unauthenticated','The pool key is not valid.'));
 }
}
