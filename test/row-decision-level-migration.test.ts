import {Client} from 'pg';
import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {queryFixture,unwrap} from './fixtures/query/fixture.js';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import {withTenant} from '../src/platform/db/scope.js';
import {ObjectId} from '../src/shared/kernel/index.js';
it('ROW-2B existing decisions migrate to overrides and revert unchanged; defaults prevent destructive downgrade',async()=>{
 const f=await queryFixture(),db=new Client({connectionString:process.env.TEST_DATABASE_URL});try{
  const [o]=await withTenant(f.ctx,tx=>tx.query<{id:string}>('SELECT id FROM catalog_object WHERE source_id=$1',[f.source]));const object=ObjectId(o!.id),repo=new PostgresRowDecisions(),decision=unwrap(await repo.save(f.ctx,f.pool,object,'field_1 > 2'));
  const up=await readFile('migrations/075_row_decision_levels.up.sql','utf8'),down=await readFile('migrations/075_row_decision_levels.down.sql','utf8');await db.connect();await db.query('BEGIN');
  await db.query(down);const before=await db.query('SELECT id,expression,actor_id,decided_at,predicate_hash FROM row_entitlement WHERE id=$1',[decision.id]);await db.query(up);const after=await db.query('SELECT id,expression,actor_id,decided_at,predicate_hash FROM row_entitlement WHERE id=$1',[decision.id]);expect(after.rows).toEqual(before.rows);expect((await db.query('SELECT level FROM row_entitlement WHERE id=$1',[decision.id])).rows).toEqual([{level:'pool_override'}]);await db.query(down);expect((await db.query('SELECT id,expression,actor_id,decided_at,predicate_hash FROM row_entitlement WHERE id=$1',[decision.id])).rows).toEqual(before.rows);await db.query('ROLLBACK');
  unwrap(await repo.save(f.ctx,f.pool,object,'field_1 > 1','object_default'));await db.query('BEGIN');await expect(db.query(down)).rejects.toThrow('Cannot downgrade while object default or tag rule history exists');await db.query('ROLLBACK');
 }finally{await db.end();await f.close();}
 // Full migration round trips are functional; this guard grows with the chain.
},60000);
