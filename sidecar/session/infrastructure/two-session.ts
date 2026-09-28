import { z } from 'zod';
import { sessionFailure } from './failure.js';
import type { DomainError } from '../../../src/shared/kernel/index.js';
import type { EngineSession, SessionEngine, SessionLimits, SessionRole, SessionRows } from '../ports.js';
import { DuckDBSessionEngine } from './duckdb.js';
const limitsSchema = z.strictObject({memoryMb:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),threads:z.number().int().positive().max(2_147_483_647)});

async function harden(session: EngineSession, role: SessionRole, limits: SessionLimits): Promise<void> {
 // C.2, in order. Privileged external access remains on for C.1 scanners.
 // The trusted staging hook runs before the agent is hardened.
 for (const statement of [
  "SET temp_directory = ''",
  "SET max_temp_directory_size = '0B'",
  ...(role==='agent'?['SET enable_external_access = false']:[]),
  'SET autoinstall_known_extensions = false',
  'SET autoload_known_extensions = false',
  'SET allow_unsigned_extensions = false',
  `SET memory_limit = '${limits.memoryMb}MB'`,
  `SET threads = ${limits.threads}`,
  'SET lock_configuration = true',
 ]) await session.execute(statement);
}

/** S2a's intentionally uninspected execution seam. Not mounted on HTTP and not
 * usable as an authorization decision. S2b's approved raw controls use it;
 * S2c composes inspection through withAgent. */
export class TwoSessionExecutor {
 constructor(private readonly engine: SessionEngine = new DuckDBSessionEngine()) {}
 /** Safe error translation for inspected callers; raw controls retain native errors. */
 failure(error:unknown):DomainError{return sessionFailure(error);}
 async execute(sql: string, input: SessionLimits): Promise<SessionRows> {
  z.string().parse(sql);
  return this.withAgent(input, agent => agent.execute(sql));
 }
 /** Trusted composition seam. Staging may return an early Result refusal;
  * agent hardening follows staging, precedes work, and both instances close. */
 async withAgent<T>(input: SessionLimits, work: (agent: EngineSession) => Promise<T>,signal?:AbortSignal,beforeAgent?: (privileged:EngineSession,agent:EngineSession)=>Promise<T|undefined>): Promise<T> {
  const limits = limitsSchema.parse(input);
  if(signal?.aborted)throw new Error('Interrupt Error: Cancelled');
  const privileged = await this.engine.open('privileged');
  const cancelPrivileged=()=>privileged.interrupt?.();signal?.addEventListener('abort',cancelPrivileged,{once:true});
  try {
   await harden(privileged,'privileged',limits);
   const agent = await this.engine.open('agent');
   const cancelAgent=()=>agent.interrupt?.();signal?.addEventListener('abort',cancelAgent,{once:true});
   try {
    const early=await beforeAgent?.(privileged,agent);if(early!==undefined)return early;
    if(signal?.aborted)throw new Error('Interrupt Error: Cancelled');
    await harden(agent,'agent',limits);
    return await work(agent);
   } finally { signal?.removeEventListener('abort',cancelAgent);agent.close(); }
  } finally { signal?.removeEventListener('abort',cancelPrivileged);privileged.close(); }
 }
}
