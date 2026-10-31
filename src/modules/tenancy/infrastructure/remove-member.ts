import {withPlatform} from '../../../platform/db/scope.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import type {ProjectGrantRemovalRepository} from '../application/remove-member.js';
import type {RelationshipOutbox} from '../application/relationship-outbox.js';
export class PostgresProjectGrantRemoval implements ProjectGrantRemovalRepository{
 constructor(private readonly outbox:RelationshipOutbox){}
 async remove(...[project,user,actor,write]:Parameters<ProjectGrantRemovalRepository['remove']>){
  return withPlatform(async tx=>{
   // Serialize removals in one project so concurrent requests cannot each
   // observe another remaining direct administrator and remove both.
   const [scope]=await tx.query<{company_id:string}>('SELECT company_id FROM project WHERE id=$1 FOR UPDATE',[project]);
   if(!scope)return err(new DomainError('not_found','This project was not found.'));
   const [membership]=await tx.query<{role:'admin'|'operator'|'viewer'}>('SELECT role FROM project_member WHERE project_id=$1 AND user_id=$2 FOR UPDATE',[project,user]);
   const company=await tx.query('SELECT user_id FROM company_member WHERE company_id=$1 AND user_id=$2 FOR SHARE',[scope.company_id,user]),companyAccessRemains=company.length>0;
   if(!membership)return ok({removed:false,companyAccessRemains});
   if(membership.role==='admin'&&!companyAccessRemains){
    const [count]=await tx.query<{count:number}>("SELECT count(*)::int AS count FROM project_member WHERE project_id=$1 AND role='admin'",[project]);
    if(count?.count===1)return err(new DomainError('conflict','Cannot remove the last direct project administrator without company access. Add another project administrator first.'));
   }
   // Hold pending grants before dispatchers can replay them. Process them in
   // order before the final deletion, preventing an older touch resurrecting
   // the grant after its removal. This follows invitation acceptance: the SQL
   // change commits only after authoritative SpiceDB writes have succeeded.
   const pending=await tx.query<{id:string;operation:'touch'|'delete'}>("SELECT id,operation FROM relationship_outbox WHERE resource_type='project' AND resource_id=$1 AND subject_type='user' AND subject_id=$2 AND relation=$3 AND written_at IS NULL ORDER BY id FOR UPDATE",[project,user,membership.role]);
   const relationship={resource:{type:'project' as const,id:project},relation:membership.role,subject:{type:'user' as const,id:user}};
   for(const entry of pending){const revision=await write({...relationship,operation:entry.operation});await this.outbox.markWritten(tx,BigInt(entry.id),revision);}
   const deletion={...relationship,operation:'delete' as const},id=await this.outbox.enqueue(tx,deletion),revision=await write(deletion);
   await this.outbox.markWritten(tx,id,revision);
   await tx.query('DELETE FROM project_member WHERE project_id=$1 AND user_id=$2',[project,user]);
   await tx.query("INSERT INTO audit_entry(company_id,actor_id,actor_kind,action,target,before,after,revision) VALUES($1,$2,'user','ProjectGrantRemoved',$3,$4,$5,$6)",[scope.company_id,actor,{userId:user,projectId:project},{role:membership.role},{directGrant:false,companyAccessRemains},revision]);
   return ok({removed:true,companyAccessRemains});
  });
 }
}
