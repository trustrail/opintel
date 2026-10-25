import {OperatorConflict} from '../common.js';
/** Explicit synthetic source writer; never uses the application's metadata pool. */
import {Client} from 'pg';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {demoTables} from '../../demo-soak-definition.js';
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export async function syntheticSource(write:boolean){
 const target=z.string().url().parse(process.env.OPINTEL_DEMO_DATABASE_URL);
 if(process.env.OPINTEL_DEMO_FIXTURE!=='V-01'||process.env.OPINTEL_DEMO_SEED!=='1'||process.env.OPINTEL_DEMO_SCHEMAS!=='soak_policies,soak_claims,soak_recoveries')throw new OperatorConflict('Declare demo fixture V-01, seed 1 and its three dedicated schemas');
 const address=new URL(target);for(const app of [process.env.DATABASE_URL,process.env.MIGRATION_DATABASE_URL])if(app){const a=new URL(app);if(a.hostname===address.hostname&&a.port===address.port&&a.pathname===address.pathname)throw new OperatorConflict('Synthetic target must be separate from the application database');}
 const client=new Client({connectionString:target});await client.connect();const report=[];
 try{await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(17761024)');
 for(const t of demoTables){const name=quote(t.schema)+'.'+quote(t.name),columns=Object.keys(t.rows[0]!);const exists=await client.query<{id:string|null}>('SELECT to_regclass($1)::text AS id',[name]);const fresh=!exists.rows[0]?.id;
 if(fresh){if(!write)throw new OperatorConflict('Missing synthetic table: '+t.name);await client.query('CREATE SCHEMA IF NOT EXISTS '+quote(t.schema));await client.query('CREATE TABLE '+name+' ('+columns.map(c=>quote(c)+' '+(c==='claim_amount'?'integer':c==='loss_date'?'date':'text')).join(',')+')');for(const row of t.rows)await client.query('INSERT INTO '+name+' VALUES ('+columns.map((_,i)=>'$'+(i+1)).join(',')+')',columns.map(c=>row[c]));}
 const metadata=await client.query<{column_name:string;data_type:string}>('SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position',[t.schema,t.name]);
 if(JSON.stringify(metadata.rows)!==JSON.stringify(columns.map(c=>({column_name:c,data_type:c==='claim_amount'?'integer':c==='loss_date'?'date':'text'}))))throw new OperatorConflict('Synthetic table schema conflict: '+t.name);
 const rows=await client.query<Record<string,unknown>>('SELECT '+columns.map(c=>c==='loss_date'?quote(c)+'::text AS '+quote(c):quote(c)).join(',')+' FROM '+name);
 const canonical=(rs:Record<string,unknown>[])=>rs.map(r=>JSON.stringify(columns.map(c=>r[c]))).sort().join('\n');
 if(canonical(rows.rows)!==canonical(t.rows))throw new OperatorConflict('Synthetic data conflict: '+t.name+'; existing rows preserved');
 if(write)await client.query('ANALYZE '+name);
 const estimate=await client.query<{n:number}>('SELECT reltuples::float8 AS n FROM pg_class WHERE oid=$1::regclass',[name]);if(estimate.rows[0]?.n!==t.rows.length)throw new OperatorConflict('Unknown or incompatible source estimate: '+t.name);
 report.push({schema:t.schema,table:t.name,count:rows.rowCount,estimate:estimate.rows[0].n});
 }
 await client.query('COMMIT');return {fixture:'V-01',seed:1,definitionHash:createHash('sha256').update(JSON.stringify(demoTables)).digest('hex'),tables:report};
 }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
}
