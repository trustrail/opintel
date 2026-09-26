import { createHash } from 'node:crypto';
import { ExposedName, isReservedExposedName, ok, type ElementId, type IdFactory } from '../../../shared/kernel/index.js';
import type { AssignElementIdentity } from '../domain/catalog.js';

export interface IdentifierTransliterator { ascii(identifier: string): string }
export type AssignedName = { name: ExposedName | null; collision: boolean };

export class CatalogNaming {
  constructor(private readonly transliterator: IdentifierTransliterator) {}

  assign(original: string, reserved: readonly ExposedName[] = []): AssignedName {
    let base = this.transliterator.ascii(original).toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '');
    if (base.length === 0) return { name: null, collision: false };
    if (/^[0-9]/u.test(base)) base = `n_${base}`;
    if (isReservedExposedName(base)) base += '_col';
    const hashSuffix = base.length > 63 ? `_${createHash('sha256').update(original).digest('hex').slice(0, 5)}` : '';
    if (hashSuffix) base = `${base.slice(0, 57)}${hashSuffix}`;
    const occupied = new Set<string>(reserved.map(name => name.toLowerCase()));
    let candidate = base;
    let suffix = 2;
    while (occupied.has(candidate)) {
      const tail = `_${suffix}`;
      candidate = `${base.slice(0, 63 - tail.length - hashSuffix.length)}${hashSuffix}${tail}`;
      suffix += 1;
    }
    return { name: ExposedName(candidate), collision: candidate !== base };
  }

  elementIdentity(ids: IdFactory): AssignElementIdentity {
    return (discovery, reserved) => {
      const assigned = this.assign(discovery.sourceIdentifier, reserved);
      return ok({ id: ids.create<ElementId>(), exposedName: assigned.name, collision: assigned.collision });
    };
  }
}
