import {it,expect,vi} from 'vitest';
import {gatePostgresLogging} from '../scripts/gate-postgres-logging.mjs';
it('enables connection logs and restores inherited versus explicit prior settings',async()=>{
 const run=vi.fn().mockResolvedValue('').mockResolvedValueOnce(JSON.stringify([{name:'log_connections',setting:'off',auto:false},{name:'log_disconnections',setting:'off',auto:true}]));
 const logging=await gatePostgresLogging({run});await logging.restore();
 expect(run.mock.calls.map(([args])=>args.at(-1)).slice(1)).toEqual(["ALTER SYSTEM SET log_connections = 'on'","ALTER SYSTEM SET log_disconnections = 'on'",'SELECT pg_reload_conf()','ALTER SYSTEM RESET log_connections',"ALTER SYSTEM SET log_disconnections = 'off'",'SELECT pg_reload_conf()']);
});
