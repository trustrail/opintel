# @opintel/console-next

Home-only console, built beside `src/app`. The current console is unchanged.
Run `npm run console:dev` from the repository root, then open
`http://localhost:5174/?project=PROJECT_ID`. Sign in through the current console
first (same host, existing session cookie). `?theme=dark` selects dark mode;
the appearance menu and project-menu appearance option also switch themes.

- `npm run console:test`: isolated console unit tests, no databases.
- `npm run console:build`: independent Vite output in `dist/console-next`.
- `npm run typecheck` and `npm run lint`: repository strict checks.
- Backend target files: `test/project-health.test.ts`,
  `test/run-completed.test.ts`, `test/evidence-writer.test.ts`,
  `test/sse.test.ts`, `test/http-server.test.ts`, `test/needs-you.test.ts`.

The separate Vite server redirects existing destination paths to `APP_BASE_URL`
(or the current console at localhost:5173). It does not replace the current
console router or implement another destination screen. API requests proxy to
`API_PORT` (default 3000). No production deployment or package switch is included.

Tokens live in `tokens.css`; layout uses semantic elements and data attributes,
without adding classes to or changing `docs/opintel-master.css`. Primitives are
Radix, icons are Phosphor regular, state-change animation uses Motion (200 ms,
reduced-motion aware), and both charts use visx. TanStack Query owns server
facts; the adjacent Zustand store owns the order/theme preferences.

Needs-you reads every page to the terminal cursor without inventing items; role and order switches reorder the
same queue. Report counts come from the specified summary/stats contracts.
Custody counts are receipts with grants, not cells or decryption evidence.
Exposure drill-down reads actual entitlement members and filters them locally
because the current destination router has no treatment filter. Connected-agent
drill-down reads fresh per-pool presence. No authorization uses agent identity.

The stream refreshes on completion and reconnect snapshots. It coalesces bursts,
deduplicates sequence numbers, closes subscriptions when changing project, and
polls at 15 seconds while disconnected. Grey means stream loss, not agents down.
The 30-minute request strip is omitted if its bounded paged read is incomplete;
it never invents values for missing buckets. Exposure is omitted at zero known
column decisions. Every list has loading, empty, error and ready states.

Manual review screenshots use `test/review/console-next.config.ts`, not the full
gate or retired pixel tiers. Start an isolated Playwright 1.63 browser server on
localhost:9324, then run:

```sh
npm test -- --config test/review/console-next.config.ts
```

This uses normal isolated test services and real HTTP projections, executes real
Engine requests, and validates live completion delivery. Authentication is a
fixture identity. No API responses or rendered numbers are mocked for captures.
Artifacts go to `docs/review/console-backend/phase1-screenshots/`.


Review corrections: the entire queue remains in a fixed-height scroll viewport,
including rows below the fold. Decision labels use API-provided pool/table/column
context and shared kind icons; effects appear only on expansion. Area dots use
needs-you items rather than health counts. Known setup/check findings warn;
unknown means an unavailable check. Header hover includes the actual reason.
The custody number opens only granted receipts, not all custody summary states.
