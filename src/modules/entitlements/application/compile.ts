import type { CatalogElement, CatalogObject, ExposedType } from '../../catalog/index.js';
import { validateTokenizedTemporal, validateTokenDeclarations } from '../../catalog/index.js';
import type { SourceRef } from '../../sources/index.js';
import { DomainError, err, ok, type ElementId, type ExposedName, type PoolId, type Result } from '../../../shared/kernel/index.js';
import type { Entitlement, MaskKind, Treatment } from '../domain/entitlement.js';
import { standardCanonId, validateCanonicaliserType } from './canonicalisers.js';
import { validateMaskType } from './mask-compatibility.js';

export type TokenDeclaration = Readonly<{
  domain: string; canonId: string; mode: 'text' | 'number' | 'date' | 'timestamp';
  caseInsensitive: boolean; sourceTimezone?: string; epochUnit?: 'seconds' | 'milliseconds';
}>;
export type ReadColumn = Readonly<{
  sourceIdentifier: string; exposedName: ExposedName; exposedType: ExposedType;
  treatment: Exclude<Treatment, 'withheld'>; readAs: 'text' | 'native';
  token?: TokenDeclaration; mask?: Readonly<{ kind: MaskKind }>;
}>;
export type ReadPlan = Readonly<{ catalog: string; schema: string; object: string; columns: readonly ReadColumn[] }>;
export type CompiledColumn = Readonly<{
  elementId: ElementId; exposedName: ExposedName | null; sourceIdentifier: string;
  declaredType: ExposedType | null; state: 'emitted' | 'withheld' | 'undecided';
  treatment: Treatment | null; expression: string | null;
}>;
export type AggregateOnly = Readonly<{ elementId: ElementId; exposedName: ExposedName; object: ExposedName; minGroupSize: number }>;
export type ViewDefinition = Readonly<{
  catalog: string; schema: string; name: string; ddl: string;
  columns: readonly CompiledColumn[]; constraints: readonly AggregateOnly[]; readPlan: ReadPlan;
}>;
export type OmittedObject = Readonly<{
  catalog: string; schema: string; name: string;
  reason: 'all_withheld' | 'all_undecided' | 'mixed_withheld_undecided';
}>;
export type CompileResult = Readonly<{ views: readonly ViewDefinition[]; omitted: readonly OmittedObject[] }>;
export type CompileInput = Readonly<{
  poolId: PoolId; boundSources: readonly SourceRef[]; objects: readonly CatalogObject[];
  elements: readonly CatalogElement[]; entitlements: ReadonlyMap<ElementId, Entitlement>;
  aggregateMinGroupSize: number; policyVersion: number;
}>;

/** The sole SQL interpolation boundary. Callers validate identifiers before use. */
export function quoteIdent(identifier: string): string { return `"${identifier.replaceAll('"', '""')}"`; }
const validIdentifier = (value: string) => value.length > 0 && !value.includes('\0');
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const invalid = (message: string) => err(new DomainError('validation_failed', message));

function tokenDeclaration(element: CatalogElement): Result<TokenDeclaration> {
  const e = element.state;
  if (e.exposedType === 'FLOAT' || e.exposedType === 'DOUBLE') return invalid(`Floating-point element ${e.sourceIdentifier} cannot be tokenized. Cast it upstream to numeric or integer minor units.`);
  const valid = validateTokenDeclarations(e.exposedType, {tokenDomain:e.tokenDomain ?? null,caseInsensitive:e.caseInsensitive ?? null}, true);
  if (!valid.ok) return valid;
  const domain = e.tokenDomain;
  if (!domain || !/^[a-z0-9]+$(?![\s\S])/u.test(domain) || domain === 'sentinel') return invalid(`Declare a valid tokenDomain for ${e.sourceIdentifier} before tokenization; sentinel is reserved.`);
  const epochUnit = e.epochUnit ?? null;
  const sourceTimezone = e.sourceTimezone ?? e.schemaTimezone ?? null;
  const temporal = validateTokenizedTemporal(e.exposedType, { sourceTimezone, epochUnit });
  if (!temporal.ok) return temporal;
  const canonId = e.canonId ?? standardCanonId(e.exposedType, epochUnit);
  if (!/^[a-z0-9]+$(?![\s\S])/u.test(canonId)) return invalid(`Invalid canonId for ${e.sourceIdentifier}.`);
  const canonicaliser = validateCanonicaliserType(canonId, e.exposedType, epochUnit);
  if (!canonicaliser.ok) return canonicaliser;
  const mode = epochUnit !== null || e.exposedType === 'TIMESTAMP' || e.exposedType === 'TIMESTAMPTZ' ? 'timestamp'
    : e.exposedType === 'DATE' ? 'date'
      : e.exposedType === 'VARCHAR' || e.exposedType === 'UUID' ? 'text'
        : e.exposedType !== null && /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|DECIMAL\()/u.test(e.exposedType) ? 'number' : null;
  if (mode === null) return invalid(`The type of ${e.sourceIdentifier} has no supported tokenization mode.`);
  return ok(Object.freeze({ domain, canonId, mode, caseInsensitive: mode === 'text' ? e.caseInsensitive ?? true : false,
    ...(sourceTimezone === null ? {} : { sourceTimezone }), ...(epochUnit === null ? {} : { epochUnit }) }));
}

/** Snapshot-only compilation. No source contact, key resolution, treatment execution or cache. */
export function compileViews(input: CompileInput): Result<CompileResult> {
  if (!Number.isSafeInteger(input.policyVersion) || input.policyVersion < 0 || !Number.isSafeInteger(input.aggregateMinGroupSize) || input.aggregateMinGroupSize < 1) return invalid('Compilation requires a valid policyVersion and a positive aggregateMinGroupSize.');
  const sources = new Map(input.boundSources.map(source => [source.id, source]));
  if (sources.size !== input.boundSources.length || new Set(input.boundSources.map(source => source.alias)).size !== sources.size || new Set(input.boundSources.map(source => source.projectId)).size > 1) return invalid('Bound sources must have distinct identities and aliases in one project.');
  const objects = input.objects.filter(object => object.state.status === 'active' && sources.has(object.state.sourceId));
  const objectIds = new Set(objects.map(object => object.state.id));
  if (objectIds.size !== objects.length) return invalid('A catalogue object appears more than once in the compilation snapshot.');
  const elements = new Map<string, CatalogElement[]>();
  const elementIds = new Set<ElementId>();
  for (const element of input.elements) {
    if (element.state.status !== 'active' || !objectIds.has(element.state.objectId)) continue;
    if (elementIds.has(element.state.id)) return invalid('A catalogue element appears more than once in the compilation snapshot.');
    elementIds.add(element.state.id);
    const group = elements.get(element.state.objectId) ?? [];
    group.push(element); elements.set(element.state.objectId, group);
  }
  objects.sort((a, b) => compare(sources.get(a.state.sourceId)!.alias, sources.get(b.state.sourceId)!.alias)
    || compare(a.state.exposedSchema, b.state.exposedSchema) || compare(a.state.exposedName, b.state.exposedName));
  const views: ViewDefinition[] = [], omitted: OmittedObject[] = [];
  const addresses = new Set<string>(), stagedNames = new Set<string>();
  for (const object of objects) {
    const o = object.state, source = sources.get(o.sourceId)!;
    const address = { catalog: source.alias, schema: o.exposedSchema, name: o.exposedName };
    if (source.projectId !== o.projectId || ![address.catalog,address.schema,address.name,o.schemaName,o.objectName].every(validIdentifier)) return invalid('A catalogue object has an invalid address or belongs to another project.');
    const key = JSON.stringify(address), staged = `${address.catalog}__${address.schema}__${address.name}`;
    if (addresses.has(key) || stagedNames.has(staged)) return invalid('Catalogue objects collide in the exposed or staging namespace.');
    addresses.add(key); stagedNames.add(staged);
    const group = elements.get(o.id) ?? [];
    const ordinals = new Set<number>(), names = new Set<string>();
    for (const { state: e } of group) {
      if (e.projectId !== o.projectId) return invalid('A catalogue element belongs to another project.');
      if (e.ordinal === undefined || e.ordinal === null || !Number.isSafeInteger(e.ordinal) || e.ordinal < 0) return invalid(`Source ordinal is unknown for object ${address.catalog}.${address.schema}.${address.name} (element ${e.sourceIdentifier}). The source must be re-introspected before compiling.`);
      if (ordinals.has(e.ordinal)) return invalid('Source column ordinals must be distinct within an object.');
      ordinals.add(e.ordinal);
      if (e.exposedName !== null) {
        if (!validIdentifier(e.exposedName) || names.has(e.exposedName)) return invalid('Exposed column names must be valid and distinct within an object.');
        names.add(e.exposedName);
      }
    }
    group.sort((a,b) => a.state.ordinal! - b.state.ordinal!);
    const columns: CompiledColumn[] = [], readColumns: ReadColumn[] = [], constraints: AggregateOnly[] = [];
    let withheld = 0, undecided = 0;
    for (const element of group) {
      const e = element.state, decision = input.entitlements.get(e.id)?.state;
      if (decision && (decision.poolId !== input.poolId || decision.elementId !== e.id || decision.projectId !== o.projectId)) return invalid('An entitlement does not belong to this pool, element and project.');
      const treatment = decision?.treatment ?? null;
      if (treatment === null || treatment === 'withheld') {
        if (treatment === null) undecided++; else withheld++;
        columns.push(Object.freeze({ elementId:e.id, exposedName:e.exposedName, sourceIdentifier:e.sourceIdentifier,
          declaredType:null, state:treatment === null ? 'undecided' : 'withheld', treatment, expression:null }));
        continue;
      }
      if (e.exposedName === null || e.exposedType === null || !validIdentifier(e.sourceIdentifier)) return invalid(`The entitled element ${e.sourceIdentifier} has no usable exposed name or type.`);
      if (!['clear','tokenized','masked','aggregate_only'].includes(treatment)) return invalid('An entitlement has an unknown treatment.');
      const exposedType = treatment === 'tokenized' || treatment === 'masked' ? 'VARCHAR' : e.exposedType;
      const column: ReadColumn = { sourceIdentifier:e.sourceIdentifier, exposedName:e.exposedName, exposedType, treatment,
        readAs:treatment === 'tokenized' || treatment === 'masked' ? 'text' : 'native' };
      let token: TokenDeclaration | undefined, mask: ReadColumn['mask'];
      if (treatment === 'tokenized') { const declaration = tokenDeclaration(element); if (!declaration.ok) return declaration; token = declaration.value; }
      if (treatment === 'masked') {
        if (!decision?.maskKind) return invalid(`Declare a mask kind for ${e.sourceIdentifier}.`);
        const valid = validateMaskType(decision.maskKind,e.exposedType); if (!valid.ok) return valid;
        mask = Object.freeze({kind:decision.maskKind});
      }
      readColumns.push(Object.freeze({...column,...(token ? {token} : {}),...(mask ? {mask} : {})}));
      columns.push(Object.freeze({elementId:e.id,exposedName:e.exposedName,sourceIdentifier:e.sourceIdentifier,declaredType:exposedType,state:'emitted',treatment,expression:quoteIdent(e.exposedName)}));
      if (treatment === 'aggregate_only') constraints.push(Object.freeze({elementId:e.id,exposedName:e.exposedName,object:o.exposedName,minGroupSize:input.aggregateMinGroupSize}));
    }
    if (!readColumns.length) {
      omitted.push(Object.freeze({...address,reason:withheld && undecided ? 'mixed_withheld_undecided' : withheld ? 'all_withheld' : 'all_undecided'}));
      continue;
    }
    const ddl = `CREATE VIEW ${[address.catalog,address.schema,address.name].map(quoteIdent).join('.')} AS SELECT ${readColumns.map(column => quoteIdent(column.exposedName)).join(', ')} FROM ${quoteIdent('__staging')}.${quoteIdent(staged)};`;
    views.push(Object.freeze({...address,ddl,columns:Object.freeze(columns),constraints:Object.freeze(constraints),
      readPlan:Object.freeze({catalog:address.catalog,schema:o.schemaName,object:o.objectName,columns:Object.freeze(readColumns)})}));
  }
  return ok(Object.freeze({views:Object.freeze(views),omitted:Object.freeze(omitted)}));
}
