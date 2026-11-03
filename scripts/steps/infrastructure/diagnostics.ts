import type {ErrorCode} from '../../../src/shared/kernel/index.js';
import {QueryRefusalMetadata} from '../../../src/shared/api/query-refusal.js';
// Only public protocol codes may enter diagnostics. Never echo an opaque value
// merely because it looks like an identifier.
const codes:readonly ErrorCode[]=['unauthenticated','forbidden','not_found','validation_failed','conflict','idempotency_key_reused','rate_limited','dependency_unavailable','entitlement_missing','element_withheld','object_unavailable','unsupported_on_token','unsupported_on_aggregate_only','term_unresolved','clarification_required','domain_knowledge_gap','sources_cannot_be_joined','large_result_confirmation','budget_exceeded','engine_saturated','source_unavailable','sql_not_permitted','unsupported_pushdown'];
export function publicCode(value:unknown){return typeof value==='string'&&codes.some(code=>code===value)?value:'not_reported';}
export function publicCause(value:unknown){if(value==='identity_unproven'||value==='identity_mismatch'||value==='identity_pending')return value;const parsed=QueryRefusalMetadata.shape.cause.safeParse(value);return parsed.success?parsed.data:'not_reported';}
export function transportFailure(error:unknown){
 const names=new Set(['Error','TypeError','SyntaxError','TimeoutError','AbortError','McpError','StreamableHTTPError']);
 const native=new Set(['ENOTFOUND','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','EPIPE','ENOENT','EACCES','EPERM','ELOOP','EISDIR','ENOTDIR','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','ERR_TLS_CERT_ALTNAME_INVALID','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET']);
 let current=error,kind='Error';
 for(let depth=0;depth<4&&current&&typeof current==='object';depth++){
  const value=current as {code?:unknown;status?:unknown;name?:unknown;cause?:unknown};
  if(typeof value.name==='string'&&names.has(value.name))kind=value.name;
  if(typeof value.code==='string'&&native.has(value.code))return `connection or file operation failed (${value.code})`;
  if(typeof value.code==='number'&&Number.isInteger(value.code)){
   if(value.code>=100&&value.code<=599)return `gateway refused the request (HTTP ${value.code})`;
   if([-32700,-32600,-32601,-32602,-32603,-32000].includes(value.code))return `MCP protocol request failed (${value.code})`;
  }
  if(kind==='TimeoutError'||kind==='AbortError')return `request timed out or was cancelled (${kind})`;
  current=value.cause;
 }
 return `request or input failed (${kind}; no more specific safe cause was reported)`;
}
