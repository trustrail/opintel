# Parallel Activity review

Activity is in `src/console-next/activity`, part of `@opintel/console-next`.
Open `?project=PROJECT_ID&screen=activity`. The current console is unchanged.
This delivery is committed and pushed for review, without merge or deployment.

## Wiring

- `GET /api/v1/projects/:id/runs`: complete cursor traversal for today's UTC
  range and selected pool. Client outcome/agent/bucket filters operate on the
  complete scope. Fifty fixed rows render initially; Show more retains every
  remaining receipt with an exact count. Names today count distinct observed
  self-declared name strings, not verified people.
- `/runs/summary?bucket=15m&from=...&to=...`: one additional bounded aggregate,
  behind the existing project view permission, with explicit ranges <=24 hours.
  UTC buckets partition clear, treated, custody and refused. Custody precedes
  other transforms; classification uses recorded returned deliveries, not planned
  reads. Unknown/incomplete/failed/clarify remain explicit counts. They are not
  turned into clear answers. Existing day/count/custody fields remain compatible.
  The Today answered bars include completed answers whose treatment detail was
  not captured; those receipts are still excluded from the protection ring.
  The chart fills only known zero intervals after this aggregate succeeds.
- `GET /api/v1/runs/:id?projectId=...&startedAt=...`: selected receipt, preserving
  the exact partition timestamp. It shows recorded object/column names, actual
  row counts, safe refusal code/message and release-event count. Columns are
  returned source fields, excluding withheld and undecided fields.
- Existing `/pools` and pool details/presence provide scope names, current
  credential labels and fresh connecting/active/idle presence. Connected is the
  sum of fresh per-pool presence rows, not unique people or open sockets.
- Existing `/row-decisions/:id` resolves only immutable ids on the receipt.
  Current catalogue rules never substitute for historical decisions.
- Existing project stream refreshes scoped server facts on `run.completed` and
  reconnect snapshots. Shared sequence deduplication/coalescing remains in force.
  A dropped stream greys the live dot and polls every 15 seconds. Receipt reads
  also refresh on completion/fallback, so an incomplete selected run can finish.

TanStack Query owns server state and entity keys; adjacent Zustand owns scope,
filters and selection. Radix owns the receipt dialog/bottom sheet and scrolling.
All charts are visx; glyphs are Phosphor regular; the shared Motion reduced-motion
configuration remains active. Shared kind chips were extracted into
`components/chip.tsx` for reuse. No extra UI kit, CSS class, migration, grant,
route or evidence write behavior was introduced.

## Differences from images 10–11

- Captures show five actual fixture requests against Warehouse/records, a real
  claimed agent, one queried pool and current credential label, rather than the
  illustrative reinsurance rows/counts/names. All requests fall in one actual
  UTC 15-minute bucket; earlier buckets are genuinely empty. No times, counts,
  agents, fields or history were inserted to resemble the illustrations.
- Existing foundation spacing, typography, regular glyphs, radii and treatment
  marks are retained. Request rows are 64 px desktop / 128 px phone. Receipt rows
  are 64 px desktop / 72 px phone, with a 128 px scrollable reason row. The band
  and receipt proportions differ slightly from the design pixels.
- The shared pool picker uses its All pools stack badge and individual pool
  codes, rather than the image’s ALL monogram. Theme switching remains in the
  shared account menu on the rail avatar, including phones.
- There is no Export receipts button in this phase; no export workflow was
  requested. Agent filtering has no person option. Today is explicitly UTC;
  there is no arbitrary date-range picker in this scope.
- The four outcome slices are disjoint classified completed receipts. Incomplete,
  failed, clarification and uncaptured/unclassifiable answers are disclosed
  outside that ring. The ring labels its total as classified when necessary.
  Custody means a recorded custody delivery, not provider redemption/decryption.
- Right now shows the real fresh-presence count instead of the image's `[n]`.
  Names are self-declared names seen today. Connected, names-today and incomplete counts filter
  the list; no identity verification is inferred from presence or credentials.
- Receipt names are recorded source exposed names, not a guaranteed SQL-expression
  alias list. Historical table/view kind is not in the receipt API. The shared
  table glyph is generic here; hover explicitly says table or view, kind not
  recorded. It does not claim that a historical view was a table.
- The credential chip is explicitly marked current name; its hover includes the
  full current name and says it is not historical. If that label is unavailable,
  the recorded key prefix is shown as a prefix. No person chip appears.
- The pool rule uses recorded decision ids. The existing endpoint requires
  administrator set_entitlement permission: other roles see that access limit;
  absent retained ids say not captured. This phase does not widen permissions.
- Read/Asked for uses recorded objects only. Missing objects/row counts/column
  detail say not captured. Zero rows display only when actually recorded.
  Sampled/rolled-up columns never acquire invented names or zero counts.
- Refusal shows the actual code and existing safe projection. Some codes have
  the service's generic safe message, rather than a more specific explanation.
  No raw SQL/value/infrastructure message is inferred or exposed.
- Custody shows the actual number and kinds of release events on this receipt,
  rather than escrowed-cell/redemption placeholders. Legacy redeemed is labelled
  Opintel share released. It shows no device and no Verify receipt control.
- Kind-chip rows scroll horizontally when necessary; full names are available
  on hover. The receipt has an explicit close control and recorded UTC date/time.
- Phone band shows only the Outcomes and Connected rings with number/label.
  The time chart, legends and extra panel lines stay on wider screens; filters
  remain available through ring taps and toolbar controls. Requests are cards
  with room for agent, time and marks. Receipt is a modal bottom sheet. No phone
  Activity reference image was supplied; these follow the shared phone rules.

## Verification

Targeted validation includes unchanged lint, strict typecheck, 59 console unit
tests and 17 Activity/lifecycle backend integration/contract tests. Browser checks use real Engine
queries (answers, refusals and custody), PostgreSQL evidence, SpiceDB permissions
and Redis stream. Authentication alone is a fixture identity. They verify no
page/API errors, no horizontal overflow, visible keyboard focus, bottom-sheet
placement and a new real completion refreshing the live band. Reduced motion is
enabled. These are fresh review captures, separate from retired pixel baselines.
No full gate is run in this scope.

| View | Capture |
| --- | --- |
| 10 · Answered receipt, 1440 light | [PNG](activity-screenshots/activity-answered-1440-light.png) |
| 11 · Refused receipt, 1440 light | [PNG](activity-screenshots/activity-refused-1440-light.png) |
| Phone list, 390 light | [PNG](activity-screenshots/activity-list-390-light.png) |
| Phone receipt sheet, 390 light | [PNG](activity-screenshots/activity-sheet-390-light.png) |

[Browser evidence](activity-screenshots/capture.json).
