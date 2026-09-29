import {z} from 'zod';
import {defineRoute,errorEnvelopeSchema} from '../../../platform/http/index.js';
import {ProjectId} from '../../../shared/kernel/index.js';
import {CreateEvidenceExport,EvidenceExportDescriptor,EvidenceExportStatus,ExportScope,ExportDownloadQuery} from '../../../shared/api/evidence-export.js';
import {ExportId,csvHeader,encodeEvidence,type EvidenceExportService} from '../application/export.js';
const headers={'Cache-Control':'no-store','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'};
export function evidenceExportRoutes(service:EvidenceExportService){return [
 defineRoute({method:'POST',path:'/api/v1/projects/:id/exports',params:z.object({id:z.uuid()}),request:CreateEvidenceExport,permission:{resource:'project',id:r=>r.params.id,permission:'export_evidence'},response:z.union([EvidenceExportDescriptor,errorEnvelopeSchema]),handle:async r=>{
  const result=await service.create({projectId:ProjectId(r.params.id),userId:r.actor.id},r.body,r.headers['idempotency-key']);if(!result.ok)throw result.error;
  return {status:201,headers,body:result.value};
 }}),
 defineRoute({method:'GET',path:'/api/v1/exports/:id',params:z.object({id:ExportId}),query:ExportScope,request:z.undefined(),permission:{resource:'project',id:r=>r.query.projectId,permission:'export_evidence'},response:z.union([EvidenceExportStatus,errorEnvelopeSchema]),handle:async r=>{
  const result=await service.status({projectId:ProjectId(r.query.projectId),userId:r.actor.id},r.params.id);if(!result.ok)throw result.error;return {headers,body:result.value};
 }}),
 defineRoute({method:'GET',path:'/api/v1/exports/:id/download',params:z.object({id:ExportId}),query:ExportDownloadQuery,request:z.undefined(),permission:{resource:'project',id:r=>r.query.projectId,permission:'export_evidence'},response:z.string(),handle:async r=>{
  const ctx={projectId:ProjectId(r.query.projectId),userId:r.actor.id};const result=await service.download(ctx,r.params.id,r.query.signature,r.query.expires);if(!result.ok)throw result.error;const descriptor=result.value;
  return {headers:{...headers,'Content-Type':descriptor.format==='ndjson'?'application/x-ndjson; charset=utf-8':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="evidence-${descriptor.id}.${descriptor.format}"`},download:async(send,signal)=>{
   if(descriptor.format==='csv')await send(csvHeader());
   for await(const row of service.records(ctx,descriptor,signal)){if(!row.ok)throw row.error;await send(encodeEvidence(row.value,descriptor.format));}
  }};
 }}),
];}
