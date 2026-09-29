import type {EngineSession,SessionRole,SessionLimits} from '../ports.js';
export async function harden(session: EngineSession, role: SessionRole, limits: SessionLimits): Promise<void> {
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

