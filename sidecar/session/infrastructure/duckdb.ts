import { randomUUID } from 'node:crypto';
import { DuckDBInstance } from '@duckdb/node-api';
import type { EngineSession, SessionEngine, SessionRole, StatementObserver } from '../ports.js';

export class DuckDBSessionEngine implements SessionEngine {
 constructor(private readonly observe?: StatementObserver) {}
 async open(role: SessionRole): Promise<EngineSession> {
  // Never use the instance cache: two connections in one instance share a
  // catalogue and configuration, which is not the two-session construction.
  const instance = await DuckDBInstance.create(':memory:', {
   enable_external_access: 'true',
   temp_directory: '', max_temp_directory_size: '0B',
   autoinstall_known_extensions: 'false', autoload_known_extensions: 'false', allow_unsigned_extensions: 'false',
  });
  try {
   const connection = await instance.connect(), sessionId = randomUUID();
   let closed = false;
   return {
    execute: async sql => {
     if (closed) throw new Error('The DuckDB session is closed.');
     let outcome: 'completed'|'failed' = 'failed';
     try {
      const result = await connection.runAndReadAll(sql);
      const rows = {columns:result.columnNames(),rows:result.getRowsJson()};
      outcome = 'completed';
      return rows;
     } finally { this.observe?.({sessionId,role,sql,outcome}); }
    },
    close: () => {
     if (closed) return;
     closed = true;
     try { connection.closeSync(); } finally { instance.closeSync(); }
    },
   };
  } catch (error) { instance.closeSync(); throw error; }
 }
}
