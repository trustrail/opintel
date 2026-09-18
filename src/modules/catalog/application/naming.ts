import { createHash } from 'node:crypto';
import { DuckDbName, isDuckDbReservedWord, ok, type ElementId, type IdFactory } from '../../../shared/kernel/index.js';
import type { AssignElementIdentity } from '../domain/catalog.js';

export interface IdentifierTransliterator { ascii(identifier: string): string }
export type AssignedName = { name: DuckDbName | null; collision: boolean };

export class CatalogNaming {
  constructor(private readonly transliterator: IdentifierTransliterator) {}

  assign(original: string, reserved: readonly DuckDbName[] = []): AssignedName {
    let base = this.transliterator.ascii(original).toLowerCase().replace(/[^a-z0-9]+/gu, '_').replace(/^_+|_+$/gu, '');
    if (base.length === 0) return { name: null, collision: false };
    if (/^[0-9]/u.test(base)) base = `n_${base}`;
    if (isDuckDbReservedWord(base)) base += '_col';
    const hashSuffix = base.length > 63 ? `_${createHash('sha256').update(original).digest('hex').slice(0, 5)}` : '';
    if (hashSuffix) base = `${base.slice(0, 57)}${hashSuffix}`;
    const occupied = new Set<string>(reserved);
    let candidate = base;
    let suffix = 2;
    while (occupied.has(candidate)) {
      const tail = `_${suffix}`;
      candidate = `${base.slice(0, 63 - tail.length - hashSuffix.length)}${hashSuffix}${tail}`;
      suffix += 1;
    }
    return { name: DuckDbName(candidate), collision: candidate !== base };
  }

  elementIdentity(ids: IdFactory): AssignElementIdentity {
    return (discovery, reserved) => {
      const assigned = this.assign(discovery.sourceIdentifier, reserved);
      return ok({ id: ids.create<ElementId>(), duckdbName: assigned.name, collision: assigned.collision });
    };
  }
}
