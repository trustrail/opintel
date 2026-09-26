import { z } from 'zod';
import { DescribeInput, DescribeOutput } from '../../../shared/api/mcp.js';
import { DomainError, err, ok, type PoolId, type SourceId, type Result } from '../../../shared/kernel/index.js';
import { postTreatmentType, type ExposedType } from '../../catalog/index.js';
import type { Treatment } from '../../entitlements/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
import type { PoolKeyContext } from '../../pools/index.js';
import type { McpPrincipal } from './access.js';

export type DescribeDecision = { sourceId: SourceId; object: string; name: string; exposedType: ExposedType; treatment: Treatment };
export interface DescribeReader {
 /** Active, named, supported elements with an explicit entitlement in this
  * pool and a local source binding. Never returns undecided catalogue rows. */
 read(ctx: PoolKeyContext, pool: PoolId, object?: string): Promise<Result<DescribeDecision[]>>;
}
export interface DescribeTool {
 describe(principal: McpPrincipal, input: unknown): Promise<Result<z.infer<typeof DescribeOutput>>>;
}
export class DescribeService implements DescribeTool {
 constructor(private readonly reader: DescribeReader, private readonly authorization: AuthorizationPort) {}
 async describe(principal: McpPrincipal, input: unknown): Promise<Result<z.infer<typeof DescribeOutput>>> {
  const parsed = DescribeInput.safeParse(input);
  if (!parsed.success) return err(new DomainError('validation_failed','The tool arguments do not match its schema.'));
  const decisions = await this.reader.read({projectId:principal.pool.projectId,userId:principal.scopeUserId},principal.pool.id,parsed.data.object);
  if (!decisions.ok) return decisions;
  const sources = [...new Set(decisions.value.map(row=>row.sourceId))];
  const checks = sources.length ? await this.authorization.checkMany(sources.map(id=>({resource:{type:'datasource',id},permission:'reachable',subject:{type:'pool',id:principal.pool.id}}))) : [];
  const allowed = new Set(sources.filter((_,index)=>checks[index]?.allowed));
  const objects = new Map<string,z.infer<typeof DescribeOutput>['objects'][number]>();
  for (const row of decisions.value) {
   if (!allowed.has(row.sourceId)) continue;
   let object = objects.get(row.object);
   if (!object) { object={name:row.object,columns:[],withheld:[]};objects.set(row.object,object); }
   if (row.treatment==='withheld') object.withheld.push(row.name);
   else {
    const type = postTreatmentType(row.exposedType,row.treatment);
    if (type===null) return err(new DomainError('dependency_unavailable','The pool description is unavailable.'));
    object.columns.push({name:row.name,type,treatment:row.treatment});
   }
  }
  // Explicit projection only: no source identifiers, compiler omissions or
  // catalogue diagnostics are passed through to the agent.
  const output = DescribeOutput.safeParse({objects:[...objects.values()]});
  return output.success ? ok(output.data) : err(new DomainError('dependency_unavailable','The pool description is unavailable.'));
 }
}
