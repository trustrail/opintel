import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {withTenant} from '../../../platform/db/scope.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import {EvidenceExportDescriptor,type ExportCommand} from '../../../shared/api/evidence-export.js';
import type {EvidenceContext,EvidencePosition} from '../application/read.js';
import type {ExportId,ExportRepository} from '../application/export.js';
import {columns,childColumns,time,detailRecord} from './read.js';
const descriptorColumns=`id,project_id AS "projectId",format,filters,${time('created_at')} AS "createdAt"`;
const missing=()=>err(new DomainError('not_found','This export was not found in this project.'));
export class PostgresEvidenceExports implements ExportRepository {
 async create(ctx:EvidenceContext,command:ExportCommand,key:string){
  const hash=createHash('sha256').update(JSON.stringify(command)).digest('hex');
  return withTenant(ctx,async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['evidence-export',ctx.projectId,ctx.userId,key])]);
   const [prior]=await tx.query<{body_hash:string;export_id:string}>('SELECT body_hash,export_id FROM evidence_export_request WHERE request_key=$1 AND expires_at>clock_timestamp()',[key]);
   if(prior){if(prior.body_hash!==hash)return err(new DomainError('idempotency_key_reused','This Idempotency-Key was used with a different evidence export.'));const [row]=await tx.query(`SELECT ${descriptorColumns} FROM evidence_export WHERE id=$1`,[prior.export_id]);return ok(EvidenceExportDescriptor.parse(row));}
   const [row]=await tx.query(`INSERT INTO evidence_export(project_id,actor_id,format,filters,signing_key) VALUES($1,$2,$3,$4,$5) RETURNING ${descriptorColumns}`,[ctx.projectId,ctx.userId,command.format,command.filters,randomBytes(32).toString('hex')]);
   const descriptor=EvidenceExportDescriptor.parse(row);
   await tx.query("INSERT INTO evidence_export_request(project_id,actor_id,request_key,body_hash,export_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id,actor_id,request_key) DO UPDATE SET body_hash=excluded.body_hash,export_id=excluded.export_id,expires_at=clock_timestamp()+interval '24 hours'",[ctx.projectId,ctx.userId,key,hash,descriptor.id]);
   return ok(descriptor);
  });
 }
 async find(ctx:EvidenceContext,id:ExportId){const [row]=await withTenant(ctx,tx=>tx.query(`SELECT ${descriptorColumns} FROM evidence_export WHERE id=$1`,[id]));return row?ok(EvidenceExportDescriptor.parse(row)):missing();}
 private async signature(ctx:EvidenceContext,id:ExportId,expires:number){
  const [row]=await withTenant(ctx,tx=>tx.query<{signing_key:string}>('SELECT signing_key FROM evidence_export WHERE id=$1',[id]));
  return row?ok(createHmac('sha256',Buffer.from(row.signing_key,'hex')).update(JSON.stringify([ctx.projectId,ctx.userId,id,expires])).digest('hex')):missing();
 }
 async link(ctx:EvidenceContext,id:ExportId){const expires=Date.now()+15*60*1000,result=await this.signature(ctx,id,expires);return result.ok?ok({signature:result.value,expires}):result;}
 async verify(ctx:EvidenceContext,id:ExportId,signature:string,expires:number){
  if(expires<=Date.now())return err(new DomainError('forbidden','This download link has expired. Request a fresh link from the export status endpoint.'));
  const expected=await this.signature(ctx,id,expires);if(!expected.ok)return expected;
  const a=Buffer.from(expected.value,'hex'),b=Buffer.from(signature,'hex');return a.length===b.length&&timingSafeEqual(a,b)?ok(undefined):err(new DomainError('forbidden','This export download signature is invalid.'));
 }
 async page(ctx:EvidenceContext,descriptor:EvidenceExportDescriptor,after:EvidencePosition|null,limit:number){
  const params:unknown[]=[ctx.projectId,descriptor.createdAt];const where=['r.project_id=$1','r.started_at<=$2::timestamptz','c.synthetic IS DISTINCT FROM TRUE'];
  const add=(sql:string,value:unknown)=>{params.push(value);where.push(sql.replace('?',`$${params.length}`));};const f=descriptor.filters;
  if(f.poolId)add('r.pool_id=?',f.poolId);if(f.agentId)add('r.agent_id=?',f.agentId);if(f.mode)add('r.mode=?',f.mode);
  if(f.from)add('r.started_at>=?::timestamptz',f.from);if(f.to)add('r.started_at<?::timestamptz',f.to);
  if(f.outcome)add("COALESCE(c.outcome->>'kind','incomplete')=?",f.outcome);
  if(f.elementId)add('EXISTS(SELECT 1 FROM run_element e WHERE e.run_id=r.id AND e.started_at=r.started_at AND e.element_id=?)',f.elementId);
  if(after){params.push(after.at,after.id);where.push(`(r.started_at,r.id)<($${params.length-1}::timestamptz,$${params.length}::uuid)`);}params.push(limit);
  const rows=await withTenant(ctx,tx=>tx.query<Record<string,unknown>>(`SELECT ${columns},${time('c.completed_at')} AS "completedAt",c.token_key_version_used AS "tokenKeyVersionUsed",(c.outcome->>'truncated')::boolean AS truncated,c.outcome->>'code' AS "refusalCode",c.generated_sql AS "generatedSql",c.freshness,c.source_plan AS "sourcePlan",
   ${childColumns}
   FROM evidence_run_read r LEFT JOIN evidence_completion_read c ON c.run_id=r.id AND c.started_at=r.started_at WHERE ${where.join(' AND ')} ORDER BY r.started_at DESC,r.id DESC LIMIT $${params.length}`,params));
  return ok(rows.map(detailRecord));
 }
}
