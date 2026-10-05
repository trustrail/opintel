import { z } from 'zod';
import type { DomainError } from '../../../shared/kernel/index.js';
import {queryRefusalDetails,QueryRefusalMetadata} from '../../../shared/api/query-refusal.js';
import { QueryOutput } from '../../../shared/api/mcp.js';

export const messages = {
  "W": "{name} was withheld from this pool. It cannot be returned in any form.",
  "E": "{name} has no decision recorded for this pool, so it cannot be returned. An administrator decides each element before an agent can read it.",
  "T": "{name} is tokenized, so it supports equality, grouping and joins, but not {operation}. Tokens preserve which values are the same, not how they order.",
  "A-row": "{name} can only be read in aggregate. This query reads it row by row. Use an aggregate such as SUM, AVG or COUNT over a group.",
  "A-direct": "{name} can only be read in aggregate, and this query does not pass it directly to an aggregate. Use SUM, AVG or COUNT over the element itself.",
  "A-small": "{name} can only be read in aggregate, and this query would have described too few records. Group more broadly, or use a less restrictive filter.",
  "A-count-invalid": "{name} can only be read in aggregate, and the group sizes for this query could not be checked. Nothing is established about whether the groups are large enough. Try a simpler grouping, or ask an administrator to look at this query.",
  "A-nested": "{name} can only be read in aggregate, and this query nests one aggregate inside another. The group sizes cannot be checked through the nesting, so the query is refused without judging them. Use a single aggregate.",
  "Q": "{construct} is not permitted here. This interface accepts SELECT, WITH, VALUES and DESCRIBE against the objects this pool can reach.",
  "Q-fallback": "This query cannot be run through this interface. This interface accepts SELECT, WITH, VALUES and DESCRIBE against the objects this pool can reach.",
  "Scan-large": "This query would read more of the source than the limit allows. Add a filter the source can evaluate, or narrow the objects read.",
  "Scan-unknown": "The size of this read cannot be estimated, so it is refused rather than run. Add a filter the source can evaluate, or narrow the objects read.",
  "Memory": "This query needed more memory than the limit allows. Reduce the result, or aggregate earlier in the query.",
  "Queue": "This pool is busy and the queue is full. Retry shortly.",
  "Connections": "The sources this query needs are busy. Retry shortly.",
  "Deadline": "This query ran longer than the limit allows and was cancelled. Nothing partial was returned.",
  "Source-down": "A source this query needs cannot be reached, so no result was returned. Results are never served from a stale copy.",
  "Source-read": "A source this query needs returned an error, so no result was returned. Results are never served from a stale copy.",
  "Evidence-before": "The query could not be recorded, so it was not run. Every answer carries a record of what it read.",
  "Evidence-after": "The query ran but its record could not be completed, so no result was returned. Every answer carries a record of what it read.",
  "Version": "The query could not be run because a component is out of step with this deployment. No source was contacted. This needs an operator; retrying will not help.",
  "Result": "The query ran but returned a result this interface cannot trust, so nothing was released. This needs an operator; retrying will not help.",
  "T-join": "Columns {left} and {right} cannot be joined by equality with their current tokenization. Ask an administrator to tokenize both columns under a shared token domain.",
  "Unknown": "The query could not be completed. Whether it reached a source is not established. This needs an operator."
} as const;
const mapping: Readonly<Record<string, readonly [keyof typeof messages, boolean | 'inherit']>> = {
 'element_withheld/withheld': ['W', false],
 'entitlement_missing/undecided': ['E', false],
 'unsupported_on_token/unsatisfiable_token_join': ['T-join', false],
 'unsupported_on_token/unsupported_operation': ['T', false],
 'unsupported_on_aggregate_only/row_access': ['A-row', false],
 'unsupported_on_aggregate_only/not_direct_aggregate_argument': ['A-direct', false],
 'unsupported_on_aggregate_only/unsupported_aggregate_context': ['Q-fallback', false],
 'unsupported_on_aggregate_only/nested_aggregation': ['A-nested', false],
 'unsupported_on_aggregate_only/inner_group_counts_unverifiable': ['Q-fallback', false],
 'unsupported_on_aggregate_only/cardinality_estimate_low': ['Q-fallback', false],
 'unsupported_on_aggregate_only/cardinality_count_low': ['A-small', false],
 'unsupported_on_aggregate_only/cardinality_count_invalid': ['A-count-invalid', false],
 'sql_not_permitted/prohibited_construct': ['Q', false],
 'sql_not_permitted/parse_failed': ['Q-fallback', false],
 'sql_not_permitted/serialization_refused': ['Q-fallback', false],
 'sql_not_permitted/binding_failed': ['Q-fallback', false],
 'sql_not_permitted/source_not_bound': ['Q-fallback', false],
 'sql_not_permitted/parser_engine_mismatch': ['Unknown', false],
 'sql_not_permitted/inspection_unavailable': ['Unknown', false],
 'sql_not_permitted/inspection_inconsistent': ['Unknown', false],
 'unsupported_pushdown/scan_estimate_large': ['Scan-large', false],
 'unsupported_pushdown/scan_observed_large': ['Scan-large', false],
 'unsupported_pushdown/scan_size_unknown': ['Scan-unknown', false],
 'budget_exceeded/memory_exhausted': ['Memory', false],
 'budget_exceeded/queue_full': ['Queue', true],
 'budget_exceeded/source_connections_saturated': ['Connections', true],
 'budget_exceeded/deadline_exceeded': ['Deadline', false],
 'budget_exceeded/interruption_unclassified': ['Unknown', false],
 'source_unavailable/source_unreachable': ['Source-down', 'inherit'],
 'source_unavailable/source_read_failed': ['Source-read', 'inherit'],
 'source_unavailable/source_response_unusable': ['Unknown', false],
 'source_unavailable/source_not_ready': ['Unknown', false],
 'source_unavailable/sidecar_transport_failed': ['Unknown', false],
 'source_unavailable/sidecar_response_unusable': ['Unknown', false],
 'source_unavailable/staging_failed': ['Unknown', false],
 'source_unavailable/interruption_unclassified': ['Unknown', false],
 'dependency_unavailable/evidence_before_execution': ['Evidence-before', 'inherit'],
 'dependency_unavailable/evidence_after_execution': ['Evidence-after', 'inherit'],
 'dependency_unavailable/evidence_execution_unknown': ['Unknown', false],
 'dependency_unavailable/sidecar_contract_mismatch': ['Version', false],
 'dependency_unavailable/inconsistent_result': ['Result', false],
 'dependency_unavailable/component_configuration': ['Unknown', false],
 'dependency_unavailable/tokenization_failed': ['Unknown', false],
 'dependency_unavailable/engine_failed': ['Unknown', false],
 'dependency_unavailable/unclassified': ['Unknown', false],
};

const name = z.string().min(1).refine(v => !v.includes('\0'));
export const reductionSchema = z.object({
 withheld:z.array(name), tokenized:z.array(name), masked:z.array(name), aggregate_only:z.array(name),
});
export type Reduction = z.infer<typeof reductionSchema>;
const passThroughCauses: Readonly<Record<string, readonly string[]>> = {
 object_unavailable:['all_withheld','all_undecided','mixed_withheld_undecided'],
 not_found:['object_absent','column_absent'],
 validation_failed:['invalid_query','invalid_settings','invalid_plan','invalid_token_declaration','invalid_execution_contract','numeric_not_representable'],
 forbidden:['query_disabled'],
 sql_not_permitted:['ambiguous_object','invalid_identifier'],
};
/** No raw diagnostic or open-ended detail object crosses the MCP boundary. */
export function refusalResponse(error:DomainError) {
 const details: Record<string, unknown> = {};
 // Validate separately: one bad field must not erase other known distinctions.
 for(const [key,schema] of Object.entries(queryRefusalDetails.shape)) {
  const parsed=schema.safeParse(error.details?.[key]);
  if(parsed.success&&parsed.data!==undefined)details[key]=parsed.data;
 }
 if(details.setting===undefined){delete details.value;delete details.depth;}
 const incoming=error.details?.cause??(error.code==='object_unavailable'?details.reason:undefined);
 const known=typeof incoming==='string'&&(mapping[`${error.code}/${incoming}`]!==undefined||passThroughCauses[error.code]?.includes(incoming));
 const cause=known?incoming:'unclassified';
 let selection=mapping[`${error.code}/${cause}`];
 if(!selection){
  const fallback=error.code==='sql_not_permitted'||error.code==='unsupported_on_aggregate_only'?'Q-fallback':
   error.code==='element_withheld'?'W':error.code==='entitlement_missing'?'E':error.code==='unsupported_on_token'?'T':'Unknown';
  selection=[fallback,false];
 }
 let [label,retryable]=selection;
 let text:string=messages[label];
 for(const field of ['name','operation','construct'] as const)if(text.includes(`{${field}}`)){
  const value=details[field];
  if(typeof value==='string')text=text.replaceAll(`{${field}}`,value);
  else {label=error.code==='sql_not_permitted'||error.code==='unsupported_on_aggregate_only'?'Q-fallback':'Unknown';text=messages[label];break;}
 }
 if(label==='T-join'){
  const columns=queryRefusalDetails.shape.columns.safeParse(details.columns);
  if(columns.success&&columns.data)text=text.replace('{left}',columns.data[0].name).replace('{right}',columns.data[1].name);
  else text=messages.Unknown;
 }
 if(passThroughCauses[error.code]&&error.code!=='sql_not_permitted')text=error.message;
 if(label==='Unknown'||label==='Version'||label==='Result'||text.includes('operator'))retryable=false;
 return {isError:true,content:[{type:'text' as const,text}],_meta:QueryRefusalMetadata.parse({...details,code:error.code,cause,retryable:retryable==='inherit'?error.retryable:retryable})};
}
export function queryResponse(value:z.infer<typeof QueryOutput>&{reduction?:Reduction}) {
 const output=QueryOutput.parse({columns:value.columns,rows:value.rows,truncated:value.truncated,evidenceId:value.evidenceId});
 const r=reductionSchema.parse(value.reduction??{withheld:[],tokenized:[],masked:[],aggregate_only:[]});
 const n=output.rows.length;
 let text=n===0?'No rows.':n===1?'1 row.':`${n} rows.`;
 if(output.truncated)text+=` The result was truncated at ${n} rows; there are more.`;
 if(r.withheld.length)text+=r.withheld.length===1?` 1 element was withheld: ${r.withheld[0]}.`:` ${r.withheld.length} elements were withheld: ${r.withheld.join(', ')}.`;
 for(const kind of ['tokenized','masked'] as const)if(r[kind].length)text+=` ${r[kind].join(', ')} ${r[kind].length===1?'was':'were'} returned ${kind}.`;
 if(r.aggregate_only.length)text+=` ${r.aggregate_only.join(', ')} can only be read in aggregate.`;
 if(r.tokenized.length)text+=' Tokens are stable: the same value is always the same token, so they can be grouped and joined, but not ordered or compared.';
 const elements=Object.entries(r).flatMap(([treatment,names])=>names.map(name=>({name,treatment})));
 return {content:[{type:'text' as const,text}],structuredContent:output,_meta:{recordId:output.evidenceId,reduced:elements.length>0,elements}};
}
