import { mkdir,writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { DuckDBInstance } from '@duckdb/node-api';
// Build/test provisioning only. Query execution never downloads or installs.
const instance=await DuckDBInstance.create(':memory:');
try{
 const connection=await instance.connect();
 try{
  const platform=String((await connection.runAndReadAll('PRAGMA platform')).getRows()[0]?.[0]);
  if(!/^[a-z0-9_]+$/u.test(platform))throw new Error('Unsupported DuckDB platform.');
  const response=await fetch(`https://extensions.duckdb.org/v1.4.3/${platform}/postgres_scanner.duckdb_extension.gz`);
  if(!response.ok)throw new Error('Pinned PostgreSQL scanner download failed.');
  const file='tmp/duckdb-extensions/postgres_scanner.duckdb_extension';
  await mkdir('tmp/duckdb-extensions',{recursive:true});
  await writeFile(file,gunzipSync(Buffer.from(await response.arrayBuffer())));
  // DuckDB verifies its signature and platform/build compatibility on load.
  await connection.run("LOAD '"+file+"'");
 }finally{connection.closeSync();}
}finally{instance.closeSync();}
