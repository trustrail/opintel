import {Client} from 'pg';
import {readFile} from 'node:fs/promises';
import {it,expect} from 'vitest';
it('5.18 migration down/up preserves provider rows, defaults scope to existing behavior, and never backfills proof',async()=>{
 const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{await client.query('BEGIN');await client.query(await readFile('migrations/055_sso_enforcement_proof.down.sql','utf8'));
 const {rows:[company]}=await client.query("INSERT INTO company(name,default_region) VALUES('Migration SSO','eu-west-1') RETURNING id");
 const {rows:[idp]}=await client.query("INSERT INTO company_idp(company_id,provider,display_name,issuer,client_id,client_secret_ref) VALUES($1,'oidc:generic','SSO','https://idp.example','client','secret://test') RETURNING id",[company.id]);
 await client.query(await readFile('migrations/055_sso_enforcement_proof.up.sql','utf8'));
 const {rows:[after]}=await client.query('SELECT id,scope,configuration_version FROM company_idp WHERE id=$1',[idp.id]);expect(after).toMatchObject({id:idp.id,scope:'openid email profile',configuration_version:expect.any(String)});
 expect((await client.query('SELECT * FROM company_idp_sign_in WHERE idp_id=$1',[idp.id])).rows).toEqual([]);
 }finally{await client.query('ROLLBACK');await client.end();}
});
