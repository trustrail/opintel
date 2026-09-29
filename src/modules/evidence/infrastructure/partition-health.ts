import {withPlatform} from '../../../platform/db/scope.js';

export const provisioningDeadlineMs = 10_000;

/** Bound the wait, without pretending the scope API can cancel PostgreSQL. */
export class BoundedMaintenanceOperation<T> {
  private pending: Promise<T> | undefined;
  constructor(private readonly operation: () => Promise<T>) {}
  async run(): Promise<T> {
    if (!this.pending) {
      const pending = Promise.resolve().then(this.operation);
      this.pending = pending;
      void pending.then(() => { this.pending = undefined; }, () => { this.pending = undefined; });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.pending,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Evidence maintenance deadline exceeded.')), provisioningDeadlineMs);
        }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
}

export interface PartitionCoverage { parent: string; bound: string }
const parents = ['query_run', 'run_completion', 'run_element', 'run_stage'];

export function partitionHorizon(rows: readonly PartitionCoverage[], now: Date): {monthsAhead: number; currentMonthCovered: boolean} {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const ends = parents.map(parent => {
    const intervals = rows.filter(row => row.parent === parent).map(row => {
      // PostgreSQL catalog output, not customer SQL. Use attached range bounds,
      // not partition names: detached tables and holes must not look healthy.
      const match = /^FOR VALUES FROM \('([^']+)'\) TO \('([^']+)'\)$/.exec(row.bound);
      if (!match) throw new Error('Unrecognized evidence partition bounds.');
      const from = Date.parse(match[1]!), to = Date.parse(match[2]!);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) throw new Error('Invalid evidence partition bounds.');
      return {from, to};
    }).sort((a, b) => a.from - b.from);
    let end = start;
    for (const interval of intervals) {
      if (interval.from > end) break;
      end = Math.max(end, interval.to);
    }
    return end;
  });
  const end = Math.min(...ends);
  if (end < next) return {monthsAhead: 0, currentMonthCovered: false};
  const last = new Date(end);
  // Count only fully covered future UTC months, including across year boundaries.
  const monthsAhead = (last.getUTCFullYear() - now.getUTCFullYear()) * 12 + last.getUTCMonth() - now.getUTCMonth() - 1;
  return {monthsAhead: Math.max(0, monthsAhead), currentMonthCovered: true};
}

export async function readPartitionHorizon(): Promise<ReturnType<typeof partitionHorizon>> {
  const rows = await withPlatform(tx => tx.query<PartitionCoverage>(`
    SELECT parent.relname AS parent, pg_get_expr(child.relpartbound, child.oid) AS bound
    FROM pg_inherits inheritance
    JOIN pg_class parent ON parent.oid = inheritance.inhparent
    JOIN pg_namespace ns ON ns.oid = parent.relnamespace
    JOIN pg_class child ON child.oid = inheritance.inhrelid
    WHERE ns.nspname = 'public' AND parent.relname = ANY($1::text[])
      AND NOT inheritance.inhdetachpending`, [parents]));
  return partitionHorizon(rows, new Date());
}
