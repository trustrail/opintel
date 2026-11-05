// Gateway pre-filter: entitlements/application/aggregate.ts (expression
// allowlist, token equality and aggregate-only checks); MCP response.ts Q/Q-fallback.
export const sqlRules=Object.freeze([
 'Use only SELECT, WITH, VALUES or object DESCRIBE statements against the listed objects.',
 'Do not use CAST; cast expressions are prohibited.',
 'Tokenized columns support equality, GROUP BY and equality joins on compatible token domains; not ORDER BY, arithmetic or range comparisons.',
 'Aggregate-only columns may appear only as direct SUM, AVG or COUNT arguments; every group must meet the configured minimum group size.',
]);
