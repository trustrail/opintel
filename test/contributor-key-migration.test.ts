import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {migrationDatabase} from './fixtures/migration-database.js';
const owner=migrationDatabase();
it('080 contributor identity declaration up/down/up is explicit and unique per active object',async()=>{
 const db=owner(),up=await readFile('migrations/080_contributor_key.up.sql','utf8'),down=await readFile('migrations/080_contributor_key.down.sql','utf8');
 await db.query('BEGIN');try{
  await db.query(down);await db.query(up);
  expect((await db.query("SELECT column_default,is_nullable FROM information_schema.columns WHERE table_name='catalog_element' AND column_name='contributor_key'")).rows).toEqual([{column_default:'false',is_nullable:'NO'}]);
  expect((await db.query("SELECT indexdef FROM pg_indexes WHERE indexname='catalog_element_contributor_key'")).rows[0].indexdef).toContain('UNIQUE INDEX');
  await db.query(down);expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='catalog_element' AND column_name='contributor_key'")).rows).toEqual([]);await db.query(up);
 }finally{await db.query('ROLLBACK');}
},60000);
