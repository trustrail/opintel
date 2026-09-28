import { z } from 'zod';
import type { EngineSession, SessionEngine, SessionLimits, SessionRole, SessionRows } from '../ports.js';
import { DuckDBSessionEngine } from './duckdb.js';
const limitsSchema = z.strictObject({memoryMb:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),threads:z.number().int().positive().max(2_147_483_647)});

async function harden(session: EngineSession, role: SessionRole, limits: SessionLimits): Promise<void> {
 // C.2, in order. Privileged external access remains on for future scanners
 // (C.1); no source is attached and no staging is implemented in S2a.
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
 async execute(sql: string, input: SessionLimits): Promise<SessionRows> {
  z.string().parse(sql);
  return this.withAgent(input, agent => agent.execute(sql));
 }
 /** Trusted composition seam; hardening precedes work and both instances close. */
 async withAgent<T>(input: SessionLimits, work: (agent: EngineSession) => Promise<T>): Promise<T> {
  const limits = limitsSchema.parse(input);
  const privileged = await this.engine.open('privileged');
  try {
   await harden(privileged,'privileged',limits);
   const agent = await this.engine.open('agent');
   try {
    await harden(agent,'agent',limits);
    return await work(agent);
   } finally { agent.close(); }
  } finally { privileged.close(); }
 }
}
