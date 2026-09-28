/** Low-level engine boundary, not an authorization or SQL-inspection API.
 * SQL errors remain engine errors; S2c owns sql_not_permitted refusals. */
export type SessionRole = 'privileged' | 'agent';
export type SessionLimits = Readonly<{ memoryMb: number; threads: number }>;
export type SessionRows = { columns: string[]; rows: unknown[][] };
export interface EngineSession {
 execute(sql: string): Promise<SessionRows>;
 inspection?: SessionInspection;
 close(): void;
}
export type ParseOutcome =
 | { kind: 'parse_failed' | 'serialization_refused'; error: string }
 | { kind: 'parsed'; tree: unknown; prepare(): Promise<{ kind: 'bound'; handle: PreparedHandle } | { kind: 'unresolved' }> };
export interface PreparedHandle {
 execute(): Promise<SessionRows>;
 close(): void;
}
export interface SessionInspection {
 build(): Promise<string>;
 parse(sql: string): Promise<ParseOutcome>;
 objects(): Promise<{ catalog: string; schema: string; name: string }[]>;
 hasExternalState(allowedCatalogs: readonly string[]): Promise<boolean>;
}
export type InspectionEvent =
 | { stage: 'parse_started' | 'parse_succeeded' | 'serialize_started' | 'prepare_started' | 'prepared' | 'execute_started' | 'executed' | 'released' }
 | { stage: 'parse_failed' | 'serialization_refused' | 'binding_failed'; error: string }
 | { stage: 'serialized'; tree: unknown }
 | { stage: 'inspected'; permitted: boolean; construct?: string; tree: unknown };
/** Opt-in test evidence, NOT telemetry: trees can contain SQL literals. */
export type InspectionObserver = (event: InspectionEvent) => void;
export interface SessionEngine {
 open(role: SessionRole): Promise<EngineSession>;
}
export type SessionStatement = Readonly<{ sessionId: string; role: SessionRole; sql: string; outcome: 'completed' | 'failed' }>;
/** Opt-in, caller-owned statement log for verification. Never a row-value log.
 * No log is retained or published by the default adapter. */
export type StatementObserver = (entry: SessionStatement) => void;
