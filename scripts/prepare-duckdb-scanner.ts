import { mkdir,writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { DuckDBInstance } from '@duckdb/node-api';
import {queryEngineBuild} from '../sidecar/sql/application/engine-build.js';
// Build/test provisioning only. Query execution never downloads or installs.
const instance=await DuckDBInstance.create(':memory:',{allow_unsigned_extensions:'false',autoinstall_known_extensions:'false',autoload_known_extensions:'false'});
try{
 const connection=await instance.connect();
 try{
  const build=(await connection.runAndReadAll('SELECT library_version,source_id FROM pragma_version()')).getRowObjects()[0];
  if(!build||`${build.library_version}/${build.source_id}`!==queryEngineBuild)throw new Error('DuckDB build does not match the reviewed engine pin.');
  const runtimePlatform=String((await connection.runAndReadAll('PRAGMA platform')).getRows()[0]?.[0]);
  const target=process.env.TARGETPLATFORM;
  const targets:Readonly<Record<string,string>>={'linux/amd64':'linux_amd64','linux/arm64':'linux_arm64'};
  if(target&&!targets[target])throw new Error('Scanner target must be linux/amd64 or linux/arm64.');
  const platform=target?targets[target]!:runtimePlatform;
  // Cross builds run this step in the target image (native builder or QEMU).
  // Never download another architecture and silently skip LOAD verification.
  if(platform!==runtimePlatform)throw new Error('Run scanner preparation in the target architecture; LOAD verification cannot be skipped.');
  if(!/^[a-z0-9_]+$/u.test(platform))throw new Error('Unsupported DuckDB platform.');
  const response=await fetch(`https://extensions.duckdb.org/${String(build.library_version)}/${platform}/postgres_scanner.duckdb_extension.gz`);
  if(!response.ok)throw new Error('Pinned PostgreSQL scanner download failed.');
  const file='tmp/duckdb-extensions/postgres_scanner.duckdb_extension';
  await mkdir('tmp/duckdb-extensions',{recursive:true});
  await writeFile(file,gunzipSync(Buffer.from(await response.arrayBuffer())));
  // DuckDB verifies its signature and platform/build compatibility on load.
  await connection.run("LOAD '"+file+"'");
 }finally{connection.closeSync();}
}finally{instance.closeSync();}
