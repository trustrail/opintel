import {DescribeOutput} from '../../src/shared/api/mcp.js';
import {sqlRules} from './sql-rules.js';
import {AgentIdHeader} from '../../src/shared/api/agent-presence.js';
import {z} from 'zod';
import {query,redeem,grantClaims,type McpCall,type ResultFile,type RedemptionStep} from '../steps/service.js';
import {ShareRefused} from '../steps/infrastructure/device.js';
import {CompanionFailure} from './diagnostics.js';
import {publicCode,publicCause} from '../steps/infrastructure/diagnostics.js';

export const Credential=z.strictObject({v:z.literal(1),poolKey:z.string().regex(/^opk_live_[A-Za-z0-9]{22}$/u),identity:z.strictObject({name:z.string().regex(/^device-[1-9][0-9]*$/u),clientCert:z.string().min(1),clientKey:z.string().min(1),transportKey:z.string().min(1)}),xqApiKey:z.string().min(1)});
export const Config=z.strictObject({gateway:z.url().refine(value=>new URL(value).protocol==='https:'),project:z.uuid(),agentId:AgentIdHeader,caFile:z.null()});
export const UnsealInput=z.object({evidenceId:z.string().min(1).optional().describe('Evidence ID returned by opintel_query.'),grantId:z.string().min(1).optional().describe('Grant ID returned by opintel_query; used first when both IDs are supplied.')});
export const unsealDescription='Redeem and locally unseal a previous query result. Supply evidenceId, grantId, or both. When both are supplied, grantId is used and must belong to evidenceId. Supplying neither is refused with validation_failed.';
export function createTools(call:McpCall,config:z.infer<typeof Config>,share:(locator:string)=>Promise<Buffer>,limit=32){
 const saved=new Map<string,ResultFile>();
 return async(name:string,args:Record<string,unknown>)=>{
  if(name==='opintel_describe'){
   const result=await call('opintel.describe',{});if(result.isError)return {refused:true,code:publicCode(result._meta?.code),cause:publicCause(result._meta?.cause),message:'The request was refused.'};const {custody,...visible}=DescribeOutput.parse(result.structuredContent);return {...visible,...(custody?{custody:{provider:custody.provider,credentialRequired:custody.credentialRequired}}:{}),sqlRules:[...sqlRules]};
  }
  if(name==='opintel_query'){
   const sql=z.object({sql:z.string().min(1)}).parse(args).sql;
   let refusal: {refused:true;code:string;cause:string;message:string}|undefined;
   const recordingCall:McpCall=async(tool,input)=>{const reply=await call(tool,input);if(reply.isError&&tool==='opintel.query'){const content=z.array(z.object({type:z.string(),text:z.string().optional()})).safeParse(reply.content);refusal={refused:true,code:publicCode(reply._meta?.code),cause:publicCause(reply._meta?.cause),message:content.success?content.data.find(part=>part.type==='text')?.text??'The request was refused.':'The request was refused.'};}return reply;};
   try{const received=await query(recordingCall,sql),file:ResultFile={version:1,gateway:config.gateway,project:config.project,agentId:config.agentId,...received};saved.set(file.result.evidenceId,file);while(saved.size>limit){const oldest=saved.keys().next().value;if(oldest===undefined)break;saved.delete(oldest);}return {columns:file.result.columns.map(c=>({name:c.name,treatment:file.treatments[c.name]??'not reported'})),rows:file.result.rows,evidenceId:file.result.evidenceId,grants:grantClaims(file.result).flatMap(g=>g.columns.map(column=>({grantId:g.claims.jti,column,expiresAt:new Date(g.claims.exp*1000).toISOString()})))};}catch(error){if(refusal)return refusal;throw error;}
  }
  if(name==='opintel_unseal'){
   const parsed=UnsealInput.safeParse(args);
   if(!parsed.success||(!parsed.data.evidenceId&&!parsed.data.grantId))return {refused:true,code:'validation_failed',cause:'result_reference_required',message:'Supply evidenceId, grantId, or both from a previous query.'};
   const input=parsed.data;
   const file=input.grantId?[...saved.values()].find(f=>grantClaims(f.result).some(g=>g.claims.jti===input.grantId)):saved.get(input.evidenceId!);if(!file)return {refused:true,code:'result_not_found',cause:'not_in_session',message:'The result is not available in this session.'};
   if(input.evidenceId&&file.result.evidenceId!==input.evidenceId)return {refused:true,code:'validation_failed',cause:'result_reference_mismatch',message:'The grant does not belong to that evidence ID.'};
   let step:RedemptionStep='lookup';let refusal:Record<string,unknown>|undefined;const observed:McpCall=async(name,args)=>{const reply=await call(name,args);if(reply.isError){const content=z.array(z.object({type:z.string(),text:z.string().optional()})).safeParse(reply.content);refusal={refused:true,code:publicCode(reply._meta?.code),cause:publicCause(reply._meta?.cause),message:content.success?content.data.find(p=>p.type==='text')?.text??'Redemption refused.':'Redemption refused.'};}return reply;};
   try{return {rows:(await redeem(file,observed,share,value=>{step=value;})).rows,evidenceId:file.result.evidenceId};}catch(error){if(refusal)return refusal;if(error instanceof ShareRefused)return {refused:true,code:'redemption_refused',cause:error.share,message:error.message};throw new CompanionFailure(step,error);}
  }
  throw new Error('Unknown tool.');
 };
}
