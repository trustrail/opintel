import {withPlatform} from './scope.js';
import {configureSqlDiagnostics,type SqlMetadata} from './sql-diagnostics.js';
import {diagnosticsEnabled,diagnostic} from '../telemetry/diagnostics.js';
/** One metadata read before measurement; definitions never enter diagnostics. */
export async function initializeDatabaseDiagnostics():Promise<void>{
 if(!diagnosticsEnabled())return;
 const items=await withPlatform(tx=>tx.query<SqlMetadata>(`SELECT c.relname AS name,'view' AS kind,pg_get_viewdef(c.oid,true) AS definition,NULL::boolean AS volatile FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='v'
 UNION ALL SELECT p.proname,'function',p.prosrc,p.provolatile='v' FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prolang IN (SELECT oid FROM pg_language WHERE lanname IN ('sql','plpgsql'))`));
 configureSqlDiagnostics(items);diagnostic({kind:'db_metadata',definitions:items.length,coverage:'statement references with static view/function expansion; excludes trigger/RLS internals and dynamic SQL'});
}
