import { z } from 'zod';
import { DomainError, err, ok, type ElementId, type Result } from '../../../shared/kernel/index.js';
import type { ViewDefinition } from './compile.js';
import type { QueryParserPort } from './query-parser-port.js';
import * as syntax from './query-syntax.js';

type Reference = { elementId: ElementId; name: string; treatment: 'tokenized' | 'aggregate_only'; threshold: number };
type Field = { name: string; references: Reference[] };
type Relation = { qualifiers: string[][]; fields: Field[] };
type Clause = 'SELECT' | 'WHERE' | 'JOIN' | 'GROUP BY' | 'HAVING' | 'ORDER BY' | 'LIMIT' | 'VALUES';
type Context = { relations: Relation[]; clause: Clause; aliases?: Field[]; directAggregate?: boolean };
const fold = (name: string) => name.toLowerCase();
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => fold(v) === fold(b[i]!));

/** Syntax-level lookup is deliberately not DuckDB binding. S2 must inspect again. */
class Inspection {
  failure: DomainError | undefined;
  private depth = 0;
  private visits = 0;
  constructor(private readonly views: readonly ViewDefinition[]) {}

  refuse(construct: string): void {
    this.failure ??= new DomainError('sql_not_permitted', `The application pre-filter cannot interpret ${construct}. Rewrite the query; sidecar inspection is still required.`, { construct, stage: 'application_pre_filter' });
  }

  read<T>(schema: z.ZodType<T>, value: unknown, construct: string): T | undefined {
    if (this.failure) return undefined;
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path.join('.') || construct;
      this.refuse(`${construct} (${path})`);
      return undefined;
    }
    return parsed.data;
  }

  private enter(): boolean {
    if (this.failure) return false;
    if (++this.visits > 10000 || this.depth >= 100) { this.refuse('query complexity'); return false; }
    this.depth++;
    return true;
  }

  private check(references: Reference[], context: Context, operation?: string): void {
    for (const ref of references) {
      if (ref.treatment === 'aggregate_only' && !context.directAggregate) {
        this.failure ??= new DomainError('entitlement_missing', `Element ${ref.name} is aggregate-only and cannot appear in ${context.clause}${operation ? ` (${operation})` : ''}. Minimum group size is ${ref.threshold}; refused by the application pre-filter.`, {
          elementId: ref.elementId, operation: operation ?? context.clause, aggregateMinGroupSize: ref.threshold, stage: 'application_pre_filter',
        });
      } else if (ref.treatment === 'tokenized' && (operation !== undefined || context.clause === 'ORDER BY')) {
        const op = operation ?? 'ORDER BY';
        this.failure ??= new DomainError('unsupported_on_token', `Element ${ref.name} cannot be used with ${op}: tokens preserve equality only.`, { elementId: ref.elementId, operation: op, stage: 'application_pre_filter' });
      }
    }
  }

  private lookup(names: string[], context: Context): Reference[] {
    const name = names.at(-1)!;
    const qualifier = names.slice(0, -1);
    const candidates = context.relations.filter(r => qualifier.length === 0 || r.qualifiers.some(q => same(q, qualifier)))
      .flatMap(r => r.fields.filter(f => fold(f.name) === fold(name)));
    const aliases = qualifier.length === 0 ? context.aliases?.filter(f => fold(f.name) === fold(name)) ?? [] : [];
    // Ambiguous input/output aliases are refused rather than guessing DuckDB's precedence.
    if (aliases.length && candidates.length) {
      if (aliases.length !== 1 || candidates.length !== 1 || JSON.stringify(aliases[0]!.references) !== JSON.stringify(candidates[0]!.references)) {
        this.refuse(`ambiguous identifier ${names.join('.')}`); return [];
      }
    }
    const matches = candidates.length ? candidates : aliases;
    if (matches.length !== 1) { this.refuse(`unresolved or ambiguous identifier ${names.join('.')}`); return []; }
    return matches[0]!.references;
  }

  expression(value: unknown, context: Context): Reference[] {
    if (!this.enter()) return [];
    try {
      const raw = this.read(syntax.record, value, 'expression');
      if (!raw) return [];
      switch (raw.class) {
        case 'COLUMN_REF': {
          const e = this.read(syntax.column, value, 'column reference');
          if (!e) return [];
          const refs = this.lookup(e.column_names, context);
          this.check(refs, context);
          return refs;
        }
        case 'CONSTANT': this.read(syntax.constant, value, 'constant'); return [];
        case 'FUNCTION': {
          const e = this.read(syntax.func, value, 'function');
          if (!e) return [];
          const name = fold(e.function_name);
          const aggregate = ['sum', 'avg', 'min', 'max', 'count', 'count_star'].includes(name) && !e.is_operator;
          const operation = ['+', '-', '*', '/', '//', '%', '**', '^', '~~', '!~~', '~~*', '!~~*'].includes(name) && e.is_operator;
          if (!aggregate && !operation) { this.refuse(`function ${name}`); return []; }
          if (e.order_bys.orders.length) { this.refuse('aggregate ORDER BY'); return []; }
          // Aggregate FILTER changes per-aggregate cardinality, which this pre-filter cannot estimate.
          if (e.filter !== null) {
            this.expression(e.filter, { ...context, clause: 'WHERE', directAggregate: false });
            this.refuse('aggregate FILTER'); return [];
          }
          const direct = aggregate && (context.clause === 'SELECT' || context.clause === 'HAVING');
          const refs = e.children.flatMap(child => {
            const r = this.read(syntax.record, child, 'function argument');
            return this.expression(child, { ...context, directAggregate: direct && r?.class === 'COLUMN_REF' });
          });
          const tokenOperation = operation ? (name.includes('~~') ? 'LIKE' : name) : name === 'count' || name === 'count_star' ? undefined : name.toUpperCase();
          // Protected aggregate references were checked at their immediate parent.
          if (tokenOperation) this.check(refs.filter(r => r.treatment === 'tokenized'), context, tokenOperation);
          if (aggregate) return [];
          return refs;
        }
        case 'COMPARISON': {
          const e = this.read(syntax.comparison, value, 'comparison');
          if (!e) return [];
          const refs = [e.left, e.right].flatMap(child => this.expression(child, { ...context, directAggregate: false }));
          if (!['COMPARE_EQUAL', 'COMPARE_NOTEQUAL'].includes(e.type)) this.check(refs, context, e.type);
          // Equality and predicates produce booleans, not tokens. ORDER BY on a token
          // is still refused while visiting the operand in its original clause.
          return [];
        }
        case 'BETWEEN': {
          const e = this.read(syntax.between, value, 'BETWEEN');
          if (!e) return [];
          const refs = [e.input, e.lower, e.upper].flatMap(child => this.expression(child, { ...context, directAggregate: false }));
          this.check(refs, context, 'BETWEEN'); return [];
        }
        case 'OPERATOR': case 'CONJUNCTION': {
          const e = this.read(syntax.operator, value, 'operator');
          if (!e) return [];
          e.children.forEach(child => this.expression(child, { ...context, directAggregate: false }));
          return [];
        }
        case 'WINDOW': {
          const e = this.read(syntax.window, value, 'WINDOW');
          if (!e) return [];
          const windowContext = { ...context, directAggregate: false };
          const refs = [...e.children, ...e.partitions, ...e.orders.map(o => o.expression), ...e.arg_orders.map(o => o.expression),
            e.start_expr, e.end_expr, e.offset_expr, e.default_expr, e.filter_expr]
            .filter(child => child !== null).flatMap(child => this.expression(child, windowContext));
          this.check(refs, windowContext, e.start.includes('RANGE') || e.end.includes('RANGE') ? 'RANGE WINDOW' : 'WINDOW');
          this.refuse('WINDOW');
          return [];
        }
        default: this.refuse(`expression ${String(raw.class)}`); return [];
      }
    } finally { this.depth--; }
  }

  private relation(value: unknown, ctes: ReadonlyMap<string, Field[]>): Relation[] {
    if (!this.enter()) return [];
    try {
      const raw = this.read(syntax.record, value, 'table reference');
      if (!raw) return [];
      switch (raw.type) {
        case 'EMPTY': this.read(syntax.emptyTable, value, 'empty FROM'); return [];
        case 'BASE_TABLE': {
          const t = this.read(syntax.baseTable, value, 'table reference');
          if (!t) return [];
          const cte = !t.catalog_name && !t.schema_name ? ctes.get(fold(t.table_name)) : undefined;
          if (cte) return [{ qualifiers: [[t.alias || t.table_name]], fields: cte }];
          const matches = this.views.filter(v => same([v.catalog, v.schema, v.name], [t.catalog_name, t.schema_name, t.table_name]));
          if (!t.catalog_name || !t.schema_name || matches.length !== 1) {
            this.refuse(`table ${[t.catalog_name, t.schema_name, t.table_name].filter(Boolean).join('.')}`); return [];
          }
          const view = matches[0]!;
          const fields: Field[] = [];
          for (const col of view.columns) {
            if (col.state !== 'emitted' || col.exposedName === null) continue;
            const refs: Reference[] = [];
            if (col.treatment === 'aggregate_only' || col.treatment === 'tokenized') {
              const constraint = view.constraints.find(c => c.elementId === col.elementId);
              if (col.treatment === 'aggregate_only' && (!constraint || !Number.isSafeInteger(constraint.minGroupSize) || constraint.minGroupSize < 1)) this.refuse(`aggregate constraint for ${col.exposedName}`);
              refs.push({ elementId: col.elementId, name: col.exposedName, treatment: col.treatment, threshold: constraint?.minGroupSize ?? 0 });
            } else if (col.treatment !== 'clear' && col.treatment !== 'masked') this.refuse(`treatment for ${col.exposedName}`);
            fields.push({ name: col.exposedName, references: refs });
          }
          return [{ qualifiers: t.alias ? [[t.alias]] : [[t.table_name], [t.schema_name, t.table_name], [t.catalog_name, t.schema_name, t.table_name]], fields }];
        }
        case 'JOIN': {
          const t = this.read(syntax.join, value, 'JOIN');
          if (!t) return [];
          if (t.alias) { this.refuse('aliased JOIN'); return []; }
          const relations = [...this.relation(t.left, ctes), ...this.relation(t.right, ctes)];
          if (t.condition !== null) this.expression(t.condition, { relations, clause: 'JOIN' });
          return relations;
        }
        case 'SUBQUERY': {
          const t = this.read(syntax.subqueryTable, value, 'FROM subquery');
          if (!t) return [];
          const fields = this.query(t.subquery.node, ctes);
          if (t.column_name_alias.length && t.column_name_alias.length !== fields.length) this.refuse('subquery column aliases');
          return [{ qualifiers: t.alias ? [[t.alias]] : [], fields: fields.map((f, i) => ({ ...f, name: t.column_name_alias[i] ?? f.name })) }];
        }
        case 'EXPRESSION_LIST': {
          const t = this.read(syntax.values, value, 'VALUES');
          if (!t) return [];
          const width = t.values[0]!.length;
          for (const row of t.values) {
            if (row.length !== width) this.refuse('VALUES row width');
            row.forEach(e => this.expression(e, { relations: [], clause: 'VALUES' }));
          }
          return [{ qualifiers: [[t.alias]], fields: Array.from({ length: width }, (_, i) => ({ name: `col${i}`, references: [] })) }];
        }
        default: this.refuse(`table construct ${String(raw.type)}`); return [];
      }
    } finally { this.depth--; }
  }

  query(value: unknown, inherited: ReadonlyMap<string, Field[]> = new Map()): Field[] {
    if (!this.enter()) return [];
    try {
      const q = this.read(syntax.select, value, 'SELECT/CTE/VALUES/DESCRIBE');
      if (!q) return [];
      const ctes = new Map(inherited);
      const declared = new Set<string>();
      for (const cte of q.cte_map.map) {
        const name = fold(cte.key);
        if (declared.has(name)) { this.refuse(`duplicate CTE ${cte.key}`); return []; }
        declared.add(name);
        const fields = this.query(cte.value.query.node, ctes);
        if (cte.value.aliases.length && cte.value.aliases.length !== fields.length) this.refuse(`CTE aliases ${cte.key}`);
        ctes.set(name, fields.map((f, i) => ({ ...f, name: cte.value.aliases[i] ?? f.name })));
      }
      const from = this.read(syntax.record, q.from_table, 'FROM');
      if (from?.type === 'SHOW_REF') {
        const show = this.read(syntax.show, from, 'DESCRIBE');
        if (!show) return [];
        // Only the object form is understood here; do not treat DESCRIBE as a
        // blanket exemption for arbitrary nested expressions.
        const inner = this.read(syntax.select, show.query, 'DESCRIBE object');
        if (!inner) return [];
        const table = this.read(syntax.baseTable, inner.from_table, 'DESCRIBE object table');
        if (!table) return [];
        const plain = (node: z.infer<typeof syntax.select>) => node.select_list.length === 1 && syntax.star.safeParse(node.select_list[0]).success
          && !node.modifiers.length && !node.cte_map.map.length && node.where_clause === null && node.having === null && !node.group_expressions.length && !node.group_sets.length;
        if (!plain(q) || !plain(inner)) this.refuse('DESCRIBE query');
        this.relation(table, ctes);
        return [];
      }
      const relations = this.relation(q.from_table, ctes);
      const output: Field[] = [];
      for (const expr of q.select_list) {
        const raw = this.read(syntax.record, expr, 'projection');
        if (raw?.class === 'STAR') {
          const star = this.read(syntax.star, expr, 'star expansion');
          if (!star) continue;
          const selected = relations.filter(r => !star.relation_name || r.qualifiers.some(n => n.length === 1 && fold(n[0]!) === fold(star.relation_name)));
          if (!selected.length) this.refuse('star qualifier');
          for (const field of selected.flatMap(r => r.fields)) { this.check(field.references, { relations, clause: 'SELECT' }); output.push(field); }
        } else {
          const refs = this.expression(expr, { relations, clause: 'SELECT' });
          const col = syntax.column.safeParse(expr);
          const name = typeof raw?.alias === 'string' && raw.alias ? raw.alias : col.success ? col.data.column_names.at(-1)! : '';
          output.push({ name, references: refs });
        }
      }
      if (q.where_clause !== null) this.expression(q.where_clause, { relations, clause: 'WHERE', aliases: output });
      for (const expr of q.group_expressions) this.clauseExpression(expr, { relations, clause: 'GROUP BY', aliases: output }, output);
      if (q.having !== null) this.expression(q.having, { relations, clause: 'HAVING', aliases: output });
      for (const modifier of q.modifiers) {
        const m = this.read(syntax.record, modifier, 'query modifier');
        if (m?.type === 'ORDER_MODIFIER') {
          const order = this.read(syntax.orders, modifier, 'ORDER BY');
          order?.orders.forEach(o => this.clauseExpression(o.expression, { relations, clause: 'ORDER BY', aliases: output }, output));
        } else if (m?.type === 'LIMIT_MODIFIER') {
          const limit = this.read(syntax.limit, modifier, 'LIMIT');
          if (limit) for (const e of [limit.limit, limit.offset]) if (e !== null) this.expression(e, { relations: [], clause: 'LIMIT' });
        } else if (m?.type === 'DISTINCT_MODIFIER') this.read(syntax.distinct, modifier, 'DISTINCT');
        else this.refuse(`query modifier ${String(m?.type)}`);
      }
      return output;
    } finally { this.depth--; }
  }

  private clauseExpression(value: unknown, context: Context, output: Field[]): void {
    const literal = syntax.constant.safeParse(value);
    if (literal.success && literal.data.value.type.id === 'INTEGER' && typeof literal.data.value.value === 'number') {
      const ordinal = literal.data.value.value;
      const field = output[ordinal - 1];
      if (!Number.isInteger(ordinal) || !field) this.refuse(`${context.clause} ordinal`);
      else this.check(field.references, context);
    } else this.expression(value, context);
  }
}

export type QueryPreFilterInput = Readonly<{ sql: string; queryEngineBuild: string; views: readonly ViewDefinition[] }>;
export type QueryPreFilterOutcome = Readonly<{ kind: 'requires_sidecar_inspection' }>;

/** Passing this filter is never permission. No SQL is rewritten or executed. */
export class QueryPreFilter {
  constructor(private readonly parser: QueryParserPort) {}

  async inspect(input: QueryPreFilterInput): Promise<Result<QueryPreFilterOutcome>> {
    const boundary = z.object({ sql: z.string().min(1), queryEngineBuild: z.string().min(1) }).safeParse(input);
    if (!boundary.success) return err(new DomainError('sql_not_permitted', 'A SQL statement and the sidecar engine build are required.'));
    const parsed = await this.parser.parse(input.sql);
    if (!parsed.ok) return parsed;
    if (parsed.value.parserBuild !== input.queryEngineBuild) return err(new DomainError('sql_not_permitted', 'The application parser and sidecar engine builds differ. Align their builds before retrying.', { construct: 'parser_engine_build', stage: 'application_pre_filter' }));
    const inspection = new Inspection(input.views);
    const document = inspection.read(syntax.document, parsed.value.tree, 'DuckDB statement');
    if (document) inspection.query(document.statements[0]!.node);
    return inspection.failure ? err(inspection.failure) : ok({ kind: 'requires_sidecar_inspection' });
  }
}
