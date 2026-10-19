import {z} from 'zod';
/** Closed, value-free diagnostics safe for operator logs and Engine status. */
export const readinessFailure=z.enum(['scanner_configuration_missing','readiness_source_missing','scanner_load_failed','query_engine_initialization_failed','source_connection_refused','source_authentication_failed','source_timeout','source_probe_failed','probe_result_invalid','engine_process_stopped']);
export type ReadinessFailure=z.infer<typeof readinessFailure>;
export const readinessMessages:Readonly<Record<ReadinessFailure,string>>={
 scanner_configuration_missing:'Scanner configuration missing: set postgresExtension to the signed PostgreSQL scanner.',
 readiness_source_missing:'Readiness source missing: set postgresReadinessSource explicitly to the intended PostgreSQL secret reference.',
 scanner_load_failed:'The configured signed PostgreSQL scanner could not be loaded.',
 query_engine_initialization_failed:'The privileged query engine session could not be initialized.',
 source_connection_refused:'The readiness source refused the connection.',
 source_authentication_failed:'The readiness source rejected authentication.',
 source_timeout:'The readiness source connection or constant query timed out.',
 source_probe_failed:'The readiness source could not complete the constant SELECT 1 probe.',
 probe_result_invalid:'The readiness source returned an unexpected constant probe result.',
 engine_process_stopped:'The Engine process stopped without a specific readiness diagnosis. Inspect its diagnostics.',
};
export function isReadinessMessage(message:string|null):boolean{return Object.values(readinessMessages).some(value=>value===message);}
