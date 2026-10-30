import {it,expect} from 'vitest';
import {migrationDatabase} from './fixtures/migration-database.js';
import {migrateDown,migrateUp} from '../src/platform/db/migrate.js';
const connection=migrationDatabase();
it('first-run helper is narrowly granted and reversible without changing engine grants or evidence',async()=>{
 const db=connection(),signature='public.first_run_paired_engines(uuid,uuid,uuid,jsonb,text)';
 const fn=(await db.query("SELECT prosecdef,proconfig,has_function_privilege('opintel_platform',$1,'execute') AS platform,has_function_privilege('opintel_app',$1,'execute') AS tenant,NOT EXISTS(SELECT 1 FROM aclexplode(proacl) a WHERE a.grantee=0) AS public_blocked FROM pg_proc WHERE oid=$1::regprocedure",[signature])).rows[0];expect(fn).toMatchObject({prosecdef:true,platform:true,tenant:false,public_blocked:true});expect(fn.proconfig.join(' ')).toContain('pg_catalog, pg_temp');
 expect((await db.query("SELECT has_table_privilege('opintel_platform','engine','select') AS allowed")).rows[0].allowed).toBe(false);
 await migrateDown(db);await migrateDown(db);expect((await db.query('SELECT to_regprocedure($1) AS fn',[signature])).rows[0].fn).toBeNull();await migrateUp(db);
});
