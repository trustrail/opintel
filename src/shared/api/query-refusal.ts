import {z} from 'zod';
const name=z.string().min(1).refine(v=>!v.includes('\0'));
export const queryRefusalDetails = z.object({
 name:name.optional(), operation:name.optional(), construct:name.optional(),
 elementId:z.uuid().optional(), object:z.object({catalog:name,schema:name,name}).optional(),
 stage:z.union([z.literal(1),z.literal(2),z.enum(['application_pre_filter','binding','treatment'])]).optional(),
 proofCategory:z.enum(['parse_failed','serialization_refused','sql_not_permitted','aggregate_stage2']).optional(),
 resource:z.enum(['memory','queue','time','cancellation']).optional(),
 queryEngineVersion:name.optional(), evidenceId:name.optional(),
 reason:z.enum(['all_withheld','all_undecided','mixed_withheld_undecided','source_status','credential_missing','source_status_and_credential_missing',
 'namespace','staged_schema','policy','group_count_rewrite','row_limit_rewrite','engine_version','policy_version','column_types','row_shape','result_contract',
 'secret_missing','secret_malformed','secret_storage','staging_capability','scanner','read_plan','query_limits','metadata','data',
 'response_incomplete','response_oversized','response_content_type','response_json','response_error_envelope','health_contract',
 'source_declarations','conflicting_treatments','source_timezone','token_key_size','token_declaration','canonicaliser','sentinel_domain']).optional(),
 setting:z.enum(['maxStagingRows','maxQueuedExecutions']).optional(),
 value:z.number().int().nonnegative().optional(),depth:z.number().int().nonnegative().optional(),
});
export const QueryRefusalMetadata=queryRefusalDetails.extend({code:z.string(),cause:z.enum(["all_undecided", "all_withheld", "ambiguous_object", "binding_failed", "cardinality_count_invalid", "cardinality_count_low", "cardinality_estimate_low", "column_absent", "component_configuration", "deadline_exceeded", "engine_failed", "evidence_after_execution", "evidence_before_execution", "evidence_execution_unknown", "inconsistent_result", "inner_group_counts_unverifiable", "inspection_inconsistent", "inspection_unavailable", "interruption_unclassified", "invalid_execution_contract", "invalid_identifier", "invalid_plan", "invalid_query", "invalid_settings", "invalid_token_declaration", "memory_exhausted", "mixed_withheld_undecided", "numeric_not_representable", "nested_aggregation", "not_direct_aggregate_argument", "object_absent", "parse_failed", "parser_engine_mismatch", "prohibited_construct", "query_disabled", "queue_full", "row_access", "scan_estimate_large", "scan_observed_large", "scan_size_unknown", "serialization_refused", "sidecar_contract_mismatch", "sidecar_response_unusable", "sidecar_transport_failed", "source_connections_saturated", "source_not_bound", "source_not_ready", "source_read_failed", "source_response_unusable", "source_unreachable", "staging_failed", "tool_unavailable", "tokenization_failed", "unclassified", "undecided", "unsupported_aggregate_context", "unsupported_operation", "withheld"]),retryable:z.boolean()});
