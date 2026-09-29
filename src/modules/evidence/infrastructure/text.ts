import {DuckDBInstance} from '@duckdb/node-api';
import {z} from 'zod';
import {DuckDBQueryParser,literalStrippedTree} from '../../entitlements/index.js';
import type {EvidenceTextPort} from '../application/read.js';
export class DuckDBEvidenceText implements EvidenceTextPort {
 async stripSql(sql:string):Promise<string|null>{
  const parsed=await new DuckDBQueryParser().parse(sql);if(!parsed.ok)return null;
  const tree=literalStrippedTree(parsed.value.tree);if(tree===null)return null;
  const instance=await DuckDBInstance.create(':memory:',{enable_external_access:'false',autoinstall_known_extensions:'false',autoload_known_extensions:'false',threads:'1'});
  try{const connection=await instance.connect();try{
   // Only deserialize the scrubbed AST. The resulting SQL is never executed.
   const result=await connection.runAndReadAll('SELECT json_deserialize_sql(CAST($1 AS JSON)) AS sql',[JSON.stringify(tree)]);
   return z.array(z.object({sql:z.string()})).length(1).parse(result.getRowObjects())[0]!.sql;
  }catch{return null;}finally{connection.closeSync();}}finally{instance.closeSync();}
 }
}
