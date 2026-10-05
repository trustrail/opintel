import { DomainError, err, ok, type Result } from '../../../shared/kernel/index.js';
import type { ExposedType } from '../domain/type-mapping.js';
import { standardCanonicaliser as standardCanonId } from '../../../shared/token-declarations.js';
export { standardCanonId };
export function validateCanonicaliserType(id: string, type: ExposedType | null, epochUnit: string | null): Result<void> {
  const standard = standardCanonId(type, epochUnit);
  if (id === standard || (standard === 'stdtext1' && (type === 'VARCHAR' || type === 'UUID') && !['stdtext1','stdnum1','stddate1','stdtime1'].includes(id))) return ok(undefined);
  return err(new DomainError('validation_failed', `The explicit canonicaliser ${id} is incompatible with the proposed element mode, which requires ${standard}. Keep the mode or deliberately choose a compatible canonicaliser in the same save.`,{fields:['canonId','epochUnit']}));
}
