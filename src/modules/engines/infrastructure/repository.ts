import {z} from 'zod';
import {createHash,randomUUID} from 'node:crypto';
import {withTenant} from '../../../platform/db/scope.js';
import {EngineId,DomainError,err,ok,type SourceId} from '../../../shared/kernel/index.js';
import {EngineView,type EngineRegistration} from '../../../shared/api/engines.js';
import type {EngineContext,EngineRepository,EngineRecord,EngineRoute} from '../application/registry.js';
const columns=`id,registration_version AS "registrationVersion",name,address,certificate_pin AS "certificatePin",contract_version AS "contractVersion",to_char(verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "verifiedAt",to_char(last_seen_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastSeenAt",health,health_message AS "healthMessage",custody`;
const record=(r:unknown):EngineRecord=>EngineView.omit({sources:true}).extend({registrationVersion:z.number().int().positive()}).parse(r);
export class PostgresEngineRepository implements EngineRepository {
 heartbeat(ctx:EngineContext,value:EngineRecord){return withTenant(ctx,async tx=>{
  const id=value.id;
  const [engine]=await tx.query<{at:string|null;applied:string|null;record:unknown}>(`SELECT to_char(egress_heartbeat_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at,egress_applied_version AS applied,(SELECT row_to_json(r) FROM (SELECT ${columns}) r) AS record FROM engine WHERE id=$1 AND address=$2 AND certificate_pin=$3 AND name=$4 AND registration_version=$5 AND verified_at IS NOT NULL AND health='healthy' AND contract_version=3`,[id,value.address,value.certificatePin,value.name,value.registrationVersion]);
  const assignments=await tx.query<{sourceId:string;credentialRef:string}>(`SELECT id AS "sourceId",credential_ref AS "credentialRef" FROM data_source WHERE engine_id=$1 AND status<>'archived' ORDER BY id`,[id]);
  const version=createHash('sha256').update(JSON.stringify({projectId:ctx.projectId,engineId:id,assignments})).digest('hex');
  return {at:engine?.at??null,policyCurrent:!!engine&&engine.applied===version,record:engine?record(engine.record):null};
 });}
 routes(ctx:EngineContext,ids:readonly SourceId[]){return withTenant(ctx,async tx=>{
  const rows=await tx.query<{id:SourceId;name:string;engine:unknown}>(`SELECT s.id,s.name,CASE WHEN e.id IS NULL THEN NULL ELSE to_jsonb(e) END AS engine FROM data_source s LEFT JOIN (SELECT ${columns} FROM engine) e ON e.id=s.engine_id WHERE s.id=ANY($1::uuid[])`,[ids]);
  return rows.map((r):EngineRoute=>({...r,engine:r.engine===null?null:record(r.engine)}));
 });}
 update(ctx:EngineContext,id:EngineId,input:EngineRegistration){return withTenant(ctx,async tx=>{const rows=await tx.query("UPDATE engine SET name=$2,address=$3,certificate_pin=$4,registration_version=registration_version+1,verified_at=NULL,contract_version=NULL,health='unverified',health_message=NULL WHERE id=$1 RETURNING id",[id,input.name,input.address,input.certificatePin]);return rows.length?ok(undefined):err(new DomainError('not_found','Engine not found in this project.'));});}
 async register(ctx:EngineContext,input:EngineRegistration){try{return await withTenant(ctx,async tx=>{const [r]=await tx.query(`INSERT INTO engine(id,project_id,name,address,certificate_pin) VALUES($1,$2,$3,$4,$5) RETURNING ${columns}`,[randomUUID(),ctx.projectId,input.name,input.address,input.certificatePin]);return ok(record(r));});}catch(e){if(e instanceof Error&&'code'in e&&e.code==='23505')return err(new DomainError('conflict','This engine address is already registered in the project.'));throw e;}}
 get(ctx:EngineContext,id:EngineId){return withTenant(ctx,async tx=>{const [r]=await tx.query(`SELECT ${columns} FROM engine WHERE id=$1`,[id]);return r?ok(record(r)):err(new DomainError('not_found','Engine not found in this project.'));});}
 list(ctx:EngineContext,after:EngineId|null,limit:number){return withTenant(ctx,async tx=>(await tx.query(`SELECT ${columns},COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) ORDER BY s.name,s.id) FROM data_source s WHERE s.engine_id=engine.id AND s.status<>'archived'),'[]'::jsonb) AS sources FROM engine WHERE ($1::uuid IS NULL OR id>$1) ORDER BY id LIMIT $2`,[after,limit])).map(r=>EngineView.parse(r)));}
 health(ctx:EngineContext,id:EngineId,v:{contractVersion:number|null;health:EngineView['health'];message:string|null;verified:boolean;address:string;certificatePin:string;name:string;registrationVersion:number}){return withTenant(ctx,async tx=>{const [updated]=await tx.query(`UPDATE engine SET contract_version=$2,health=$3,health_message=$4,last_seen_at=CASE WHEN $2::integer IS NULL THEN last_seen_at ELSE now() END,verified_at=CASE WHEN $5 THEN now() ELSE NULL END WHERE id=$1 AND address=$6 AND certificate_pin=$7 AND name=$8 AND registration_version=$9 RETURNING ${columns}`,[id,v.contractVersion,v.health,v.message,v.verified,v.address,v.certificatePin,v.name,v.registrationVersion]);return updated?ok(record(updated)):err(new DomainError('source_unavailable','Engine configuration changed during verification. Test its connection again.',{cause:'engine_registry'}));});}
 custody(ctx:EngineContext){return withTenant(ctx,async tx=>{const [r]=await tx.query(`SELECT ${columns} FROM engine WHERE custody`);return r?ok(record(r)):err(new DomainError('source_unavailable','This project has no designated custody engine. Designate a verified engine in Settings.'));});}
 designate(ctx:EngineContext,id:EngineId){return withTenant(ctx,async tx=>{await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,57))',[ctx.projectId]);const pending=await tx.query('SELECT id FROM token_key_operation WHERE completed_at IS NULL');if(pending.length)return err(new DomainError('conflict','Finish the pending custody operation before changing the custody engine.'));const target=await tx.query('SELECT id FROM engine WHERE id=$1 AND verified_at IS NOT NULL AND contract_version=3 FOR UPDATE',[id]);if(!target.length)return err(new DomainError('conflict','Engine verification changed; verify it again.'));await tx.query('UPDATE engine SET custody=false WHERE custody');await tx.query('UPDATE engine SET custody=true WHERE id=$1',[id]);return ok(undefined);});}
 source(ctx:EngineContext,id:SourceId){return withTenant(ctx,async tx=>{const [r]=await tx.query<{id:SourceId;name:string;engineId:EngineId|null;tokenized:boolean}>(`SELECT s.id,s.name,s.engine_id AS "engineId",EXISTS(SELECT 1 FROM entitlement t JOIN catalog_element e ON e.id=t.element_id JOIN catalog_object o ON o.id=e.object_id WHERE o.source_id=s.id AND t.treatment='tokenized') AS tokenized FROM data_source s WHERE s.id=$1`,[id]);return r?ok(r):err(new DomainError('not_found','Source not found in this project.'));});}
 assign(ctx:EngineContext,source:SourceId,id:EngineId){return withTenant(ctx,async tx=>{
  const [current]=await tx.query<{status:string;sampling_consent:boolean;origin:string;name:string}>('SELECT status,sampling_consent,origin,name FROM data_source WHERE id=$1 FOR UPDATE',[source]);
  if(!current||current.status==='archived')return err(new DomainError('conflict','An active source is required for assignment.'));
  const active=await tx.query<{id:string;state:string}>("SELECT id,state FROM introspection_run WHERE source_id=$1 AND state IN ('queued','connecting','reading','diffing')",[source]);
  if(active.some(run=>run.state!=='queued'))return err(new DomainError('conflict','Wait for the active introspection run to finish before assigning this source.'));
  const rows=await tx.query("UPDATE data_source SET engine_id=$2,egress_pending=true,status='pending_egress' WHERE id=$1 AND EXISTS(SELECT 1 FROM engine WHERE id=$2 AND verified_at IS NOT NULL AND contract_version=3) RETURNING id",[source,id]);
  if(!rows.length)return err(new DomainError('conflict','Source or verified engine not found in this project.'));
  // The normal worker consumes this same queued record after the policy acknowledgment.
  if(!active.length){
   const [latest]=await tx.query<{include_schemas:string[]}>('SELECT include_schemas FROM introspection_run WHERE source_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1',[source]);
   await tx.query('INSERT INTO introspection_run(id,source_id,project_id,include_schemas,progress) VALUES($1,$2,$3,$4,$5::jsonb)',[randomUUID(),source,ctx.projectId,latest?.include_schemas??(current.origin==='demo'?[current.name]:[]),JSON.stringify({phase:'queued',userId:ctx.userId,samplingConsent:current.sampling_consent})]);
  }
  return ok(undefined);
 });}
 key(ctx:EngineContext){return withTenant(ctx,async tx=>{const [r]=await tx.query<{version:number;sentinel:string}>("SELECT version,sentinel_token AS sentinel FROM token_key_version WHERE state='current'");return r??null;});}
}
