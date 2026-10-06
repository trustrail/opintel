import {Timestamp} from '../settings/preferences.js';
import { TypeObservations } from '../sources/type-observations.js';
import { CustodyObservations } from '../custody/observations.js';
import type { ReactNode } from 'react';
import { ErrorState, EmptyState, LoadingState } from '../../shared/ui/index.js';
import { useFilings } from './data.js';

export const landingLabels = { append_as_at: 'append as at', table_per_filing: 'table per filing' };
export const quarantineLabels: Record<string, string> = {
  no_rule_matched: 'No filing-party rule matched.', multiple_rules_matched: 'More than one filing-party rule matched.',
  unreadable_format: 'The file format could not be read.', sheet_absent: 'The declared sheet is missing.',
  merged_header: 'The header contains merged cells.', formula_uncached: 'A formula has no cached value.',
  locale_undeclared: 'The filing party has no declared locale.', period_unparseable: 'The period does not match the declared format.',
  verification_mismatch: 'The content does not match the attributed filing party.', column_type_changed: 'A column type differs from earlier filings.',
  rule_invalid: 'The filing rule is invalid.', attribution_missing: 'The filing could not be attributed to a party.', header_invalid: 'The declared header is invalid.',
};
export function QuarantineResolutionSummary({ zoneId, filingId }: { zoneId: string; filingId: string }): ReactNode {
  const copyStyle = { userSelect: 'all' as const, overflowWrap: 'anywhere' as const };
  return <>
    <p className="d">Nothing landed, so this filing's data is not in the catalogue.</p>
    <p className="d">The full reason stays in the customer environment because it may contain file contents.</p>
    <p className="d">Ask whoever operates the Opintel Engine to resolve it. Give them these IDs:</p>
    <p className="d">Landing zone ID: <span className="mono" style={copyStyle}>{zoneId}</span><br/>Filing ID: <span className="mono" style={copyStyle}>{filingId}</span></p>
  </>;
}
function Received({ value }: { value: string }) { return <Timestamp value={value} appearance="when"/>; }

export function SourceFilings({ projectId, sourceId, strategy }: { projectId: string; sourceId: string; strategy: keyof typeof landingLabels | null }): ReactNode {
  const query = useFilings(projectId);
  const filings = query.data?.filter(filing => filing.sourceId === sourceId && filing.outcome === 'landed') ?? [];
  return <section className="sheetb" aria-label="Recent filings into this source" style={{width:'100cqw',boxSizing:'border-box',position:'sticky',left:0}}><h3>Recent filings into this source</h3>
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState title="Filings could not be loaded" description={query.error.message} retry={()=>query.refetch()} /> : filings.length === 0 ? <EmptyState icon="⛁" title="No landed filings yet" description="Files appear here after landing. Check the Dashboard or Observations for quarantines." /> : <>
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
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState title="Quarantines could not be loaded" description={query.error.message} retry={()=>query.refetch()} /> : filings.length === 0 ? <EmptyState icon="✓" title="No quarantined filings" description="Files needing attention will appear here." /> : <ul className="feed">{filings.map(filing => <li key={filing.filingId}><span className="sev hi" aria-hidden="true">!</span><div className="fb">
      <p className="t">{quarantineLabels[filing.quarantineCategory ?? ''] ?? 'The filing needs local review before it can land.'}</p>
      <p className="d"><Received value={filing.receivedAt} /></p>
      <QuarantineResolutionSummary zoneId={filing.sourceId} filingId={filing.filingId}/>
    </div></li>)}</ul>}
    <div className="sheetb"><p className="note">A filing landed against the wrong party is worse than one that did not land. Opintel quarantines uncertainty rather than guessing who it belongs to.</p></div>
  </section>;
}

export function ObservationsScreen({ projectId }: { projectId: string }): ReactNode {
  return <section className="screen on"><h1>Observations</h1><p className="sub">Filings, key custody and source type observations in your environment.</p><QuarantineFeed projectId={projectId} /><CustodyObservations projectId={projectId}/><TypeObservations projectId={projectId}/></section>;
}
