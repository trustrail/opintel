import {expect,it} from 'vitest';
import {migrationDatabase,migrateDownToVersion} from './fixtures/migration-database.js';
import {migrateUp,migrateDown} from '../src/platform/db/migrate.js';
const connection=migrationDatabase();
it('093 preserves existing recipient associations and leaves custody credentials unbound; ordinary credentials remain bearer-only',async()=>{
 const db=connection();await migrateDownToVersion(db,'092');
 const industry=(await db.query('SELECT id FROM industry LIMIT 1')).rows[0].id;
 const company=(await db.query("INSERT INTO company(name,default_region) VALUES('Binding migration','us-east-1') RETURNING id")).rows[0].id;
 const project=(await db.query("INSERT INTO project(company_id,name,industry_id,region) VALUES($1,'Binding',$2,'us-east-1') RETURNING id",[company,industry])).rows[0].id;
 const pool=(await db.query("INSERT INTO pool(project_id,name) VALUES($1,'Existing pool') RETURNING id",[project])).rows[0].id;
 const ordinary=(await db.query("INSERT INTO pool_credential(project_id,pool_id,label,custody_alias) VALUES($1,$2,'Ordinary','trigger') RETURNING id",[project,pool])).rows[0].id;
 const custody=(await db.query("INSERT INTO pool_credential(project_id,pool_id,label,custody_alias,certificate_id,device_name,recipient_identifier,identity_kind,association_status,association_recorded_at) VALUES($1,$2,'Custody','trigger',223,'Agent label','existing-xq-recipient','certificate','associated',now()) RETURNING id",[project,pool])).rows[0].id;
 const oldColumns='id,pool_id,project_id,label,custody_alias,certificate_id,device_name,recipient_identifier,identity_kind,association_status,association_recorded_at';
 const before=(await db.query(`SELECT ${oldColumns} FROM pool_credential ORDER BY id`)).rows;
 await migrateUp(db);
 expect((await db.query(`SELECT ${oldColumns} FROM pool_credential ORDER BY id`)).rows).toEqual(before);
 expect((await db.query('SELECT credential_kind,binding_status,certificate_fingerprint,bound_at,enrollment_recipient_identifier FROM pool_credential WHERE id=$1',[custody])).rows[0]).toEqual({credential_kind:'identity-bound',binding_status:'unbound',certificate_fingerprint:null,bound_at:null,enrollment_recipient_identifier:'existing-xq-recipient'});
 expect((await db.query('SELECT credential_kind,binding_status,enrollment_recipient_identifier FROM pool_credential WHERE id=$1',[ordinary])).rows[0]).toEqual({credential_kind:'bearer-only',binding_status:'unbound',enrollment_recipient_identifier:null});
 await migrateDown(db);
 expect((await db.query(`SELECT ${oldColumns} FROM pool_credential ORDER BY id`)).rows).toEqual(before);
 await migrateUp(db);
 expect((await db.query('SELECT enrollment_recipient_identifier FROM pool_credential WHERE id=$1',[custody])).rows[0].enrollment_recipient_identifier).toBe('existing-xq-recipient');
});
it('095 approval read is limited to the current tenant and remains reversible',async()=>{
 const db=connection();await migrateDownToVersion(db,'094');
 expect((await db.query("SELECT to_regprocedure('public.identity_binding_requires_approval()') AS f")).rows[0].f).toBeNull();
 await migrateUp(db);
 expect((await db.query("SELECT has_function_privilege('opintel_app','identity_binding_requires_approval()','EXECUTE') AS app,has_function_privilege('public','identity_binding_requires_approval()','EXECUTE') AS public")).rows[0]).toEqual({app:true,public:false});
 const industry=(await db.query('SELECT id FROM industry LIMIT 1')).rows[0].id,company=(await db.query("INSERT INTO company(name,default_region) VALUES('Approval isolation','us-east-1') RETURNING id")).rows[0].id;
 const first=(await db.query("INSERT INTO project(company_id,name,industry_id,region,settings) VALUES($1,'First',$2,'us-east-1','{\"approveIdentityBindings\":true}') RETURNING id",[company,industry])).rows[0].id;
 const second=(await db.query("INSERT INTO project(company_id,name,industry_id,region,settings) VALUES($1,'Second',$2,'us-east-1','{}') RETURNING id",[company,industry])).rows[0].id;
 await db.query('BEGIN');try{await db.query("SELECT set_config('app.user_id',gen_random_uuid()::text,true)");for(const [project,expected] of [[first,true],[second,false]]){await db.query("SELECT set_config('app.project_id',$1,true)",[project]);expect((await db.query('SELECT identity_binding_requires_approval() AS flag')).rows[0].flag).toBe(expected);}}finally{await db.query('ROLLBACK');}
});

it('096 keeps the custody guard on compatibility changes, not presence timestamps',async()=>{
 const db=connection();await migrateDownToVersion(db,'095');
 const trigger=async()=>(await db.query("SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgname='credential_custody_guard' AND NOT tgisinternal")).rows[0].definition;
 expect(await trigger()).not.toContain('UPDATE OF');await migrateUp(db);
 const definition=await trigger();expect(definition).toContain('UPDATE OF credential_kind, revoked_at, pool_id');expect(definition).not.toContain('last_used_at');
 await migrateDownToVersion(db,'095');expect(await trigger()).not.toContain('UPDATE OF');await migrateUp(db);expect(await trigger()).toContain('UPDATE OF credential_kind, revoked_at, pool_id');
});

it('097 qualifies custody guard tables and restores the previous function on downgrade',async()=>{
 const db=connection();await migrateDownToVersion(db,'096');
 const definition=async()=>(await db.query("SELECT pg_get_functiondef('public.enforce_credential_custody()'::regprocedure) AS definition")).rows[0].definition as string;
 expect(await definition()).toContain('FROM pool WHERE');
 await migrateUp(db);
 expect(await definition()).toContain('FROM public.pool WHERE');
 expect(await definition()).toContain('FROM public.entitlement WHERE');
 expect(await definition()).toContain('FROM public.pool_credential WHERE');
 await migrateDownToVersion(db,'096');expect(await definition()).toContain('FROM pool WHERE');
 await migrateUp(db);expect(await definition()).toContain('FROM public.pool WHERE');
});
