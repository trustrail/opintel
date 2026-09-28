import { randomUUID } from 'node:crypto';
import { DuckDBInstance } from '@duckdb/node-api';
import { z } from 'zod';
import type { EngineSession, SessionEngine, SessionRole, StatementObserver, InspectionObserver } from '../ports.js';

const failureSchema = z.object({ error: z.literal(true), error_type: z.string(), error_message: z.string() });
const versionSchema = z.array(z.object({ library_version: z.string(), source_id: z.string() })).length(1);
const objectsSchema = z.array(z.object({ catalog: z.string(), schema: z.string(), name: z.string() }));

export class DuckDBSessionEngine implements SessionEngine {
 constructor(private readonly observe?: StatementObserver, private readonly evidence?: InspectionObserver) {}
 async open(role: SessionRole): Promise<EngineSession> {
  // Never use the instance cache: two connections in one instance share a
  // catalogue and configuration, which is not the two-session construction.
  const instance = await DuckDBInstance.create(':memory:', {
   enable_external_access: 'true',
   temp_directory: '', max_temp_directory_size: '0B',
   autoinstall_known_extensions: 'false', autoload_known_extensions: 'false', allow_unsigned_extensions: 'false',
  });
  try {
   const connection = await instance.connect(), sessionId = randomUUID();
   let closed = false;
   return {
    inspection: {
     build: async () => {
      const rows = versionSchema.parse((await connection.runAndReadAll('SELECT library_version, source_id FROM pragma_version()')).getRowObjects());
      return `${rows[0]!.library_version}/${rows[0]!.source_id}`;
     },
     columns: async () => z.array(z.object({catalog:z.string(),schema:z.string(),name:z.string(),column:z.string()})).parse((await connection.runAndReadAll(
      'SELECT database_name AS catalog, schema_name AS schema, table_name AS name, column_name AS column FROM duckdb_columns() WHERE NOT internal'
     )).getRowObjects()),
     render: async tree => z.array(z.object({sql:z.string()})).length(1).parse((await connection.runAndReadAll(
      'SELECT json_deserialize_sql($1::JSON) AS sql',[JSON.stringify(tree)]
     )).getRowObjects())[0]!.sql,
     estimate: async sql => {
      // EXPLAIN never executes the permitted SELECT. No group averages are used.
      let explained;
      try{explained=await connection.runAndReadAll('EXPLAIN (FORMAT JSON) '+sql);}
      catch(error){if(error instanceof Error&&(error.message.startsWith('Binder Error:')||error.message.startsWith('Catalog Error:')))return null;throw error;}
      const rows=z.array(z.tuple([z.string(),z.string()])).parse(explained.getRowsJson());
      const plan:unknown=JSON.parse(rows.find(r=>r[0]==='physical_plan')?.[1]??'null');
      const node=z.object({name:z.string(),children:z.array(z.unknown()),extra_info:z.record(z.string(),z.unknown())});
      let current:unknown=Array.isArray(plan)&&plan.length===1?plan[0]:null;
      let found=false;
      for(let depth=0;depth<100;depth++){
       const parsed=node.safeParse(current);if(!parsed.success)return null;
       const n=parsed.data,name=n.name.trim();
       if(name==='UNGROUPED_AGGREGATE')found=true;
       else if(found&&typeof n.extra_info['Estimated Cardinality']==='string'){
        const value=Number(n.extra_info['Estimated Cardinality']);
        return Number.isSafeInteger(value)&&value>=0?value:null;
       }else if(name!=='PROJECTION')return null;
       if(n.children.length!==1)return null;
       current=n.children[0];
      }
      return null;
     },
     objects: async () => objectsSchema.parse((await connection.runAndReadAll(`
      SELECT database_name AS catalog, schema_name AS schema, table_name AS name FROM duckdb_tables() WHERE NOT internal
      UNION ALL SELECT database_name, schema_name, view_name FROM duckdb_views() WHERE NOT internal
     `)).getRowObjects()),
     hasExternalState: async allowedCatalogs => {
      const catalogs=z.array(z.object({name:z.string()})).parse((await connection.runAndReadAll('SELECT database_name AS name FROM duckdb_databases() WHERE NOT internal')).getRowObjects());
      const fold=(name:string)=>name.replace(/[A-Z]/gu,c=>c.toLowerCase());
      if(catalogs.some(c=>!allowedCatalogs.some(allowed=>fold(allowed)===fold(c.name))))return true;
      const rows=await connection.runAndReadAll(`SELECT
       EXISTS(SELECT 1 FROM duckdb_databases() WHERE path IS NOT NULL OR type <> 'duckdb')
       OR EXISTS(SELECT 1 FROM duckdb_functions() WHERE NOT internal) AS contaminated`);
      return z.array(z.object({contaminated:z.boolean()})).length(1).parse(rows.getRowObjects())[0]!.contaminated;
     },
     parse: async sql => {
      if (closed) throw new Error('The DuckDB session is closed.');
      // The pinned serializer first invokes DuckDB's parser, then serializes
      // its result. Agent SQL is only a VARCHAR parameter of trusted SQL here.
      this.evidence?.({stage:'parse_started'});
      const serialized = await connection.runAndReadAll('SELECT json_serialize_sql($1::VARCHAR)::VARCHAR AS syntax', [sql]);
      const json = z.array(z.object({syntax:z.string()})).length(1).parse(serialized.getRowObjects())[0]!.syntax;
      const tree: unknown = JSON.parse(json);
      const failure = failureSchema.safeParse(tree);
      if (failure.success && failure.data.error_type === 'parser') {
       this.evidence?.({stage:'parse_failed',error:failure.data.error_message});
       return {kind:'parse_failed',error:failure.data.error_message};
      }
      // Only this pinned serializer response proves ParseQuery completed
      // before the serializer refused a statement family. A different engine
      // error must not be relabelled as successful parsing.
      if(failure.success&&(failure.data.error_type!=='not implemented'||failure.data.error_message!=='Only SELECT statements can be serialized to json!'))throw new Error('The engine could not complete SQL serialization.');
      this.evidence?.({stage:'parse_succeeded'});
      this.evidence?.({stage:'serialize_started'});
      if (failure.success) {
       this.evidence?.({stage:'serialization_refused',error:failure.data.error_message});
       return {kind:'serialization_refused',error:failure.data.error_message};
      }
      this.evidence?.({stage:'serialized',tree});
      return {kind:'parsed',tree,prepare:async()=>{
       this.evidence?.({stage:'prepare_started'});
       // This capability is invoked only AFTER explicit subset inspection.
       // There is no rewrite; execution retains this exact prepared handle.
       let prepared;
       try { prepared = await connection.prepare(sql); }
       catch(error) {
        if(error instanceof Error&&(error.message.startsWith('Binder Error:')||error.message.startsWith('Catalog Error:')||error.message.startsWith('Invalid Input Error: Values were not provided'))){
         this.evidence?.({stage:'binding_failed',error:error.message});
         return {kind:'unresolved'};
        }
        throw error;
       }
       this.evidence?.({stage:'prepared'});
       let released=false;
       return {kind:'bound',handle:{
        execute:async()=>{
         if (released) throw new Error('The prepared statement is closed.');
         this.evidence?.({stage:'execute_started'});
         const result=await prepared.runAndReadAll();
         this.evidence?.({stage:'executed'});
         return {columns:result.columnNames(),rows:result.getRowsJson()};
        },
        close:()=>{if(!released){released=true;prepared.destroySync();this.evidence?.({stage:'released'});}},
       }};
      }};
     },
    },
    execute: async sql => {
     if (closed) throw new Error('The DuckDB session is closed.');
     let outcome: 'completed'|'failed' = 'failed';
     try {
      const result = await connection.runAndReadAll(sql);
      const rows = {columns:result.columnNames(),rows:result.getRowsJson()};
      outcome = 'completed';
      return rows;
     } finally { this.observe?.({sessionId,role,sql,outcome}); }
    },
    close: () => {
     if (closed) return;
     closed = true;
     try { connection.closeSync(); } finally { instance.closeSync(); }
    },
   };
  } catch (error) { instance.closeSync(); throw error; }
 }
}
