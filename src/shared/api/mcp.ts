import {QueryRefusalMetadata} from './query-refusal.js';
import { z } from 'zod';

export const DescribeInput = z.strictObject({ object: z.string().optional() });
export const DescribeOutput = z.strictObject({ objects: z.array(z.strictObject({
 name: z.string(), columns: z.array(z.strictObject({ name: z.string(), type: z.string(), treatment: z.enum(['clear','tokenized','masked','aggregate_only']) })), withheld: z.array(z.string()),
})) });
export const ExplainInput = z.strictObject({ sql: z.string() });
export const ExplainOutput = z.discriminatedUnion('permitted', [
 z.strictObject({ permitted: z.literal(true), objects: z.array(z.string()), columns: z.array(z.string()), notes: z.array(z.string()) }),
 z.strictObject({ permitted: z.literal(false), reason: z.string(), code: z.string() }),
]);
export const QueryInput = z.strictObject({ sql: z.string(), maxRows: z.number().int().positive().optional() });
export const QueryOutput = z.strictObject({ columns: z.array(z.strictObject({ name: z.string(), type: z.string() })), rows: z.array(z.array(z.unknown())), truncated: z.boolean(), evidenceId: z.string() });

// Shared by the server's listing, request validation and future tool clients.
export const mcpTools = [
 { name: 'opintel.describe', description: 'Describe the objects and decisions available to this pool.', mode: null, input: DescribeInput, output: DescribeOutput },
 { name: 'opintel.explain', description: 'Check a SQL question without reading source data.', mode: null, input: ExplainInput, output: ExplainOutput },
 { name: 'opintel.query', description: 'Query data under this pool’s entitlements.', mode: 'query', input: QueryInput, output: QueryOutput },
] as const;
export function listedTools(modes: { query: boolean; prompt: boolean }) {
 return mcpTools.filter(tool => tool.mode === null || modes[tool.mode]);
}
export function toolDescriptor(tool: typeof mcpTools[number]) {
 return { name: tool.name, description: tool.description, inputSchema: z.toJSONSchema(tool.input), outputSchema: {type:'object',...z.toJSONSchema(tool.output)} };
}
export function mcpOpenApiDocument() {
 return { openapi: '3.1.0', info: { title: 'Opintel MCP transport', version: '1' },
  components: { securitySchemes: { poolKey: { type: 'http', scheme: 'bearer' } }, schemas: {
   DescribeInput: z.toJSONSchema(DescribeInput), DescribeOutput: z.toJSONSchema(DescribeOutput),
   ExplainInput: z.toJSONSchema(ExplainInput), ExplainOutput: z.toJSONSchema(ExplainOutput),
   QueryRefusalMetadata:z.toJSONSchema(QueryRefusalMetadata),
   QueryInput: z.toJSONSchema(QueryInput), QueryOutput: z.toJSONSchema(QueryOutput),
  } },
  paths: { '/mcp/v1/p/{projectId}': Object.fromEntries(['get','post','delete'].map(method => [method, {
   'x-permission': 'pool-key', security: [{ poolKey: [] }], parameters: [
    { name: 'projectId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    { name: 'X-Opintel-Agent-Id', in: 'header', required: true, schema: { type: 'string', minLength: 1 } },
   ], responses: { 200: { description: 'MCP JSON-RPC or event stream' }, 202: { description: 'Notification accepted' }, 401: { description: 'The pool key is not valid.' } },
  }])) },
 };
}
