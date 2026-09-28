import { z } from 'zod';
import { DomainError, err, ok, type ElementId, type Result } from '../../../src/shared/kernel/index.js';
import * as syntax from './syntax.js';
import { foldIdentifier, type PoolNamespace } from './subset.js';
import { type TreatmentPolicy, type PolicyTable } from './treatment-policy.js';

type Reference = { elementId: ElementId; name: string; treatment: 'tokenized' | 'aggregate_only'; threshold: number };
type Field = { name: string; references: Reference[] };
type Relation = { qualifiers: string[][]; fields: Field[]; opaque?: boolean };
type Clause = 'SELECT' | 'WHERE' | 'JOIN' | 'GROUP BY' | 'HAVING' | 'ORDER BY' | 'LIMIT' | 'VALUES';
type Context = { relations: Relation[]; clause: Clause; aliases?: Field[]; directAggregate?: boolean };
const fold = foldIdentifier;
const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => fold(v) === fold(b[i]!));

/** Sidecar-owned lineage analysis; PREPARE in the same contained session proves resolution. */
class Inspection {
  aggregates: {node: unknown; reference: Reference}[] = [];
  private currentNode: unknown;
  failure: DomainError | undefined;
  private depth = 0;
  private visits = 0;
  constructor(private readonly views: readonly PolicyTable[], private readonly namespace: PoolNamespace, private readonly policy: TreatmentPolicy) {}

  refuse(construct: string): void {
    this.failure ??= new DomainError('sql_not_permitted', `The sidecar cannot interpret construct ${construct}; a column was not found or the construct is unavailable or ambiguous. Rewrite the query using a supported construct.`, { construct, proofCategory: 'sql_not_permitted', stage: 'treatment' });
  }

  read<T>(schema: z.ZodType<T>, value: unknown, construct: string): T | undefined {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const path = parsed.error.issues[0]?.path.join('.') || construct;
      this.refuse(`${construct} (${path})`);
      return undefined;
    }
    return parsed.data;
  }

  private enter(): boolean {
    if (++this.visits > 10000 || this.depth >= 100) { this.refuse('query complexity'); return false; }
    this.depth++;
    return true;
  }

  private check(references: Reference[], context: Context, operation?: string): void {
    for (const ref of references) {
      if (ref.treatment === 'aggregate_only' && !context.directAggregate) {
        this.failure ??= new DomainError('unsupported_on_aggregate_only', `Element ${ref.name} is aggregate-only and cannot appear in ${context.clause}${operation ? ` (${operation})` : ''}. Minimum group size is ${ref.threshold}; refused at stage 1. Use an aggregate over a sufficiently large group instead.`, {
          elementId: ref.elementId, operation: operation ?? context.clause, aggregateMinGroupSize: ref.threshold, stage: 1, construct: ref.name, proofCategory: 'sql_not_permitted',
        });
      } else if (ref.treatment === 'tokenized' && (operation !== undefined || context.clause === 'ORDER BY')) {
        const op = operation ?? 'ORDER BY';
        if(this.failure?.code!=='sql_not_permitted')this.failure = new DomainError('unsupported_on_token', `Element ${ref.name} cannot be used with ${op}: tokens preserve equality only. Use equality, grouping or COUNT instead.`, { elementId: ref.elementId, operation: op, stage: 1, construct: ref.name, proofCategory: 'sql_not_permitted' });
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
        this.refuse(names.at(-1)!); return [];
      }
    }
    const matches = candidates.length ? candidates : aliases;
    if(matches.length===0&&context.relations.length===1&&context.relations[0]!.opaque)return [];
    if (matches.length !== 1) { this.refuse(names.at(-1)!); return []; }
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
          if (context.directAggregate) for (const reference of refs) if(reference.treatment==='aggregate_only') this.aggregates.push({node:this.currentNode,reference});
          return refs;
        }
        case 'CONSTANT': this.read(syntax.constant, value, 'constant'); return [];
        case 'FUNCTION': {
          const e = this.read(syntax.func, value, 'function');
          if (!e) return [];
          const name = fold(e.function_name);
          const aggregate = ['sum', 'avg', 'min', 'max', 'count', 'count_star'].includes(name) && !e.is_operator;
          const operation = ['+', '-', '*', '/', '//', '%', '**', '^', '~~', '!~~', '~~*', '!~~*'].includes(name) && e.is_operator;

          if (e.order_bys.orders.length) { this.refuse('aggregate ORDER BY'); return []; }
          // Aggregate FILTER changes per-aggregate cardinality, which this inspector cannot estimate.
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
          const operation={COMPARE_EQUAL:'=',COMPARE_NOTEQUAL:'<>',COMPARE_LESSTHAN:'<',COMPARE_GREATERTHAN:'>',COMPARE_LESSTHANOREQUALTO:'<=',COMPARE_GREATERTHANOREQUALTO:'>='}[e.type];
          if (!['COMPARE_EQUAL', 'COMPARE_NOTEQUAL'].includes(e.type)) this.check(refs, context, operation);
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
        case 'CASE': {const e=this.read(syntax.caseExpression,value,'CASE');if(!e)return [];return [...e.case_checks.flatMap(c=>[c.when_expr,c.then_expr]),e.else_expr].flatMap(c=>this.expression(c,{...context,directAggregate:false}));}
        case 'SUBQUERY': {const e=this.read(syntax.subqueryExpression,value,'SUBQUERY');if(!e)return [];if(e.child!==null)this.expression(e.child,{...context,directAggregate:false});return this.query(e.subquery.node).flatMap(f=>f.references);}
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
        case 'TABLE_FUNCTION': { const t=this.read(syntax.tableFunction,value,'TABLE_FUNCTION');if(!t)return [];return [{qualifiers:[[t.alias||t.function.function_name]],fields:[],opaque:true}]; }
        case 'EMPTY': this.read(syntax.emptyTable, value, 'empty FROM'); return [];
        case 'BASE_TABLE': {
          const t = this.read(syntax.baseTable, value, 'table reference');
          if (!t) return [];
          const cte = !t.catalog_name && !t.schema_name ? ctes.get(fold(t.table_name)) : undefined;
          if (cte) return [{ qualifiers: [[t.alias || t.table_name]], fields: cte }];
          const catalog=t.catalog_name||this.namespace.catalog, schema=t.schema_name||this.namespace.schema;
          const matches=this.views.filter(v=>same([v.catalog,v.schema,v.name],[catalog,schema,t.table_name]));
          if(matches.length!==1){this.refuse(t.table_name);return [];}
          const view=matches[0]!;
          const fields:Field[]=view.columns.map(col=>({name:col.name,references:
            col.treatment==='aggregate_only'||col.treatment==='tokenized'
              ? [{elementId:col.elementId,name:col.name,treatment:col.treatment,threshold:this.policy.aggregateMinGroupSize}] : []}));
          return [{ qualifiers: t.alias ? [[t.alias]] : [[t.table_name], [schema, t.table_name], [catalog, schema, t.table_name]], fields }];
        }
        case 'JOIN': {
          const t = this.read(syntax.join, value, 'JOIN');
          if (!t) return [];
          if (t.alias) { this.refuse('aliased JOIN'); return []; }
          const relations = [...this.relation(t.left, ctes), ...this.relation(t.right, ctes)];
          if(relations.some(r=>r.opaque))this.refuse('JOIN');
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
    const parentNode=this.currentNode;this.currentNode=value;
    try {
      const set=syntax.setOperation.safeParse(value);
      if(set.success){if(set.data.cte_map.map.length||set.data.modifiers.length){this.refuse('SET_OPERATION_NODE');return [];}const left=this.query(set.data.left,inherited),right=this.query(set.data.right,inherited);if(left.length!==right.length)this.refuse('SET_OPERATION_NODE');return left.map((f,n)=>({...f,references:[...f.references,...(right[n]?.references??[])]}));}
      const q = this.read(syntax.select, value, 'SELECT_NODE');
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
      const relations = this.relation(q.from_table, ctes);this.currentNode=value;
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
    } finally { this.currentNode=parentNode;this.depth--; }
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

export type TreatmentInspection={aggregate?: {elementId:ElementId;name:string;threshold:number}};
export function inspectTreatments(tree:unknown, namespace:PoolNamespace, policy:TreatmentPolicy, tables:PolicyTable[]):Result<TreatmentInspection>{
 if(!tables.some(t=>t.columns.some(c=>c.treatment==='aggregate_only'||c.treatment==='tokenized')))return ok({});
 const i=new Inspection(tables,namespace,policy),doc=syntax.document.safeParse(tree);
 if(!doc.success)return err(new DomainError('sql_not_permitted','The sidecar cannot interpret the statement.'));
 const root=doc.data.statements[0]!.node;
 i.query(root);
 if(i.failure)return err(i.failure);
 // Nested aggregation requires counts to survive the outer projection. Until
 // that transformation is supported, refuse rather than lose the disclosure check.
 if(i.aggregates.some(a=>a.node!==root))return err(new DomainError('sql_not_permitted','Construct SELECT_NODE contains nested aggregation over an aggregate-only element. The cardinality check cannot preserve and verify the inner groups’ counts through nesting; it has not determined that those groups are below the threshold. Use a single aggregate query so group sizes can be checked.',{construct:'SELECT_NODE',proofCategory:'sql_not_permitted'}));
 if(i.aggregates.length){const q=syntax.select.parse(root);if(q.modifiers.some(m=>syntax.distinct.safeParse(m).success))return err(new DomainError('sql_not_permitted','Construct DISTINCT_MODIFIER over protected aggregation is not supported.',{construct:'DISTINCT_MODIFIER',proofCategory:'sql_not_permitted'}));}
 const ref=i.aggregates[0]?.reference;
 return ok(ref?{aggregate:{elementId:ref.elementId,name:ref.name,threshold:ref.threshold}}:{});
}
