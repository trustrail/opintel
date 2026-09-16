import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  AppRoot,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  LoadingState,
  StageRail,
  Treatment,
  type TreatmentKind,
} from '../src/shared/ui/index.js';

describe('shared UI primitives', () => {
  it('O-001: uses the reference empty and staged-loading patterns, never a spinner', () => {
    const empty = renderToStaticMarkup(<LoadingState />);
    const staged = renderToStaticMarkup(<LoadingState stages={[{ name: 'Classify', detail: 'Reading the request', status: 'run' }]} />);
    expect(empty).toContain('class="blank"');
    expect(staged).toContain('class="rail on"');
    expect(staged).toContain('class="stg run"');
    expect(`${empty}${staged}`).not.toContain('spinner');
  });

  it('O-002, O-003 and O-004: renders purposeful empty, error, and ready primitives', () => {
    const retry = vi.fn();
    const markup = renderToStaticMarkup(<AppRoot><EmptyState icon="◎" title="Nothing here yet" description="Choose the next action."><Button variant="go">Continue</Button></EmptyState><ErrorState title="Could not load this view" description="Check the connection and try again." retry={retry} /><Card><CardHeader title="Ready" meta="Current" /></Card></AppRoot>);
    expect(markup).toContain('id="opintel-app"');
    expect(markup).toContain('class="blank"');
    expect(markup).toContain('Try again');
    expect(markup).toContain('class="card"');
    expect(markup).toContain('class="card-h"');
  });

  it('O-006 and O-007: treatment badges always render their dot and text label', () => {
    const kinds: readonly TreatmentKind[] = ['clear', 'tokenized', 'masked', 'reference', 'aggregate', 'withheld'];
    for (const kind of kinds) {
      const markup = renderToStaticMarkup(<Treatment kind={kind} />);
      expect(markup).toContain('class="tr ');
      expect(markup).toContain('<i aria-hidden="true"></i>');
      expect(markup).toMatch(/>[A-Z][^<]+<\/span>$/u);
    }
  });

  it('uses only the master stylesheet class contract for cards, buttons, and stage rails', () => {
    const markup = renderToStaticMarkup(<><Button>Save</Button><Button variant="go">Continue</Button><Button variant="ghost">Cancel</Button><StageRail title="Running" elapsed="0.0s" stages={[{ name: 'Check', detail: 'Structural validation', status: 'done' }]} /></>);
    expect(markup).toContain('class="btn"');
    expect(markup).toContain('class="btn go"');
    expect(markup).toContain('class="btn ghost"');
    expect(markup).toContain('class="rail on"');
  });
});
