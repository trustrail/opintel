import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {it,expect,afterEach} from 'vitest';
import {withTenant} from '../src/platform/db/scope.js';
import {queryFixture} from './fixtures/query/fixture.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {PostgresElementDeclarations} from '../src/modules/catalog/index.js';
import {ok} from '../src/shared/kernel/index.js';

const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();});
async function fixture(){const f=await queryFixture();cleanup.push(f.close);return f;}

it('DOMAIN-001/003: domain migrations append immutable versions, no-op stays put and revert restores tokens',async()=>{
 const f=await fixture(),other=await fixture(),element=f.ids[1]!;
 const declarations=new PostgresElementDeclarations({canonicalisers:async()=>ok(['stdnum1'])});
 const initial=await declarations.read(f.ctx,element);if(!initial.ok)throw initial.error;
 const history=()=>withTenant(f.ctx,tx=>tx.query<{version:number;effective_domain:string;actor_id:string}>('SELECT version,effective_domain,actor_id FROM token_domain_assignment WHERE element_id=$1 ORDER BY version',[element]));
 const before=await history(),original=await f.query('SELECT field_2 FROM warehouse.public.records');
 expect((await declarations.save(f.ctx,element,{...initial.value.stored,tokenDomain:'revised'})).ok).toBe(false);
 expect(await history()).toEqual(before);
 expect((await declarations.save(f.ctx,element,{...initial.value.stored,tokenDomain:'revised',confirmation:'Bulk project'})).ok).toBe(true);
 const changed=await f.query('SELECT field_2 FROM warehouse.public.records');expect(QueryOutput.parse(changed.structuredContent).rows).not.toEqual(QueryOutput.parse(original.structuredContent).rows);
 expect((await declarations.save(f.ctx,element,{...initial.value.stored,tokenDomain:'revised',confirmation:'Bulk project'})).ok).toBe(true);
 expect((await history()).length).toBe(before.length+1);
 expect((await declarations.save(f.ctx,element,{...initial.value.stored,confirmation:'Bulk project'})).ok).toBe(true);
 const reverted=await f.query('SELECT field_2 FROM warehouse.public.records');
 expect(QueryOutput.parse(reverted.structuredContent).rows).toEqual(QueryOutput.parse(original.structuredContent).rows);
 const after=await history();expect(after.slice(0,before.length)).toEqual(before);
 expect(after.at(-1)).toMatchObject({version:before.at(-1)!.version+2,effective_domain:'customer',actor_id:f.ctx.userId});
 expect(await withTenant(other.ctx,tx=>tx.query('SELECT * FROM token_domain_assignment WHERE element_id=$1',[element]))).toEqual([]);
 for(const sql of ['UPDATE token_domain_assignment SET version=version','DELETE FROM token_domain_assignment','INSERT INTO token_domain_assignment SELECT * FROM token_domain_assignment'])await expect(withTenant(f.ctx,tx=>tx.query(sql))).rejects.toMatchObject({code:'42501'});
});

it('DOMAIN-003: history migration round-trips and refuses a destructive downgrade',async()=>{
 const f=await fixture(),db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{
  await db.query('BEGIN');await db.query('TRUNCATE token_domain_assignment');
  const up=await readFile('migrations/062_token_domain_history.up.sql','utf8'),down=await readFile('migrations/062_token_domain_history.down.sql','utf8');
  await db.query(await readFile('migrations/063_token_history_administration.down.sql','utf8'));await db.query(down);await db.query(up);await db.query(await readFile('migrations/063_token_history_administration.up.sql','utf8'));
  await db.query("UPDATE catalog_element SET token_domain='migrationtest' WHERE id=$1",[f.ids[1]]);
  await db.query('SAVEPOINT downgrade');await expect(db.query(down)).rejects.toThrow('Cannot downgrade: token domain assignment history would be lost');await db.query('ROLLBACK TO SAVEPOINT downgrade');
  expect((await db.query('SELECT version FROM token_domain_assignment WHERE element_id=$1 ORDER BY version',[f.ids[1]])).rows).toEqual([{version:1},{version:2}]);
 }finally{await db.query('ROLLBACK');await db.end();}
});

it('DOMAIN-001: shared domains join even when their assignment versions differ',async()=>{
 const f=await fixture();await f.addSource('second');
 await withTenant(f.ctx,async tx=>{
  await tx.query("UPDATE catalog_element SET token_domain='temporary' WHERE id=$1",[f.ids[1]]);
  await tx.query("UPDATE catalog_element SET token_domain='customer' WHERE id=$1",[f.ids[1]]);
 });
 const versions=await withTenant(f.ctx,tx=>tx.query<{version:number}>("SELECT max(a.version)::int AS version FROM token_domain_assignment a JOIN catalog_element e ON e.id=a.element_id WHERE e.exposed_name='field_2' GROUP BY e.id"));
 expect(new Set(versions.map(v=>v.version)).size).toBe(2);
 const shared=await f.query('SELECT a.field_2 FROM warehouse.public.records a JOIN second.public.records b ON a.field_2=b.field_2');
 expect(shared.isError).not.toBe(true);expect(QueryOutput.parse(shared.structuredContent).rows).toHaveLength(7);
});
