import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {migrationDatabase} from './fixtures/migration-database.js';
const owner=migrationDatabase();
 // Migration round trips are functional; this hang guard allows for growth of the migration chain.
it('072 seeded up/down/up preserves keys, aliases, entitlements and a legacy retiring alias; independent identities block downgrade',async()=>{
 const db=owner(),up=await readFile('migrations/072_pool_credentials.up.sql','utf8'),down=await readFile('migrations/072_pool_credentials.down.sql','utf8');await db.query('BEGIN');
 try{
  await db.query(await readFile('migrations/073_credential_lifecycle_guards.down.sql','utf8'));
  await db.query(down);
  const user=randomUUID(),project=randomUUID(),pool=randomUUID(),current=randomUUID(),retiring=randomUUID();
  await db.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[user,`${user}@example.com`]);
  const company=await db.query("INSERT INTO company(name,default_region) VALUES('Credential migration','eu-west-1') RETURNING id"),industry=await db.query('SELECT id FROM industry LIMIT 1');
  await db.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$2,$3,'Migration','eu-west-1')",[project,company.rows[0].id,industry.rows[0].id]);
  await db.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Existing pool')",[pool,project]);
  for(const [id,state,n] of [[current,'current',1],[retiring,'retiring',2]] as const)await db.query("INSERT INTO pool_key(id,pool_id,project_id,key_hash,key_prefix,state,grace_until,created_by) VALUES($1,$2,$3,$4,'opk_live_legacy',$5,CASE WHEN $5='retiring' THEN now()+interval '1 day' END,$6)",[id,pool,project,Buffer.alloc(32,n),state,user]);
  const source=randomUUID(),object=randomUUID(),element=randomUUID();
  await db.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref) VALUES($1,$2,'Source','source','postgres','secret://test/migration')",[source,project]);
  await db.query("INSERT INTO catalog_object(id,project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,$3,'public','records','table','public','records')",[object,project,source]);
  await db.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type) VALUES($1,$2,$3,'value','text','value','VARCHAR')",[element,project,object]);
  await db.query("INSERT INTO entitlement(project_id,pool_id,element_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[project,pool,element,user]);
  const entitlements=(await db.query('SELECT * FROM entitlement')).rows;
  const before=(await db.query('SELECT * FROM pool_key ORDER BY id')).rows;
  await db.query(up);
  expect((await db.query('SELECT id,label,custody_alias FROM pool_credential WHERE pool_id=$1',[pool])).rows).toEqual([{id:current,label:'Existing pool',custody_alias:`agent:${project}:${current}`}]);
  const after=(await db.query('SELECT * FROM pool_key ORDER BY id')).rows;expect(after.map(({credential_id,alias_retired_at,...key})=>key)).toEqual(before);expect(after.every(key=>key.credential_id===current)).toBe(true);
  expect((await db.query('SELECT * FROM entitlement')).rows).toEqual(entitlements);
  await db.query(down);expect((await db.query('SELECT * FROM pool_key ORDER BY id')).rows).toEqual(before);expect((await db.query('SELECT * FROM entitlement')).rows).toEqual(entitlements);await db.query(up);
  await db.query('SAVEPOINT independent');await db.query("INSERT INTO pool_credential(pool_id,project_id,label,custody_alias) VALUES($1,$2,'Second agent','filled by trigger')",[pool,project]);
  await expect(db.query(down)).rejects.toMatchObject({code:'P0001'});await db.query('ROLLBACK TO SAVEPOINT independent');
 }finally{await db.query('ROLLBACK');}
},60_000);
