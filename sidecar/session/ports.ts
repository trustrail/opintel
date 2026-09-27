/** Low-level engine boundary, not an authorization or SQL-inspection API.
 * SQL errors remain engine errors; S2c owns sql_not_permitted refusals. */
export type SessionRole = 'privileged' | 'agent';
export type SessionLimits = Readonly<{ memoryMb: number; threads: number }>;
export type SessionRows = { columns: string[]; rows: unknown[][] };
export interface EngineSession {
 execute(sql: string): Promise<SessionRows>;
 close(): void;
}
export interface SessionEngine {
 open(role: SessionRole): Promise<EngineSession>;
}
export type SessionStatement = Readonly<{ sessionId: string; role: SessionRole; sql: string; outcome: 'completed' | 'failed' }>;
/** Opt-in, caller-owned statement log for verification. Never a row-value log.
 * No log is retained or published by the default adapter. */
export type StatementObserver = (entry: SessionStatement) => void;
