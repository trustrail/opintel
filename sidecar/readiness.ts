import type {SidecarConfig} from './config.js';
import {readinessMessages,type ReadinessFailure} from '../src/shared/engine-readiness.js';
import type {PostgresSourceScope} from './infrastructure/postgres-source-scope.js';
import {DuckDBSessionEngine,type SessionEngine} from './session/index.js';

export class QueryReadinessError extends Error {
 constructor(readonly reason:ReadinessFailure){super(readinessMessages[reason]);}
}
function sourceFailure(error:unknown):QueryReadinessError {
 if(error instanceof QueryReadinessError)return error;
 const message=error instanceof Error?error.message:'';
 const reason:ReadinessFailure=/connection refused|ECONNREFUSED/iu.test(message)?'source_connection_refused':/authentication failed|password authentication|28P01/iu.test(message)?'source_authentication_failed':/timeout|timed out|deadline/iu.test(message)?'source_timeout':'source_probe_failed';
 return new QueryReadinessError(reason);
}

/** Startup only, before listening or sending healthy heartbeats. Every supervised
 * replacement repeats it; /health must never open a source connection.
 * NEVER substitute a real table/row here: that would be an ungoverned customer
 * read. Only the constant below may cross the scanner into ephemeral memory. */
export async function checkQueryReadiness(config:SidecarConfig,scope:Pick<PostgresSourceScope,'external'>,
 engine:SessionEngine=new DuckDBSessionEngine(undefined,undefined,config.postgresExtension)):Promise<string>{
 const ref=config.postgresReadinessSource;
 if(!ref)throw new QueryReadinessError('readiness_source_missing');
 if(!config.postgresExtension)throw new QueryReadinessError('scanner_configuration_missing');
 const session=await engine.open('privileged').catch(error=>{
  const message=error instanceof Error?error.message:'';
  throw new QueryReadinessError(/extension|signature|\bLOAD\b/iu.test(message)?'scanner_load_failed':'query_engine_initialization_failed');
 });
 try{
  if(!session.staging||!session.inspection)throw new Error('Query engine readiness capabilities are unavailable.');
  const version=await session.inspection.build();
  await scope.external('startup-readiness',ref,async(connection,signal)=>{
   const interrupt=()=>session.interrupt?.();signal.addEventListener('abort',interrupt,{once:true});
   try{
    if(signal.aborted)throw new Error('Readiness cancelled.');
    await session.staging!.materialize(connection,'SELECT 1 AS ready','readiness',[{name:'ready',type:'INTEGER'}]);
    const result=await session.execute('SELECT ready FROM __staging.readiness');
    if(result.columns.length!==1||result.columns[0]!=='ready'||result.rows.length!==1||result.rows[0]?.length!==1||result.rows[0]?.[0]!==1)throw new QueryReadinessError('probe_result_invalid');
   }finally{signal.removeEventListener('abort',interrupt);}
  },new AbortController().signal).catch(error=>{
   // Native scanner errors can embed credentials; retain only a closed reason.
   throw sourceFailure(error);
  });
  return version;
 }finally{session.close();}
}
