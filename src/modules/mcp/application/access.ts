import { DomainError, err, ok, type Result, type ProjectId } from '../../../shared/kernel/index.js';
import { AgentIdHeader } from '../../../shared/api/agent-presence.js';
import type { KeyVerifier, KeyVerdict, AgentPresenceService } from '../../pools/index.js';

export type McpPrincipal = Extract<KeyVerdict, {ok:true}> & { agentId: string };
export interface McpConfiguration {
 read(principal: McpPrincipal): Promise<Result<{ modes: {query:boolean;prompt:boolean}; heartbeatSeconds:number }>>;
}
export class McpAccess {
 constructor(private readonly keys: KeyVerifier, private readonly presence: AgentPresenceService) {}
 async authenticate(project: ProjectId, authorization: unknown, agentId: unknown): Promise<Result<McpPrincipal>> {
  const bearer = typeof authorization === 'string' ? /^Bearer ([^ ]+)$/iu.exec(authorization)?.[1] ?? '' : '';
  const key = await this.keys.verify(bearer);
  if (!key.ok || key.pool.projectId !== project) {
   console.info({ event: 'mcp.refused', reason: key.ok ? 'key_project_mismatch' : `key_${key.reason}` });
   return err(new DomainError('unauthenticated', 'The pool key is not valid.'));
  }
  const claimed = AgentIdHeader.safeParse(agentId);
  if (!claimed.success) {
   console.info({ event: 'mcp.refused', poolId: key.pool.id, reason: 'missing_agent_id' });
   return err(new DomainError('validation_failed', 'Supply the X-Opintel-Agent-Id header.'));
  }
  return ok({ ...key, agentId: claimed.data });
 }
 async observe(principal: McpPrincipal, kind: 'connect'|'request'|'heartbeat', client: string|null) {
  return this.presence.observeAuthenticated({projectId:principal.pool.projectId,userId:principal.scopeUserId},
   {poolId:principal.pool.id,keyVersion:principal.keyVersion}, {agentId:principal.agentId,kind,client});
 }
}
