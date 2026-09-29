import {it,expect} from 'vitest';
import {Client} from 'pg';
import {readFile} from 'node:fs/promises';
import {policyFixture} from './fixtures/policy-version/fixture.js';
it('5.16 migrations down/up preserve existing discovery behaviour and leave the database column default unchanged',async()=>{
 const f=await policyFixture(0),client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
 try{await client.query('BEGIN');await client.query(await readFile('migrations/051_settings_rename.down.sql','utf8'));await client.query(await readFile('migrations/050_settings.down.sql','utf8'));await client.query('UPDATE project SET settings=$2 WHERE id=$1',[f.ctx.projectId,{}]);await client.query(await readFile('migrations/050_settings.up.sql','utf8'));await client.query(await readFile('migrations/051_settings_rename.up.sql','utf8'));
 const {rows:[row]}=await client.query<{settings:Record<string,unknown>}>('SELECT settings FROM project WHERE id=$1',[f.ctx.projectId]);expect(row?.settings.discovery).toEqual({newElements:'rules_only',typeFamilyChange:'revert',renameHandling:'carry',adoptRenamedNames:false,valueSampling:false});
 const {rows:[next]}=await client.query<{settings:unknown}>("INSERT INTO project(company_id,industry_id,name,region) SELECT company_id,industry_id,'After settings migration',region FROM project WHERE id=$1 RETURNING settings",[f.ctx.projectId]);expect(next?.settings).toEqual({});
 }finally{await client.query('ROLLBACK');await client.end();}
});
