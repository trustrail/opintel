import { withTenant,withPlatform,type Tx } from '../../../platform/db/scope.js';
import { DeploymentRef,SourceListItem, type NewSource } from '../../../shared/api/source-schemas.js';
import { schemaSpecSchema,generatorSpecSchema } from '../../../shared/demo-contract.js';
import { DomainError,DemoSourceId,err,ok,type IndustryId,type SourceId,type RunId } from '../../../shared/kernel/index.js';
import type { SourceContext,SourceRegistrationRepository,QueuedSource } from '../application/source-registration.js';
const selection=`SELECT s.id,s.name,s.kind,s.origin,CASE WHEN (SELECT r.state FROM introspection_run r WHERE r.source_id=s.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) IN ('failed','cancelled') THEN 'introspection_failed' WHEN (SELECT r.state FROM introspection_run r WHERE r.source_id=s.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) IN ('queued','connecting','reading','diffing') THEN 'pending' ELSE s.status END AS status,s.landing_strategy AS "landingStrategy",
 (SELECT r.error FROM introspection_run r WHERE r.source_id=s.id ORDER BY r.created_at DESC,r.id DESC LIMIT 1) AS error,
 CASE WHEN s.receives_landings THEN (SELECT count(*)::int FROM arrival_notice a WHERE a.source_id=s.id) ELSE NULL END AS "filingCount",
 (SELECT count(*)::int FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id WHERE o.source_id=s.id AND o.status='active' AND e.status='active') AS "elementCount",
 to_char(s.last_introspected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastIntrospectedAt" FROM data_source s`;
function item(row:Record<string,unknown>){return SourceListItem.parse({...row,undecidedCount:row.elementCount});}
export class PostgresSourceRegistrationRepository implements SourceRegistrationRepository {
 list(ctx:SourceContext,after:SourceId|null,limit:number){return withTenant(ctx,async tx=>ok((await tx.query<Record<string,unknown>>(`${selection} WHERE ($1::uuid IS NULL OR s.id>$1) ORDER BY s.id LIMIT $2`,[after,limit])).map(item)));}
 private async pack(ctx:SourceContext){return withPlatform(async tx=>{const [project]=await tx.query<{industry_id:string}>('SELECT industry_id FROM project WHERE id=$1',[ctx.projectId]);return project?.industry_id;});}
 async templates(ctx:SourceContext,industryId:IndustryId){
  const industry=await this.pack(ctx);if(!industry||industry!==industryId)return err(new DomainError('not_found','Project not found.'));
  const rows=await withPlatform(tx=>tx.query<{id:string;name:string;narrative:string|null;deployment_ref:unknown}>('SELECT id,name,narrative,deployment_ref FROM demo_source_template WHERE industry_id=$1 AND active ORDER BY name,id',[industry]));
  const connected=await withTenant(ctx,tx=>tx.query<{demo_template_id:string}>('SELECT demo_template_id FROM data_source WHERE origin=\'demo\''));
  return ok(rows.map(row=>({id:DemoSourceId(row.id),name:row.name,narrative:row.narrative,prepared:DeploymentRef.parse(row.deployment_ref)[ctx.projectId]!==undefined,connected:connected.some(source=>source.demo_template_id===row.id)})));
 }
 async template(ctx:SourceContext,id:DemoSourceId){
  const industry=await this.pack(ctx);
  const [row]=await withPlatform(tx=>tx.query<{id:string;schema_spec:unknown;generator_spec:unknown;deployment_ref:unknown}>('SELECT id,schema_spec,generator_spec,deployment_ref FROM demo_source_template WHERE id=$1 AND industry_id=$2 AND active',[id,industry??null]));
  return row?ok({id:DemoSourceId(row.id),schemaSpec:schemaSpecSchema.parse(row.schema_spec),generatorSpec:generatorSpecSchema.parse(row.generator_spec),deployment:DeploymentRef.parse(row.deployment_ref)[ctx.projectId]??null}):err(new DomainError('not_found','This demo template does not belong to the project industry.'));
 }
 async create(ctx:SourceContext,id:SourceId,runId:RunId,input:NewSource,templateId:DemoSourceId|null){
  try{return await withTenant(ctx,async tx=>{
   const inserted=await tx.query<{id:string}>(`INSERT INTO data_source(id,project_id,name,kind,origin,demo_template_id,credential_ref,sampling_consent,receives_landings,landing_strategy) VALUES($1,$2,$3,'postgres',$4,$5,$6,$7,$8,$9) ${templateId?'ON CONFLICT(id) DO NOTHING':''} RETURNING id`,[id,ctx.projectId,input.name,templateId?'demo':'customer',templateId,input.credentialRef,input.samplingConsent,input.receivesLandings,input.landingStrategy]);
   if(!inserted.length){
    const [existing]=await tx.query<{origin:string;demo_template_id:string|null;credential_ref:string;name:string;status:string;receives_landings:boolean;landing_strategy:string}>('SELECT origin,demo_template_id,credential_ref,name,status,receives_landings,landing_strategy FROM data_source WHERE id=$1 FOR UPDATE',[id]);
    if(!existing||existing.origin!=='demo'||existing.demo_template_id!==templateId||existing.credential_ref!==input.credentialRef||existing.name!==input.name||!existing.receives_landings||existing.landing_strategy!==input.landingStrategy)
     return err(new DomainError('conflict','The reserved source does not match this demo preparation. Ask the deployment operator to restore its original preparation before retrying.'));
    if(existing.status==='archived')return err(new DomainError('conflict','An archived source cannot be provisioned.'));
    const [latest]=await tx.query<{state:string}>('SELECT state FROM introspection_run WHERE source_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[id]);
    if(!latest||latest.state==='failed'||latest.state==='cancelled')await this.enqueueRetry(tx,ctx,id,runId);
    const [row]=await tx.query<Record<string,unknown>>(`${selection} WHERE s.id=$1`,[id]);return ok({source:item(row!),created:false});
   }
   await tx.query(`INSERT INTO introspection_run(id,source_id,project_id,include_schemas,progress) VALUES($1,$2,$3,$4,$5::jsonb)`,[runId,id,ctx.projectId,input.includeSchemas,JSON.stringify({phase:'queued',userId:ctx.userId,samplingConsent:input.samplingConsent})]);
   const [row]=await tx.query<Record<string,unknown>>(`${selection} WHERE s.id=$1`,[id]);return ok({source:item(row!),created:true});
  });}catch(error){if(error instanceof Error&&'code'in error&&error.code==='23505')return err(new DomainError('conflict','A source with this name or reserved ID is already connected.'));throw error;}
 }
 private async enqueueRetry(tx:Tx,ctx:SourceContext,id:SourceId,runId:RunId){
  const [latest]=await tx.query<{include_schemas:string[]}>('SELECT include_schemas FROM introspection_run WHERE source_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[id]);
  const [source]=await tx.query<{sampling_consent:boolean;origin:string;name:string}>('SELECT sampling_consent,origin,name FROM data_source WHERE id=$1',[id]);
  await tx.query(`INSERT INTO introspection_run(id,source_id,project_id,include_schemas,progress) VALUES($1,$2,$3,$4,$5::jsonb)`,[runId,id,ctx.projectId,latest?.include_schemas??(source!.origin==='demo'?[source!.name]:[]),JSON.stringify({phase:'queued',userId:ctx.userId,samplingConsent:source!.sampling_consent})]);
 }
 async retry(ctx:SourceContext,id:SourceId,runId:RunId){return withTenant(ctx,async tx=>{
  const [source]=await tx.query<{status:string}>('SELECT status FROM data_source WHERE id=$1 FOR UPDATE',[id]);
  if(!source)return err(new DomainError('not_found','The source was not found in this project.'));
  if(source.status==='archived')return err(new DomainError('conflict','An archived source cannot be introspected.'));
  const active=await tx.query("SELECT id FROM introspection_run WHERE source_id=$1 AND state IN ('queued','connecting','reading','diffing')",[id]);
  if(active.length)return err(new DomainError('conflict','This source already has an active introspection run. Wait for it to finish before retrying.'));
  await this.enqueueRetry(tx,ctx,id,runId);
  const [row]=await tx.query<Record<string,unknown>>(`${selection} WHERE s.id=$1`,[id]);return ok(item(row!));
 });}
 queued(ctx:SourceContext){return withTenant(ctx,tx=>tx.query<QueuedSource>(`SELECT r.id AS "runId",s.id AS "sourceId",(r.progress->>'userId') AS "userId",s.demo_template_id AS "templateId" FROM introspection_run r JOIN data_source s ON s.id=r.source_id WHERE r.state='queued' AND r.progress ? 'userId'`,[]));}
 settledFilings(ctx:SourceContext,id:SourceId){return withTenant(ctx,async tx=>{const [row]=await tx.query<{count:number}>(`SELECT count(*)::int AS count FROM arrival_notice WHERE source_id=$1 AND payload->>'outcome' IN ('landed','quarantined','duplicate')`,[id]);return row!.count;});}
}
