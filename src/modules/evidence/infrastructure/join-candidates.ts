import {withTenant} from '../../../platform/db/scope.js';
import {DomainError,err,ok,UuidV7IdFactory} from '../../../shared/kernel/index.js';
import {joinCandidateColumns,type ExplainJoinCandidateWriterPort} from '../application/join-candidates.js';

export class PostgresExplainJoinCandidates implements ExplainJoinCandidateWriterPort {
 async record(...[principal,statement,details,attemptedAt]:Parameters<ExplainJoinCandidateWriterPort['record']>){
  const parsed=joinCandidateColumns.safeParse(details);
  if(!parsed.success)return err(new DomainError('dependency_unavailable','The refused join attempt could not be recorded.'));
  const [left,right]=parsed.data.columns;
  return withTenant({projectId:principal.pool.projectId,userId:principal.scopeUserId},async tx=>{
   await tx.query(`INSERT INTO token_join_candidate(id,operation,project_id,pool_id,left_element_id,right_element_id,left_name,right_name,agent_id,statement,attempted_at)
    VALUES($1,'explain',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[new UuidV7IdFactory().create(),principal.pool.projectId,principal.pool.id,left.elementId,right.elementId,left.name,right.name,principal.agentId,statement,attemptedAt]);
   return ok(undefined);
  });
 }
}
