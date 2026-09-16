import type { ReactNode } from 'react';
import { AppRoot, Button, Card, CardHeader, EmptyState, ErrorState, LoadingState, StageRail, Treatment, type TreatmentKind } from '../shared/ui/index.js';

const treatments: readonly TreatmentKind[] = ['clear', 'tokenized', 'masked', 'reference', 'aggregate', 'withheld', 'undecided'];

function KitchenCard({ children, title }: { readonly children: ReactNode; readonly title: string }): ReactNode {
  return <Card><CardHeader title={title} /><div className="sheetb">{children}</div></Card>;
}

export function KitchenSinkScreen(): ReactNode {
  return <AppRoot><main className="body"><section className="screen on" aria-labelledby="kitchen-sink-title">
    <h1 id="kitchen-sink-title">Kitchen sink</h1>
    <p className="sub">The shared interface primitives and their supported states.</p>

    <div className="tiles">
      <KitchenCard title="Buttons">
        <div className="enrolopts"><Button>Primary action</Button><Button variant="go">Continue</Button><Button variant="ghost">Secondary action</Button><Button disabled>Disabled action</Button></div>
      </KitchenCard>
      <KitchenCard title="Fields and notes">
        <div className="fld"><label htmlFor="kitchen-valid">Valid field</label><input id="kitchen-valid" defaultValue="person@example.com" /></div>
        <div className="fld err"><label htmlFor="kitchen-invalid">Invalid field</label><input aria-describedby="kitchen-invalid-error" aria-invalid="true" id="kitchen-invalid" defaultValue="not-an-email" /><div className="err-msg" id="kitchen-invalid-error">That does not look like an email address.</div></div>
        <p className="note">Notes explain consequences without obscuring the action.</p>
      </KitchenCard>
      <KitchenCard title="Pills and treatments">
        <p><span className="sbpill"><i aria-hidden="true" />Connected</span></p>
        <div className="speclegend">{treatments.map((kind) => <Treatment key={kind} kind={kind} />)}</div>
      </KitchenCard>
    </div>

    <div className="tiles">
      <KitchenCard title="Empty states"><EmptyState icon="◎" title="Nothing to review" description="When work arrives, it will appear here."><Button variant="go">Add a source</Button></EmptyState></KitchenCard>
      <KitchenCard title="Calm empty state"><EmptyState calm icon="✓" title="Everything is decided" description="No elements need a decision right now." /></KitchenCard>
      <KitchenCard title="Error state"><ErrorState title="The service is unavailable" description="Try again after the dependency recovers." retry={() => {}} /></KitchenCard>
    </div>

    <LoadingState />
    <StageRail title="Running a request" elapsed="0.8s" stages={[{ name: 'Classify', detail: 'Reading the request', status: 'done' }, { name: 'Resolve', detail: 'Finding sources', status: 'run' }, { name: 'Compose', detail: 'Waiting to run', status: 'wait' }, { name: 'Check', detail: 'Stopped for review', status: 'stop' }]} />

    <Card><CardHeader title="Table" meta="Two example rows" /><table><thead><tr><th>Element</th><th>Treatment</th><th>Source</th></tr></thead><tbody><tr><td><b>policy_number</b></td><td><Treatment kind="tokenized" /></td><td className="num">claims</td></tr><tr><td><b>claim_amount</b></td><td><Treatment kind="undecided" /></td><td className="num">claims</td></tr></tbody></table></Card>
  </section></main></AppRoot>;
}
