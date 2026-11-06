import {z} from 'zod';
import {Provenance,type ProvenanceFact} from '../../../shared/api/provenance.js';
import type {EvidenceDetail} from '../../../shared/api/activity.js';
import {releaseEvidenceMeaning} from '../../../shared/release-contract.js';
// Explicit projection only: do not expose arbitrary source plans, grant claims,
// stage details or current catalogue/credential configuration through this API.
export const ProvenanceSupplement=z.object({
 rows:z.array(z.object({id:z.uuid(),sequence:z.string(),expression:z.string(),objectId:z.uuid()})),
 grants:z.array(z.object({id:z.uuid(),columns:z.array(z.string()).nullable(),issued:z.string().nullable(),expires:z.string(),state:z.enum(['granted','redeemed','revoked','expired']),redeemed:z.string().nullable()})),
 limits:z.object({memoryMb:z.number().optional(),threads:z.number().optional(),timeoutMs:z.number().optional(),rowLimit:z.number().optional(),concurrency:z.number().optional()}).nullable(),floor:z.number().nullable(),cause:z.string().nullable(),
});
export type ProvenanceSupplement=z.infer<typeof ProvenanceSupplement>;
export function buildProvenance(r:EvidenceDetail,s:ProvenanceSupplement){
 const fact=(field:string,label:string,value:string|number|null|undefined,link?:string,copyable=false):ProvenanceFact=>({field,label,recorded:value!==null&&value!==undefined,value:value===null||value===undefined?null:String(value),...(link?{link}:{}),copyable});
 const link=(screen:string,values:Record<string,string>)=>'/?'+new URLSearchParams({project:r.projectId,screen,...values});
 const step=<K extends Provenance['steps'][number]['kind']>(kind:K,title:string,facts:ProvenanceFact[])=>({kind,title,recorded:facts.some(f=>f.recorded),facts});
 const identity=r.agentIdentity?.certificateIdentity;
 const request=[fact('time','Request time',r.startedAt),fact('certificate','Certificate',identity?`${identity.certificateId===null?'certificate label not recorded':'cert '+identity.certificateId} · ${identity.fingerprintPrefix}`:null),fact('verification','Certificate authentication',r.agentIdentity?r.agentIdentity.verified?'verified':'unverified':null),fact('nickname','Nickname',r.agentId),fact('credential','Credential ID',r.credentialId, r.credentialId?link('pools',{pool:r.poolId,tab:'credentials',credential:r.credentialId}):undefined,true),fact('credentialLabel','Credential label at request time',null),fact('credentialKind','Credential kind at request time',null),fact('pool','Pool ID',r.poolId,link('pools',{pool:r.poolId}),true)];
 const ids=[...new Set((r.metadata.rowScopes??[]).flatMap(v=>v.decisionIds??(v.decisionId?[v.decisionId]:[])))];
 const policy=[fact('version','Policy version',r.versions.policy),...ids.flatMap(id=>{const d=s.rows.find(row=>row.id===id);return [fact('decision:'+id,'Row decision ID',id, d?link('pools',{pool:r.poolId,tab:'access',rows:d.objectId,rowDecisionId:id}):undefined,true),fact('sequence:'+id,'Row decision sequence',d?.sequence),fact('expression:'+id,'Recorded row rule',d?.expression)];}),...(!ids.length?[fact('rowDecisions','Row decision IDs',null)]:[]),fact('columnDecisions','Column decision IDs',null),fact('limits','Query limits snapshot',s.limits===null?null:JSON.stringify(s.limits))];
 const sources=[fact('engine','Engine identity',null),...r.sources.map(v=>fact('source:'+v.id,'Source ID',v.id,link('data',{source:v.id,tab:'sources'}),true)),...r.objects.flatMap((o,i)=>[fact('alias:'+i,'Recorded source alias',o.catalog),fact('object:'+i,'Recorded object',[o.catalog,o.schema,o.name].join('.'))]),...r.elements.map((e,i)=>fact('column:'+i,e.exposedName,e.treatment??e.state)),fact('contributor','Contributor key at request time',null),fact('floor','Aggregate group-size floor',s.floor)];
 const execution=[fact('outcome','Outcome',r.completedAt===null?null:['answered','reduced'].includes(r.status)?'served':r.status),fact('code','Refusal code',r.refusalCode),fact('cause','Refusal cause',s.cause),fact('rows','Rows returned',r.rowCount),fact('latency','Latency (ms)',r.latencyMs),fact('sql','SQL (subject to evidence visibility)',r.request)];
 const custody=s.grants.flatMap(g=>[fact('grant:'+g.id,'Grant ID',g.id,link('activity',{provenance:g.id}),true),fact('columns:'+g.id,'Custody columns',g.columns?.join(', ')),fact('issued:'+g.id,'Issued',g.issued),fact('expires:'+g.id,'Expires',g.expires),fact('state:'+g.id,'Release state',g.state),fact('redeemed:'+g.id,'Opintel share released at',g.redeemed)]);
 if(!custody.length)custody.push(fact('grants','Custody grants',null));
 else custody.push(fact('meaning','Meaning of redeemed',releaseEvidenceMeaning));
 // Redaction events can happen later during retention. Their absence does not
// prove that the write-time policy was "none"; never infer it from stored SQL.
 const evidence=[fact('receipt','Receipt ID',r.id,undefined,true),fact('retention','Retention class',r.recordKind),fact('writeRedaction','Redaction policy at write time',null)];
 return Provenance.parse({receiptId:r.id,projectId:r.projectId,startedAt:r.startedAt,steps:[step('request','Request',request),step('policy','Policy applied',policy),step('sources','Sources',sources),step('execution','Execution',execution),step('custody','Custody',custody),step('evidence','Evidence',evidence)]});
}
