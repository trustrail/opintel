import { InvariantViolation } from './errors.js';

type Brand<Name extends string> = string & { readonly __brand: Name };

export type CompanyId = Brand<'CompanyId'>;
export type ProjectId = Brand<'ProjectId'>;
export type UserId = Brand<'UserId'>;
export type SourceId = Brand<'SourceId'>;
export type ObjectId = Brand<'ObjectId'>;
export type ElementId = Brand<'ElementId'>;
export type PoolId = Brand<'PoolId'>;
export type RunId = Brand<'RunId'>;
export type IndustryId = Brand<'IndustryId'>;
export type TermId = Brand<'TermId'>;
export type RuleId = Brand<'RuleId'>;
export type DemoSourceId = Brand<'DemoSourceId'>;
export type FilingId = Brand<'FilingId'>;
export type SessionId = Brand<'SessionId'>;
export type InviteId = Brand<'InviteId'>;

export type DuckDbName = Brand<'DuckDbName'>;
export type IndustrySlug = Brand<'IndustrySlug'>;
export type PoolKey = Brand<'PoolKey'>;
export type ProjectName = Brand<'ProjectName'>;
export type PoolName = Brand<'PoolName'>;
export type SourceName = Brand<'SourceName'>;
export type TermName = Brand<'TermName'>;

export type Region = 'eu-west-1' | 'us-east-1' | 'ap-southeast-1' | 'ap-southeast-3';
export type GrainRule = 'sum' | 'sum_over_sum' | 'avg_of_ratio' | 'none';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const duckDbReservedWords = new Set([
  // DuckDB v1.4.3 parser/kwlist.hpp reserved entries, plus the existing
  // conservative identifier restrictions below. This is a discovery-time list.
  'analyse', 'analyze', 'any', 'array', 'asymmetric', 'both', 'collate',
  'deferrable', 'describe', 'do', 'foreign', 'initially', 'lambda', 'lateral',
  'leading', 'only', 'pivot', 'pivot_longer', 'pivot_wider', 'placing', 'qualify',
  'show', 'some', 'summarize', 'symmetric', 'to', 'trailing', 'unpivot', 'variadic', 'window',
  'all', 'and', 'as', 'asc', 'between', 'by', 'case', 'cast', 'check', 'column', 'constraint',
  'create', 'cross', 'default', 'delete', 'desc', 'distinct', 'drop', 'else', 'end', 'except',
  'exists', 'false', 'fetch', 'for', 'from', 'full', 'group', 'having', 'in', 'inner', 'insert',
  'intersect', 'into', 'is', 'join', 'left', 'like', 'limit', 'not', 'null', 'offset', 'on', 'or',
  'order', 'outer', 'primary', 'references', 'returning', 'right', 'select', 'set', 'table', 'then',
  'true', 'union', 'unique', 'update', 'using', 'values', 'when', 'where', 'with',
]);

function uuidFactory<Name extends string>(name: Name): (raw: string) => Brand<Name> {
  return (raw) => {
    if (!uuid.test(raw)) throw new InvariantViolation(name, raw);
    return raw as Brand<Name>;
  };
}

function textFactory<Name extends string>(
  name: Name,
  isValid: (raw: string) => boolean,
): (raw: string) => Brand<Name> {
  return (raw) => {
    if (!isValid(raw)) throw new InvariantViolation(name, raw);
    return raw as Brand<Name>;
  };
}

export const CompanyId = uuidFactory('CompanyId');
export const ProjectId = uuidFactory('ProjectId');
export const UserId = uuidFactory('UserId');
export const SourceId = uuidFactory('SourceId');
export const ObjectId = uuidFactory('ObjectId');
export const ElementId = uuidFactory('ElementId');
export const PoolId = uuidFactory('PoolId');
export const RunId = uuidFactory('RunId');
export const IndustryId = uuidFactory('IndustryId');
export const TermId = uuidFactory('TermId');
export const RuleId = uuidFactory('RuleId');
export const DemoSourceId = uuidFactory('DemoSourceId');
export const FilingId = uuidFactory('FilingId');
export const SessionId = uuidFactory('SessionId');
export const InviteId = uuidFactory('InviteId');

export const isDuckDbReservedWord = (raw: string): boolean => duckDbReservedWords.has(raw.toLowerCase());

export const DuckDbName = textFactory(
  'DuckDbName',
  (raw) => /^[a-z_][a-z0-9_]{0,62}$/u.test(raw) && !isDuckDbReservedWord(raw),
);
export const IndustrySlug = textFactory('IndustrySlug', (raw) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(raw));
export const PoolKey = textFactory('PoolKey', (raw) => /^opk_live_[A-Za-z0-9]{22}$/u.test(raw));
const nameIsValid = (raw: string): boolean => raw.length >= 1 && raw.length <= 80;
export const ProjectName = textFactory('ProjectName', nameIsValid);
export const PoolName = textFactory('PoolName', nameIsValid);
export const SourceName = textFactory('SourceName', nameIsValid);
export const TermName = textFactory('TermName', (raw) => /^[a-z][a-z0-9_]*$/u.test(raw));
