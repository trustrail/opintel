import type {z} from 'zod';
import type {CompileResult} from '../../entitlements/index.js';
import type {Result,RunId,SourceId} from '../../../shared/kernel/index.js';
import type {ExecutionRequest,executionResponse,validationResponse} from '../../../shared/execution-contract.js';
import type {QueryOutput} from '../../../shared/api/mcp.js';
import type {Reduction} from './response.js';
import type {McpPrincipal} from './access.js';
export interface EvidenceWriterPort {
 readonly implementation:'durable'|'unavailable'|'test-stub';
 open(principal:McpPrincipal,sql:string):Promise<Result<RunId>>;
 close(id:RunId,outcome:{kind:'answered';rows:number;policyVersion:number;queryEngineVersion:string}|{kind:'refused';code:string}):Promise<Result<void>>;
}
export interface QuerySnapshotReader {
 read(principal:McpPrincipal):Promise<Result<{compilation:CompileResult;policyVersion:number;aggregateMinGroupSize:number;settings:ExecutionRequest['settings'];limits:ExecutionRequest['limits'];sources:Array<{id:SourceId;alias:string;credentialRef:string|null;status:string}>}>>;
}
export interface QueryExecutionPort {
 health(signal?:AbortSignal):Promise<Result<{queryEngineVersion:string}>>;
 execute(input:ExecutionRequest,signal?:AbortSignal):Promise<Result<z.infer<typeof executionResponse>>>;
}
export interface QueryTool {query(principal:McpPrincipal,input:unknown,signal?:AbortSignal):Promise<Result<z.infer<typeof QueryOutput>&{reduction?:Reduction}>>}

export interface QueryValidationPort {
 health(signal?:AbortSignal):Promise<Result<{queryEngineVersion:string}>>;
 validate(input:ExecutionRequest,signal?:AbortSignal):Promise<Result<z.infer<typeof validationResponse>>>;
}
