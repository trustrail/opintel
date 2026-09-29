import type {z} from 'zod';
import type {CompileResult} from '../../entitlements/index.js';
import type {Result,SourceId} from '../../../shared/kernel/index.js';
import type {ExecutionRequest,ValidationRequest,executionResponse,validationResponse} from '../../../shared/execution-contract.js';
import type {QueryOutput} from '../../../shared/api/mcp.js';
import type {Reduction} from './response.js';
import type {McpPrincipal} from './access.js';
export type {EvidenceWriterPort} from '../../evidence/index.js';
export interface QuerySnapshotReader {
 read(principal:McpPrincipal):Promise<Result<{compilation:CompileResult;evidence?:{versions:import('../../evidence/index.js').VersionStamp;currentTokenKeyVersion:number|null;withheldReasons?:Record<string,string|null>;sources:import('../../evidence/index.js').EvidenceSource[]};policyVersion:number;aggregateMinGroupSize:number;settings:ExecutionRequest['settings'];limits?:ExecutionRequest['limits'];executionNotes?:string[];sources:Array<{id:SourceId;alias:string;credentialRef:string|null;status:string}>}>>;
}
export interface QueryExecutionPort {
 health(signal?:AbortSignal):Promise<Result<{queryEngineVersion:string}>>;
 execute(input:ExecutionRequest,signal?:AbortSignal):Promise<Result<z.infer<typeof executionResponse>>>;
}
export interface QueryTool {query(principal:McpPrincipal,input:unknown,signal?:AbortSignal):Promise<Result<z.infer<typeof QueryOutput>&{reduction?:Reduction}>>}

export interface QueryValidationPort {
 health(signal?:AbortSignal):Promise<Result<{queryEngineVersion:string}>>;
 validate(input:ValidationRequest,signal?:AbortSignal):Promise<Result<z.infer<typeof validationResponse>>>;
}
