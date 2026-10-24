import {access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function prepareDevelopmentScanner({file=resolve(root,'tmp/duckdb-extensions/postgres_scanner.duckdb_extension'),prepare=async()=>{
 await promisify(execFile)(process.execPath,['--import','tsx',resolve(root,'scripts/prepare-duckdb-scanner.ts')],{cwd:root,timeout:120000});
}}={}):Promise<string>{
 try{await access(file);}catch{
  try{await prepare();await access(file);}catch{throw new Error('Development PostgreSQL scanner preparation failed. Run npm run sidecar:prepare-scanner and inspect its diagnostic.');}
 }
 return file;
}
