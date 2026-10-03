import type { z } from 'zod';
import { ExplainInput, ExplainOutput } from '../../../shared/api/mcp.js';
import { DomainError, err, ok, type IdFactory, type Result } from '../../../shared/kernel/index.js';
import type { QueryPreFilter } from '../../entitlements/index.js';
import type { AuthorizationPort } from '../../authz/index.js';
import type { McpPrincipal } from './access.js';
import type { QuerySnapshotReader, QueryValidationPort } from './query-ports.js';
import { QueryPreparation } from './query-preparation.js';

export interface ExplainTool {
 explain(principal:McpPrincipal,input:unknown,signal?:AbortSignal):Promise<Result<z.infer<typeof ExplainOutput>>>;
}
/** No execution or evidence-writing capability is supplied to this service. */
export class ExplainService implements ExplainTool {
 private readonly preparation:QueryPreparation;
 constructor(reader:QuerySnapshotReader,filter:QueryPreFilter,private readonly validation:QueryValidationPort,authorization:AuthorizationPort,private readonly ids:IdFactory) {
  this.preparation=new QueryPreparation(reader,filter,validation,authorization);
 }
 async explain(principal:McpPrincipal,input:unknown,signal?:AbortSignal):Promise<Result<z.infer<typeof ExplainOutput>>> {
  const parsed=ExplainInput.safeParse(input);
  if(!parsed.success)return err(new DomainError('validation_failed','The query arguments do not match their schema.',{cause:'invalid_query'}));
  try {
   const prepared=await this.preparation.prepare(principal,parsed.data,this.ids.create(),signal);
   if(!prepared.ok)return prepared;
   const plan=prepared.value;
   // Application inspection never suffices for permitted:true (C.3.1).
   const validated=await this.validation.validate(plan.request,signal);
   if(!validated.ok)return validated;
   if(validated.value.queryEngineVersion!==plan.queryEngineVersion)return err(new DomainError('sql_not_permitted','The application parser and Opintel Engine builds differ. Align their builds before retrying.',{cause:'parser_engine_mismatch'}));
   if(validated.value.treatmentEvidence.stage2Ran)return err(new DomainError('dependency_unavailable','The Opintel Engine returned an inconsistent validation result.',{cause:'unclassified'}));
   const notes=['Dry run. No source was contacted. Nothing was read.',...plan.executionNotes];
   const r=plan.reduction;
   if(r.withheld.length)notes.push(`Elements that would be withheld: ${r.withheld.join(', ')}.`);
   if(r.tokenized.length)notes.push(`Elements that would be returned tokenized: ${r.tokenized.join(', ')}.`);
   if(r.masked.length)notes.push(`Elements that would be returned masked: ${r.masked.join(', ')}.`);
   if(r.aggregate_only.length)notes.push(`Elements that can only be read in aggregate: ${r.aggregate_only.join(', ')}.`);
   if(validated.value.treatmentEvidence.stage2Required)notes.push('Group sizes must be checked during execution; this dry run does not establish that the groups are large enough.');
   if(plan.request.objects.length)notes.push('Columns list the planned source reads, including staging columns that may not appear in the result.');
   notes.push('Source connectivity, scan size and execution limits are not established by this dry run.');
   const address=(object:{catalog:string;schema:string;name:string})=>`${object.catalog}.${object.schema}.${object.name}`;
   return ok(ExplainOutput.parse({permitted:true,objects:plan.request.objects.map(address),columns:plan.request.objects.flatMap(object=>object.readPlan.columns.map(column=>`${address(object)}.${column.exposedName}`)),notes}));
  } catch {return err(new DomainError('dependency_unavailable','The query could not complete. No partial result was returned.'));}
 }
}
