import { withPlatform, withTenant } from '../../../platform/db/scope.js';
import { DomainError, err, ok, type ElementId } from '../../../shared/kernel/index.js';
import { tokenDeclarationPatch, validateTokenDeclarations, type TokenDeclarationRepository, type TokenDeclarations } from '../application/token-declarations.js';
import type { TemporalContext } from '../application/temporal.js';
import type { ExposedType } from '../domain/type-mapping.js';

type Row = TokenDeclarations & { exposedType: ExposedType | null; tokenized: boolean };
const select = `SELECT e.token_domain AS "tokenDomain", e.case_insensitive AS "caseInsensitive", e.exposed_type AS "exposedType",
 EXISTS(SELECT 1 FROM entitlement t WHERE t.element_id=e.id AND t.treatment='tokenized') AS tokenized FROM catalog_element e`;
const missing = () => err(new DomainError('not_found', 'The catalogue element was not found in this project.'));
const view = (row: TokenDeclarations): TokenDeclarations => ({ tokenDomain: row.tokenDomain, caseInsensitive: row.caseInsensitive });
export class PostgresTokenDeclarations implements TokenDeclarationRepository {
  read(ctx: TemporalContext, element: ElementId) {
    return withTenant(ctx, async tx => {
      const [row] = await tx.query<Row>(select + ' WHERE e.id=$1', [element]);
      return row ? ok(view(row)) : missing();
    });
  }
  setElement(ctx: TemporalContext, element: ElementId, input: unknown) {
    const parsed = tokenDeclarationPatch.safeParse(input);
    if (!parsed.success) return Promise.resolve(err(new DomainError('validation_failed', 'Declare tokenDomain as lowercase letters and digits (sentinel is reserved), and caseInsensitive as a boolean.')));
    const patch = parsed.data;
    return withTenant(ctx, async tx => {
      const locked = await tx.query('SELECT s.id FROM data_source s JOIN catalog_object o ON o.source_id=s.id JOIN catalog_element e ON e.object_id=o.id WHERE e.id=$1 FOR UPDATE OF s', [element]);
      if (!locked.length) return missing();
      const [row] = await tx.query<Row>(select + ' WHERE e.id=$1 FOR UPDATE OF e', [element]);
      if (!row) return missing();
      const next = { tokenDomain: patch.tokenDomain === undefined ? row.tokenDomain : patch.tokenDomain,
        caseInsensitive: patch.caseInsensitive === undefined ? row.caseInsensitive : patch.caseInsensitive };
      const valid = validateTokenDeclarations(row.exposedType, next, row.tokenized);
      if (!valid.ok) return valid;
      const changing = (row.tokenDomain !== null && next.tokenDomain !== row.tokenDomain)
        || (row.caseInsensitive !== null && next.caseInsensitive !== row.caseInsensitive);
      if (row.tokenized && changing) {
        const [project] = await withPlatform(platform => platform.query<{ name: string }>('SELECT name FROM project WHERE id=$1', [ctx.projectId]));
        if (patch.confirmation === undefined || project?.name !== patch.confirmation) {
          return err(new DomainError('conflict', 'Changing a declaration used by a tokenized entitlement changes its tokens. Type the project name exactly to confirm.'));
        }
      }
      await tx.query('UPDATE catalog_element SET token_domain=$2,case_insensitive=$3 WHERE id=$1', [element, next.tokenDomain, next.caseInsensitive]);
      return ok(next);
    });
  }
}
