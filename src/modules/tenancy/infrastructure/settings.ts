import {checkSsoEnforcement} from '../../identity/index.js';
import {withPlatform,withTenant} from '../../../platform/db/scope.js';
import {ok,err,DomainError,type ProjectId,type CompanyId,type UserId} from '../../../shared/kernel/index.js';
import {CompanySettingsView,PersonalSettingsView,ProjectSettingsView} from '../../../shared/api/settings.js';
import type {SettingsRepository} from '../application/settings.js';
const companySelect=`SELECT id,name,default_industry_id AS "defaultIndustryId",default_region AS "defaultRegion",allowed_domains AS "allowedDomains",idle_timeout_mins AS "idleTimeoutMins",sso_enforced AS "ssoEnforced",COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'displayName',i.display_name) ORDER BY i.id) FROM company_idp i WHERE i.company_id=company.id AND i.enabled),'[]') AS "enabledProviders" FROM company WHERE id=$1`;
const personalSelect=`SELECT email,full_name AS "fullName",timezone,date_format AS "dateFormat",reduced_motion AS "reducedMotion" FROM user_account WHERE id=$1`;
const missing=()=>err(new DomainError('not_found','The settings could not be found.'));
export class PostgresSettings implements SettingsRepository{
 project(id:ProjectId){return withPlatform(async tx=>{const [row]=await tx.query('SELECT settings FROM project WHERE id=$1',[id]);return row?ok(ProjectSettingsView.parse(row)):missing();});}
 async saveProject(id:ProjectId,actor:UserId,settings:Parameters<SettingsRepository['saveProject']>[2]){
 return withTenant({projectId:id,userId:actor},async tx=>{const [row]=await tx.query<{settings:unknown}>('SELECT save_project_settings($1) AS settings',[settings]);return ok(ProjectSettingsView.parse(row));});}

 company(id:CompanyId){return withPlatform(async tx=>{const [row]=await tx.query(companySelect,[id]);return row?ok(CompanySettingsView.parse(row)):missing();});}
 async saveCompany(id:CompanyId,actor:UserId,value:Parameters<SettingsRepository['saveCompany']>[2]){
 try{return await withPlatform(async tx=>{const [before]=await tx.query(companySelect+' FOR UPDATE',[id]);if(!before)return missing();
 if(value.ssoEnforced&&!CompanySettingsView.parse(before).ssoEnforced){
  const allowed=await checkSsoEnforcement(tx,id,actor);
  if(!allowed.ok){await tx.query("INSERT INTO audit_entry(company_id,actor_id,actor_kind,action,target,after) VALUES($1,$2,'user','SsoEnforcementRefused',$3,$4)",[id,actor,{companyId:id},{reason:allowed.error.message}]);return allowed;}
 }
 await tx.query('UPDATE company SET name=$2,default_industry_id=$3,default_region=$4,allowed_domains=$5,idle_timeout_mins=$6,sso_enforced=$7 WHERE id=$1',[id,value.name,value.defaultIndustryId,value.defaultRegion,value.allowedDomains,value.idleTimeoutMins,value.ssoEnforced]);
 await tx.query("INSERT INTO audit_entry(company_id,actor_id,actor_kind,action,target,before,after) VALUES($1,$2,'user','CompanySettingsChanged',$3,$4,$5)",[id,actor,{companyId:id},before,value]);const [after]=await tx.query(companySelect,[id]);return ok(CompanySettingsView.parse(after));});}catch(e){if(typeof e==='object'&&e!==null&&'constraint' in e&&e.constraint==='company_sso_one_enabled_idp')return err(new DomainError('conflict','Enforced SSO requires exactly one enabled company identity provider. Configure one provider before enabling SSO.'));throw e;}}
 personal(actor:UserId){return withPlatform(async tx=>{const [row]=await tx.query(personalSelect,[actor]);return row?ok(PersonalSettingsView.parse(row)):missing();});}
 savePersonal(actor:UserId,value:Parameters<SettingsRepository['savePersonal']>[1]){return withPlatform(async tx=>{const [before]=await tx.query(personalSelect+' FOR UPDATE',[actor]);if(!before)return missing();await tx.query('UPDATE user_account SET full_name=$2,timezone=$3,date_format=$4,reduced_motion=$5 WHERE id=$1',[actor,value.fullName,value.timezone,value.dateFormat,value.reducedMotion]);await tx.query("INSERT INTO audit_entry(actor_id,actor_kind,action,target,before,after) VALUES($1,'user','PersonalSettingsChanged',$2,$3,$4)",[actor,{userId:actor},before,value]);const [after]=await tx.query(personalSelect,[actor]);return ok(PersonalSettingsView.parse(after));});}
}
