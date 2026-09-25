export type ExposedType =
  | 'BOOLEAN' | 'TINYINT' | 'SMALLINT' | 'INTEGER' | 'BIGINT' | 'HUGEINT'
  | 'FLOAT' | 'DOUBLE' | `DECIMAL(${number},${number})`
  | 'VARCHAR' | 'DATE' | 'TIME' | 'TIMESTAMP' | 'TIMESTAMPTZ'
  | 'UUID' | 'JSON' | `LIST(${string})` | `STRUCT(${string})`;

export type SourceTypeSpec = string
  | { kind: 'decimal' | 'money'; precision: number; scale: number }
  | { kind: 'uuid'; wellFormed: boolean }
  | { kind: 'array'; element: SourceTypeSpec }
  | { kind: 'struct'; fields: readonly { name: string; type: SourceTypeSpec }[] };

const simpleTypes: Readonly<Record<string, ExposedType>> = {
  bool: 'BOOLEAN', boolean: 'BOOLEAN', tinyint: 'TINYINT', smallint: 'SMALLINT', int2: 'SMALLINT',
  int: 'INTEGER', integer: 'INTEGER', int4: 'INTEGER', bigint: 'BIGINT', int8: 'BIGINT', hugeint: 'HUGEINT',
  real: 'FLOAT', float4: 'FLOAT', float: 'FLOAT', float8: 'DOUBLE', double: 'DOUBLE', 'double precision': 'DOUBLE',
  text: 'VARCHAR', varchar: 'VARCHAR', 'character varying': 'VARCHAR', char: 'VARCHAR', character: 'VARCHAR', clob: 'VARCHAR',
  date: 'DATE', time: 'TIME', 'time without time zone': 'TIME',
  timestamp: 'TIMESTAMP', 'timestamp without time zone': 'TIMESTAMP',
  timestamptz: 'TIMESTAMPTZ', 'timestamp with time zone': 'TIMESTAMPTZ',
  uuid: 'UUID', json: 'JSON', jsonb: 'JSON',
};

// Null is an unsupported type, never an undecided entitlement. Unknown widths,
// precision and nested fields are not guessed or silently narrowed.
export function mapSourceType(source: SourceTypeSpec): ExposedType | null {
  if (typeof source !== 'string') {
    switch (source.kind) {
      case 'uuid': return source.wellFormed ? 'UUID' : 'VARCHAR';
      case 'decimal': case 'money':
        return Number.isInteger(source.precision) && Number.isInteger(source.scale)
          && source.precision >= 1 && source.precision <= 38 && source.scale >= 0 && source.scale <= source.precision
          ? `DECIMAL(${source.precision},${source.scale})` : null;
      case 'array': {
        const element = mapSourceType(source.element);
        return element === null ? null : `LIST(${element})`;
      }
      case 'struct': {
        if (source.fields.length === 0) return null;
        const names = new Set<string>();
        const fields: string[] = [];
        for (const field of source.fields) {
          const type = mapSourceType(field.type);
          if (type === null || field.name.length === 0 || names.has(field.name.toLowerCase())) return null;
          names.add(field.name.toLowerCase());
          fields.push(`"${field.name.replaceAll('"', '""')}" ${type}`);
        }
        return `STRUCT(${fields.join(', ')})`;
      }
    }
  }
  const name = source.trim().toLowerCase().replace(/\s+/gu, ' ');
  if (name.endsWith('[]')) return mapSourceType({ kind: 'array', element: name.slice(0, -2) });
  const decimal = /^(?:numeric|decimal)\s*\(\s*(\d+)(?:\s*,\s*(\d+))?\s*\)$/u.exec(name);
  if (decimal !== null) return mapSourceType({ kind: 'decimal', precision: Number(decimal[1]), scale: Number(decimal[2] ?? 0) });
  if (/^(?:varchar|character varying|char|character)\s*\(\d+\)$/u.test(name)) return 'VARCHAR';
  return Object.hasOwn(simpleTypes, name) ? simpleTypes[name] ?? null : null;
}

export type Treatment = 'clear' | 'tokenized' | 'masked' | 'aggregate_only' | 'withheld';
export function postTreatmentType(type: ExposedType | null, treatment: Treatment | null): ExposedType | null {
  if (type === null || treatment === null || treatment === 'withheld') return null;
  return treatment === 'tokenized' || treatment === 'masked' ? 'VARCHAR' : type;
}
