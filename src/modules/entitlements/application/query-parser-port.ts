import type { Result } from '../../../shared/kernel/index.js';

/** Syntax only. Neither this port nor its consumer can authorise execution. */
export interface QueryParserPort {
  parse(sql: string): Promise<Result<{ parserBuild: string; tree: unknown }>>;
}
