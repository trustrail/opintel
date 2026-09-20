import type { ReactNode } from 'react';
import { ErrorState, EmptyState, LoadingState } from '../../shared/ui/index.js';
import { useFilings } from './data.js';

export const landingLabels = { append_as_at: 'append as at', table_per_filing: 'table per filing' };
const categories: Record<string, string> = {
  no_rule_matched: 'No filing-party rule matched.', multiple_rules_matched: 'More than one filing-party rule matched.',
  unreadable_format: 'The file format could not be read.', sheet_absent: 'The declared sheet is missing.',
  merged_header: 'The header contains merged cells.', formula_uncached: 'A formula has no cached value.',
  locale_undeclared: 'The filing party has no declared locale.', period_unparseable: 'The period does not match the declared format.',
  verification_mismatch: 'The content does not match the attributed filing party.', column_type_changed: 'A column type differs from earlier filings.',
  rule_invalid: 'The filing rule is invalid.', attribution_missing: 'The filing could not be attributed to a party.', header_invalid: 'The declared header is invalid.',
};
function Received({ value }: { value: string }) { return <time dateTime={value}>{value.slice(0, 16).replace('T', ' ')} UTC</time>; }

export function SourceFilings({ projectId, sourceId, strategy }: { projectId: string; sourceId: string; strategy: keyof typeof landingLabels | null }): ReactNode {
  const query = useFilings(projectId);
  const filings = query.data?.filter(filing => filing.sourceId === sourceId && filing.outcome === 'landed') ?? [];
  return <section className="sheetb" aria-label="Recent filings into this source" style={{width:'100cqw',boxSizing:'border-box',position:'sticky',left:0}}><h3>Recent filings into this source</h3>
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState title="Filings could not be loaded" description={query.error.message} retry={() => { void query.refetch(); }} /> : filings.length === 0 ? <EmptyState icon="⛁" title="No landed filings yet" description="Files appear here after landing. Check the Dashboard or Observations for quarantines." /> : <>
      <div role="region" aria-label="Landed filing records" tabIndex={0} style={{overflowX:'auto'}}><table><thead><tr><th>Filing</th><th>Party</th><th>Kind</th><th>Period</th><th>Received</th><th>Superseded</th><th>Rows</th></tr></thead><tbody>{filings.map(filing => <tr key={filing.filingId}>
        <td className="num"><span>{filing.filingId}</span>{filing.supersedes?<><br/><span className="tr mask"><i aria-hidden="true"/>Restatement</span></>:null}</td><td className="num">{filing.partyCode ?? 'Not reported'}</td><td>{filing.kind ?? 'Not reported'}</td><td className="num">{filing.period ?? 'Not reported'}</td><td className="num"><Received value={filing.receivedAt} /></td>
        <td>{filing.supersedes ? <span className="mono">{filing.supersedes}</span> : 'None'}</td><td className="num">{filing.rowCount ?? 'Awaiting receipt'}</td>
      </tr>)}</tbody></table></div>
    </>}
    <p className="note">{strategy === 'append_as_at' ? 'Under append as at, a restatement does not replace what came before: both versions stay queryable, and every row carries its filing ID and as-at date.' : strategy === 'table_per_filing' ? 'Under table per filing, each filing lands in its own table. Earlier tables remain untouched; a comparison across filings uses a union.' : 'No landing strategy has been recorded yet.'}</p>
    <p className="note">Files and filenames stay in your environment. Use the filing ID to inspect the local register.</p>
  </section>;
}

export function QuarantineFeed({ projectId }: { projectId: string }): ReactNode {
  const query = useFilings(projectId);
  const filings = query.data?.filter(filing => filing.outcome === 'quarantined') ?? [];
  return <section className="card" aria-labelledby="quarantine-heading"><div className="card-h"><h2 id="quarantine-heading">Needs a decision</h2><span className="meta">Quarantined filings</span></div>
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState title="Quarantines could not be loaded" description={query.error.message} retry={() => { void query.refetch(); }} /> : filings.length === 0 ? <EmptyState icon="✓" title="No quarantined filings" description="Files needing attention will appear here. Review their local details before retrying." /> : <ul className="feed">{filings.map(filing => <li key={filing.filingId}><span className="sev hi" aria-hidden="true">!</span><div className="fb">
      <p className="t">{categories[filing.quarantineCategory ?? ''] ?? 'The filing needs local review before it can land.'}</p>
      <p className="d">Filing <span className="mono" style={{ overflowWrap: 'anywhere' }}>{filing.filingId}</span> · <Received value={filing.receivedAt} /></p>
      <p className="d">Not landed into a source. The full reason stays in your environment because it may contain file contents or cell values. Ask the sidecar operator to inspect this filing in the local register, correct its rule or file, and retry it. Attribution is checked again; it cannot be overridden.</p>
      <details><summary>Local resolution instructions</summary><p className="d">Stop the watcher to release its register lock. Run these commands in the customer environment with the same sidecar configuration. The first ID identifies the configured landing zone, not a source this file has landed into.</p>
        <p className="d"><code style={{overflowWrap:'anywhere'}}>npm run sidecar:register -- show {filing.sourceId} {filing.filingId}</code></p>
        <p className="d">Correct the rule or file and re-export the rule snapshot before retrying. Keep local output out of logs.</p>
        <p className="d"><code style={{overflowWrap:'anywhere'}}>npm run sidecar:register -- retry {filing.sourceId} {filing.filingId}</code></p><p className="d">Restart the watcher afterwards. A changed file cannot be retried as the same filing.</p>
      </details>
    </div></li>)}</ul>}
    <div className="sheetb"><p className="note">A filing landed against the wrong party is worse than one that did not land. Opintel quarantines uncertainty rather than guessing who it belongs to.</p></div>
  </section>;
}

export function ObservationsScreen({ projectId }: { projectId: string }): ReactNode {
  return <section className="screen on"><h1>Observations</h1><p className="sub">Filings that need attention before they can land. Inspect and resolve them in your environment.</p><QuarantineFeed projectId={projectId} /></section>;
}
