import { z } from 'zod';

// Full (not skip_default/skip_null) DuckDB JSON. Unknown fields are refused:
// ignoring a new expression-bearing field would be partial inspection.
const list = z.array(z.unknown());
const empty = z.tuple([]);
const base = { type: z.string(), alias: z.string(), query_location: z.number() };
const expression = { ...base, class: z.string() };
const table = { ...base, sample: z.null() };
export const record = z.record(z.string(), z.unknown());
export const statement = z.object({ node: z.unknown(), named_param_map: empty }).strict();
export const document = z.object({ error: z.literal(false), statements: z.array(statement).length(1) }).strict();
export const select = z.object({
  type: z.literal('SELECT_NODE'), modifiers: list,
  cte_map: z.object({ map: z.array(z.object({ key: z.string(), value: z.object({
    aliases: z.array(z.string()), query: statement,
    materialized: z.enum(['CTE_MATERIALIZE_DEFAULT', 'CTE_MATERIALIZE_ALWAYS', 'CTE_MATERIALIZE_NEVER']),
    key_targets: empty,
  }).strict() }).strict()) }).strict(),
  select_list: list.min(1), from_table: z.unknown(), where_clause: z.unknown(),
  group_expressions: list, group_sets: z.array(z.array(z.number().int().nonnegative())),
  aggregate_handling: z.literal('STANDARD_HANDLING'), having: z.unknown(), sample: z.null(), qualify: z.null(),
}).strict();
export const baseTable = z.object({ ...table, type: z.literal('BASE_TABLE'),
  schema_name: z.string(), table_name: z.string(), catalog_name: z.string(), column_name_alias: empty, at_clause: z.null(),
}).strict();
export const emptyTable = z.object({ ...table, type: z.literal('EMPTY') }).strict();
export const join = z.object({ ...table, type: z.literal('JOIN'), left: z.unknown(), right: z.unknown(), condition: z.unknown(),
  join_type: z.enum(['INNER', 'LEFT', 'RIGHT', 'OUTER']), ref_type: z.enum(['REGULAR', 'CROSS']),
  using_columns: empty, delim_flipped: z.literal(false), duplicate_eliminated_columns: empty,
}).strict();
export const subqueryTable = z.object({ ...table, type: z.literal('SUBQUERY'), subquery: statement, column_name_alias: z.array(z.string()) }).strict();
export const values = z.object({ ...table, type: z.literal('EXPRESSION_LIST'), expected_names: empty, expected_types: empty, values: z.array(list.min(1)).min(1) }).strict();
export const show = z.object({ ...table, type: z.literal('SHOW_REF'), table_name: z.literal(''), query: z.unknown(),
  show_type: z.literal('DESCRIBE'), catalog_name: z.literal(''), schema_name: z.literal(''),
}).strict();
export const column = z.object({ ...expression, class: z.literal('COLUMN_REF'), type: z.literal('COLUMN_REF'), column_names: z.array(z.string().min(1)).min(1).max(4) }).strict();
export const constant = z.object({ ...expression, class: z.literal('CONSTANT'), type: z.literal('VALUE_CONSTANT'), value: z.object({
  type: z.object({ id: z.enum(['SQLNULL', 'BOOLEAN', 'INTEGER', 'BIGINT', 'HUGEINT', 'DOUBLE', 'VARCHAR', 'DECIMAL']), type_info: z.unknown() }).strict(),
  is_null: z.boolean(), value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
}).strict() }).strict();
export const star = z.object({ ...expression, class: z.literal('STAR'), type: z.literal('STAR'), relation_name: z.string(),
  exclude_list: empty, replace_list: empty, columns: z.literal(false), expr: z.null(), qualified_exclude_list: empty, rename_list: empty,
}).strict();
export const orders = z.object({ type: z.literal('ORDER_MODIFIER'), orders: z.array(z.object({
  type: z.enum(['ORDER_DEFAULT', 'ASCENDING', 'DESCENDING']), null_order: z.enum(['ORDER_DEFAULT', 'NULLS_FIRST', 'NULLS_LAST']), expression: z.unknown(),
}).strict()) }).strict();
export const func = z.object({ ...expression, class: z.literal('FUNCTION'), type: z.literal('FUNCTION'), function_name: z.string(),
  schema: z.literal(''), catalog: z.literal(''), children: list, filter: z.unknown(), order_bys: orders,
  distinct: z.boolean(), is_operator: z.boolean(), export_state: z.literal(false),
}).strict();
export const comparison = z.object({ ...expression, class: z.literal('COMPARISON'),
  type: z.enum(['COMPARE_EQUAL', 'COMPARE_NOTEQUAL', 'COMPARE_LESSTHAN', 'COMPARE_GREATERTHAN', 'COMPARE_LESSTHANOREQUALTO', 'COMPARE_GREATERTHANOREQUALTO']),
  left: z.unknown(), right: z.unknown(),
}).strict();
export const operator = z.object({ ...expression, class: z.enum(['OPERATOR', 'CONJUNCTION']),
  type: z.enum(['COMPARE_IN', 'COMPARE_NOT_IN', 'OPERATOR_IS_NULL', 'OPERATOR_IS_NOT_NULL', 'OPERATOR_NOT', 'CONJUNCTION_AND', 'CONJUNCTION_OR']), children: list.min(1),
}).strict();
export const between = z.object({ ...expression, class: z.literal('BETWEEN'), type: z.literal('COMPARE_BETWEEN'), input: z.unknown(), lower: z.unknown(), upper: z.unknown() }).strict();
export const limit = z.object({ type: z.literal('LIMIT_MODIFIER'), limit: z.unknown(), offset: z.unknown() }).strict();
export const distinct = z.object({ type: z.literal('DISTINCT_MODIFIER'), distinct_on_targets: empty }).strict();
export const window = z.object({ ...expression, class: z.literal('WINDOW'), function_name: z.string(), schema: z.string(), catalog: z.string(),
  children: list, partitions: list, orders: orders.shape.orders, start: z.string(), end: z.string(),
  start_expr: z.unknown(), end_expr: z.unknown(), offset_expr: z.unknown(), default_expr: z.unknown(),
  ignore_nulls: z.boolean(), filter_expr: z.unknown(), exclude_clause: z.string(), distinct: z.boolean(), arg_orders: orders.shape.orders,
}).strict();
