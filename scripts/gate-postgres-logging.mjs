import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function gatePostgresLogging({run=async args=>(await exec('docker',args,{timeout:10000,maxBuffer:1024*1024})).stdout}={}){
 const base=['compose','exec','-T','postgres','sh','-c','exec psql -U "$POSTGRES_USER" -d postgres -At -v ON_ERROR_STOP=1 "$@"','sh'];
 const query=sql=>run([...base,'-c',sql]);
 const rows=JSON.parse((await query("SELECT json_agg(json_build_object('name',name,'setting',setting,'auto',CASE WHEN sourcefile LIKE '%/postgresql.auto.conf' THEN true ELSE false END)) FROM pg_settings WHERE name IN ('log_connections','log_disconnections')")).trim());
 if(rows.length!==2)throw new Error('PostgreSQL logging settings not found');
 const restore=async()=>{for(const {name,setting,auto} of rows){if(!['on','off'].includes(setting))throw new Error('Unexpected PostgreSQL logging value');await query(auto?`ALTER SYSTEM SET ${name} = '${setting}'`:`ALTER SYSTEM RESET ${name}`);}await query('SELECT pg_reload_conf()');};
 try{
  for(const {name} of rows){if(!['log_connections','log_disconnections'].includes(name))throw new Error('Unexpected PostgreSQL logging setting');await query(`ALTER SYSTEM SET ${name} = 'on'`);}
  await query('SELECT pg_reload_conf()');
 }catch(error){await restore();throw error;}
 return {previous:rows,restore};
}
