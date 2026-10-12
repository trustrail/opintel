import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {beforeAll,afterAll,beforeEach,afterEach,it,expect} from 'vitest';
import {parsePredicate,evaluatePredicate} from '../src/shared/row-predicate.js';
import {postgresRowPredicate,postgresPredicateInput} from '../sidecar/execution/infrastructure/postgres-row-predicate.js';
import type {PredicateColumn} from '../src/shared/row-scope-contract.js';
const schema='row_compare_'+randomUUID().replaceAll('-','');
const columns:PredicateColumn[]=[['text','VARCHAR'],['padded','VARCHAR'],['amount','DECIMAL(38,9)'],['number','BIGINT'],['real','FLOAT'],['double','DOUBLE'],['day','DATE'],['clock','TIME'],['local','TIMESTAMP'],['instant','TIMESTAMPTZ'],['flag','BOOLEAN'],['uuid','UUID']].map(([name,type])=>({id:randomUUID(),name:name!,sourceIdentifier:name!,type:type!}));
let client:Client;
beforeAll(async()=>{client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();await client.query(`CREATE SCHEMA ${schema};CREATE TABLE ${schema}.sample(id int,text text,amount numeric(38,9),number bigint,real real,double double precision,day date,clock time,local timestamp,instant timestamptz,flag boolean,uuid uuid);
 INSERT INTO ${schema}.sample VALUES
 (1,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL),
 (2,'A',99999999999999999999999999999.123456789,9223372036854775807,0.1,0.1,'2024-02-29','23:59:59.123456','2026-01-01 01:00:00.123456','2026-01-01 01:00:00.123456+01',true,'00000000-0000-4000-8000-000000000002'),
 (3,'a',-99999999999999999999999999999.123456789,-9223372036854775808,-0.1,-0.1,'2024-03-01','00:00:00','2026-01-01 00:00:00','2026-01-01 00:00:00+00',false,'00000000-0000-4000-8000-000000000003'),
 (4,'é',0,0,0,0,'1969-12-31','12:00:00','1969-12-31 23:59:59.123456','1969-12-31 23:59:59.123456+00',true,'00000000-0000-4000-8000-000000000004'),
 (5,'😀',1,1,1e-40,1e-300,'2026-01-01','01:00:00','2026-01-01 01:00:00','2026-01-01 01:00:00+02',false,'00000000-0000-4000-8000-000000000005'),
 (6,'A ',1,1,1,1,'2026-01-01','01:00:00','2026-01-01 01:00:00','2026-01-01 01:00:00+02',true,'00000000-0000-4000-8000-000000000006');INSERT INTO ${schema}.sample(id,real,double,amount,day,local,instant) VALUES(7,'NaN','NaN','NaN','infinity','infinity','infinity'),(8,'Infinity','Infinity',NULL,'-infinity','-infinity','-infinity'),(9,'-Infinity','-Infinity',NULL,NULL,NULL,NULL);ALTER TABLE ${schema}.sample ADD COLUMN padded char(4);UPDATE ${schema}.sample SET padded=text;SET TimeZone='UTC';SET DateStyle='ISO,YMD';SET extra_float_digits=3;`);await client.end();});
beforeEach(async()=>{client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();await client.query("SET TimeZone='UTC';SET DateStyle='ISO,YMD';SET extra_float_digits=3");});
afterEach(async()=>{await client.end();});
afterAll(async()=>{client=new Client({connectionString:process.env.TEST_DATABASE_URL});await client.connect();try{await client?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);}finally{await client?.end();}});
const comparisons=['=','<>','<','<=','>','>='];
const cases=[...comparisons.flatMap(op=>[`padded ${op} 'A   '`,`text ${op} 'a'`,`text ${op} 'é'`,`amount ${op} 99999999999999999999999999999.123456789`,`number ${op} 9223372036854775807`,`real ${op} 0.1`,`double ${op} 0.1`,`day ${op} '2024-02-29'`,`clock ${op} '12:00:00'`,`local ${op} '2026-01-01T00:00:00'`,`instant ${op} '2026-01-01T01:00:00.123456+01:00'`,`flag ${op} TRUE`,`uuid ${op} '00000000-0000-4000-8000-000000000004'`]),"text IN ('A','é',NULL)","text NOT IN ('A',NULL)","NOT (text = 'closed')",'text IS NULL','text IS NOT NULL',"text IS NULL OR amount > 0", "text = 'a' AND (amount > 0 OR flag = FALSE)","NOT (text = 'A' OR amount < 0)"];
for(const expression of cases)it('ROW-002 identical row sets: '+expression,async()=>{
 const parsed=parsePredicate(expression,columns);expect(parsed.ok,parsed.ok?'':parsed.error.message).toBe(true);if(!parsed.ok)return;
 const pushed=await client.query<{id:number}>(`SELECT id FROM ${schema}.sample WHERE ${postgresRowPredicate(parsed.value,columns)} ORDER BY id`);
 const rows=await client.query<Record<string,string|null>>(`SELECT id::text,${columns.map(c=>postgresPredicateInput(c)+' AS "'+c.id+'"').join(',')} FROM ${schema}.sample ORDER BY id`);
 const filtered=rows.rows.filter(row=>evaluatePredicate(parsed.value,columns,row)===true).map(row=>Number(row.id));
 expect(filtered).toEqual(pushed.rows.map(r=>r.id));
});

it('ROW-002 fixed-width text is not implicitly trimmed',async()=>{
 const c=columns.find(c=>c.name==='padded')!,parsed=parsePredicate("padded = 'A'",columns);if(!parsed.ok)throw parsed.error;
 const rows=await client.query(`SELECT ${postgresPredicateInput(c)} AS value FROM ${schema}.sample WHERE id=2`);expect(rows.rows).toEqual([{value:'A   '}]);
 expect(evaluatePredicate(parsed.value,columns,{[c.id]:'A   '})).toBe(false);
 expect((await client.query(`SELECT id FROM ${schema}.sample WHERE ${postgresRowPredicate(parsed.value,columns)}`)).rows).toEqual([]);
});
