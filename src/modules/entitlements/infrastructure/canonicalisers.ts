import { withPlatform, withTenant } from '../../../platform/db/scope.js';
import { DomainError, err, ok, type ElementId } from '../../../shared/kernel/index.js';
import type { ExposedType } from '../../catalog/index.js';
import { canonicaliserAssignment, standardCanonId, validateCanonicaliserType, type CanonicaliserAssignments, type CanonicaliserCatalog } from '../application/canonicalisers.js';
import type { EntitlementContext } from '../application/entitlement-repository.js';
type Row = { canon_id: string | null; exposed_type: ExposedType | null; epoch_unit: string | null; tokenized: boolean };
const select = `SELECT e.canon_id,e.exposed_type,e.epoch_unit,EXISTS(SELECT 1 FROM entitlement t WHERE t.element_id=e.id AND t.treatment='tokenized') AS tokenized FROM catalog_element e WHERE e.id=$1`;
const missing = () => err(new DomainError('not_found', 'The catalogue element was not found in this project.'));
export class PostgresCanonicaliserAssignments implements CanonicaliserAssignments {
  constructor(private readonly catalog: CanonicaliserCatalog) {}
  read(ctx: EntitlementContext, element: ElementId) { return withTenant(ctx, async tx => {
    const [row] = await tx.query<Row>(select, [element]);
    return row ? ok({canonId: row.canon_id ?? standardCanonId(row.exposed_type,row.epoch_unit)}) : missing();
  }); }
  async assign(ctx: EntitlementContext, element: ElementId, input: unknown) {
    const parsed = canonicaliserAssignment.safeParse(input);
    if (!parsed.success) return err(new DomainError('validation_failed', 'Choose a lowercase alphanumeric canonId advertised by the sidecar.'));
    const available = await this.catalog.canonicalisers();
    if (!available.ok) return available;
    if (!available.value.includes(parsed.data.canonId)) return err(new DomainError('validation_failed', 'This canonId is not available on the sidecar. Deploy the reviewed canonicaliser before assigning it.'));
    return withTenant(ctx, async tx => {
      const locked = await tx.query('SELECT s.id FROM data_source s JOIN catalog_object o ON o.source_id=s.id JOIN catalog_element e ON e.object_id=o.id WHERE e.id=$1 FOR UPDATE OF s',[element]);
      if (!locked.length) return missing();
      const [row] = await tx.query<Row>(select + ' FOR UPDATE OF e',[element]);
      if (!row) return missing();
      const valid = validateCanonicaliserType(parsed.data.canonId,row.exposed_type,row.epoch_unit);
      if (!valid.ok) return valid;
      if (row.tokenized && row.canon_id !== parsed.data.canonId) {
        const [project] = await withPlatform(p => p.query<{name:string}>('SELECT name FROM project WHERE id=$1',[ctx.projectId]));
        if (parsed.data.confirmation !== project?.name) return err(new DomainError('conflict', 'Assigning or changing a canonicaliser changes tokens. Type the project name exactly to confirm.'));
      }
      await tx.query('UPDATE catalog_element SET canon_id=$2 WHERE id=$1',[element,parsed.data.canonId]);
      return ok({canonId:parsed.data.canonId});
    });
  }
}
