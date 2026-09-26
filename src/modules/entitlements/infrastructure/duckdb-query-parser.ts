import { DuckDBInstance } from '@duckdb/node-api';
import { z } from 'zod';
import { DomainError, err, ok, type Result } from '../../../shared/kernel/index.js';
import type { QueryParserPort } from '../application/query-parser-port.js';

const rows = z.array(z.object({ library_version: z.string(), source_id: z.string() })).length(1);
const serialized = z.array(z.object({ syntax: z.string() })).length(1);
const parseFailure = z.object({ error: z.literal(true), error_type: z.string() });

/** An empty, ephemeral parser instance. Agent SQL is only a VARCHAR argument
 * to json_serialize_sql, never a statement submitted for execution or binding.
 * This is not S2's execution session or its authoritative inspection. */
export class DuckDBQueryParser implements QueryParserPort {
  async parse(sql: string): Promise<Result<{ parserBuild: string; tree: unknown }>> {
    const instance = await DuckDBInstance.create(':memory:', {
      enable_external_access: 'false', autoinstall_known_extensions: 'false',
      autoload_known_extensions: 'false', threads: '1',
    });
    try {
      const connection = await instance.connect();
      try {
        const version = rows.parse((await connection.runAndReadAll('SELECT library_version, source_id FROM pragma_version()')).getRowObjects())[0]!;
        const result = serialized.parse((await connection.runAndReadAll('SELECT CAST(json_serialize_sql(CAST($1 AS VARCHAR)) AS VARCHAR) AS syntax', [sql])).getRowObjects())[0]!;
        const tree: unknown = JSON.parse(result.syntax);
        const failure = parseFailure.safeParse(tree);
        if (failure.success) return err(new DomainError('sql_not_permitted', `DuckDB could not serialize the statement (${failure.data.error_type}). Use an interpretable SELECT, WITH, VALUES or object DESCRIBE statement.`, { construct: failure.data.error_type, stage: 'application_pre_filter' }));
        return ok({ parserBuild: `${version.library_version}/${version.source_id}`, tree });
      } finally { connection.closeSync(); }
    } finally { instance.closeSync(); }
  }
}
