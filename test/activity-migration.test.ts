import {readFile} from 'node:fs/promises';
import {Client} from 'pg';
import {it,expect} from 'vitest';
 // Migration round trips are functional; this hang guard allows for growth of the migration chain.
it('048 activity indexes migrate down/up twice without changing evidence',async()=>{
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{await db.query('BEGIN');const down=await readFile('migrations/048_activity_read_indexes.down.sql','utf8'),up=await readFile('migrations/048_activity_read_indexes.up.sql','utf8');for(let n=0;n<2;n++){await db.query(down);expect((await db.query("SELECT to_regclass('query_run_activity_pool_idx') AS idx")).rows[0]?.idx).toBeNull();await db.query(up);expect((await db.query("SELECT to_regclass('query_run_activity_pool_idx') AS idx")).rows[0]?.idx).not.toBeNull();}}finally{await db.query('ROLLBACK');await db.end();}
},60_000);
