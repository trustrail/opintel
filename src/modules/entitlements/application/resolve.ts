import { z } from 'zod';
import { DomainError, err, ok, type Result } from '../../../shared/kernel/index.js';
import { quoteIdent, type CompileResult, type OmittedObject, type ViewDefinition } from './compile.js';

const part = z.string().min(1).refine(value => !value.includes('\0'));
const identifierSchema = z.object({ catalog: part, schema: part, name: part }).strict();
/** Components already decoded by the parser, not a dotted SQL string. */
export type ObjectIdentifier = z.infer<typeof identifierSchema>;

// DuckDB folds ASCII letters even in quoted identifiers, not Unicode letters.
// https://duckdb.org/docs/current/sql/dialect/keywords_and_identifiers
const fold = (value: string) => value.replace(/[A-Z]/gu, letter => letter.toLowerCase());
const matches = (a: ObjectIdentifier, b: ObjectIdentifier) =>
  fold(a.catalog) === fold(b.catalog) && fold(a.schema) === fold(b.schema) && fold(a.name) === fold(b.name);
const explanations: Record<OmittedObject['reason'], string> = {
  all_withheld: 'all columns are withheld by an explicit decision',
  all_undecided: 'all columns are undecided; an administrator must decide their treatments',
  mixed_withheld_undecided: 'some columns are withheld by an explicit decision and the remaining columns are undecided',
};

/** Resolve only within this pool's compilation snapshot. Returning a view is
 * namespace lookup, never binding, treatment approval or execution permission. */
export function resolveIdentifier(compilation: CompileResult, identifier: ObjectIdentifier): Result<ViewDefinition> {
  const parsed = identifierSchema.safeParse(identifier);
  if (!parsed.success) return err(new DomainError('sql_not_permitted', 'An object identifier must contain non-empty catalog, schema and name components without NUL characters.'));
  const address = parsed.data;
  const name = [address.catalog, address.schema, address.name].map(quoteIdent).join('.');
  const views = compilation.views.filter(view => matches(view, address));
  const omitted = compilation.omitted.filter(object => matches(object, address));
  if (views.length + omitted.length > 1) {
    return err(new DomainError('sql_not_permitted', `Object ${name} is ambiguous in the pool's compilation snapshot.`, { object: address }));
  }
  const view = views[0];
  if (view) return ok(view);
  const object = omitted[0];
  if (object) {
    return err(new DomainError('object_unavailable', `Object ${name} is unavailable: ${explanations[object.reason]}.`, {
      object: { catalog: object.catalog, schema: object.schema, name: object.name }, reason: object.reason,
    }));
  }
  return err(new DomainError('not_found', `Object ${name} was not found in the pool's namespace.`, { object: address }));
}
