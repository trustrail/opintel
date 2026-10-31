# Console redesign: phase 0 report, then Home only

The approved screen designs are the numbered images in `docs/design/console/` (01-Main is the rules board, the rest are screens; files named Mobile are 390 px phone layouts). They are the specification for layout, hierarchy and behaviour. Numbers in them are illustrative unless this prompt says otherwise; values in square brackets such as `[time]` are placeholders for data the backend does not provide yet.

Do not start before the first-hour acceptance work is finished and reported.

## Phase 0: report only, no code

Read `docs/review/console-inventory.md`, the design documents and the backend code, then report, for each item below, whether it exists today (with file and endpoint), partly exists, or is missing. Do not design from memory; quote the code.

1. One endpoint for the Home "Needs you" queue (column decisions, row rules, settings to set, health checks to run).
2. One health endpoint covering engine, sources, custody (XQ), mail, TLS certificate, token key.
3. A `run.completed` stream event, so the console numbers and the Activity list update live. Fallback is polling every 15 s with the live dot turning grey.
4. A count of agents connected now, per pool and in total.
5. Pool creation that accepts, in one call: name, the tables chosen across sources, one row rule (column, operator, value) and a starting mode (`nothing_yet` = every column undecided, or `copy_from` another pool). Plus an API to add and remove tables on an existing pool. Today only the seeder binds sources to pools.
6. The refusal reason, the returned column names and their treatments, the credential label, and the custody escrow and redemption counts on each receipt, readable by the console.
7. The device that redeemed a custody value, recorded on the custody event.
8. Row estimates per table, read from database statistics when a source is scanned (never `COUNT(*)`), and exposed both to the console and to agents in the catalogue.
9. Query protection that exists today: a cap on rows per answer, a database statement timeout, and a cap on concurrent queries per source. Report what is enforced and where. Then propose a pre-execution check: estimate the rows a planned query touches, refuse above the source's limit, and record the reason on the receipt.
10. Receipt fields for the person behind an agent (verified, claimed, or none). This belongs in the ZeroID increment specification; report what would be needed, and say that personal data on receipts needs a retention and export decision.
11. People and invitations from the console (roles: company admin and member; project admin, operator and viewer).

12. First run on a fresh install: what the installer creates (company? first project? the owner as company admin?), whether a company must exist before a project, and whether a paired engine belongs to the company or to one project. The first-run screens (Welcome, Home first run, Connect a source) depend on the answer.
13. The engine reporting its source references (names only, never hosts or passwords) and its scan summary (tables, columns, row estimates) to the console, so Connect a source can list what `./sources add` stored.
14. Per-source protection, separate from pool budgets: a maximum number of concurrent queries per database across all pools, and a statement time limit set on the engine's database connection. Report what exists; propose, do not build.

Stop after the report.

## Phase 1: Home only, after the report is reviewed

Build a new console beside the current one. Do not modify or delete the current console in this phase. Choose the location and package name following the repository's conventions, and say which.

### Stack
React, Radix primitives (Dialog, Popover, Tabs, Checkbox, ScrollArea, Tooltip, DropdownMenu, Select), Phosphor icons in one weight, Motion for animation, visx for every chart. No other UI kit.

### Foundations
- Design tokens in one place: an 8 px spacing scale, three corner radii, a type scale of five sizes, two shadow levels, and the colours used in the images. Nothing hard-coded per screen.
- Light and dark themes; contrast at WCAG AA in both.
- One shared component for the seven treatment marks (clear, tokenized, masked, aggregate only, under custody, withheld, undecided). The same mark everywhere.
- One shared ring chart (visx) used by every report band.
- Hover, focus, pressed and disabled states on every control, with visible keyboard focus.
- Motion between 150 and 250 ms, only when state changes (rule 08). Respect reduced motion.
- Empty, loading and error states for every list.

### Rules from 01-Main, all 14 binding
1. One queue. 2. Health is a strip, not a page. 3. Report above, workbench below. 4. One primary action per screen; destructive actions in menus. 5. At most four numbers per band. 6. A state is a badge, never a sentence. 7. Names, not identifiers. 8. Motion only when state changes. 9. Same screens for the data owner and the operator; role changes the order, never the information. 10. Explanations live on the thing they explain. Activity records, Suggestions asks, Entitlements decides. Findings are badges on their source, column or key, with detail in a tooltip and a fix one click away. There is no separate findings page. 11. Works on a phone: navigation becomes a bottom tab bar, cards stack, tables become lists, touch targets at least 44 px. 12. Fixed row heights and column widths; long text is truncated, never wrapped; cards only for summaries, never for data that can grow. 13. A number in a band is also the button that filters by it. 14. Every name wears its kind: source, table, view, column, pool, row rule, agent, person, credential and receipt each have one icon (see the key on 01-Main), shown wherever the name appears, with the kind named on hover. Build it as one shared component.

Vocabulary on screen: say "table" (a view gets a different icon). "Object" stays in the API.

### Home scope (images 02 and 03)
Icon rail navigation with attention dots; project title with switcher; health as six icons in the header; the All / Decisions / Running it order switch; four number tiles; Needs you with one line per item and the effect shown on click; the Exposure ring filling its card's height; the 30-minute strip. Where phase 0 found an endpoint missing, show the placeholder state, never invented data.

### Checks before reporting
Lint, type check and unit tests for the new console only; no full gate. Screenshots of Home at 1440 px and 390 px, in light and dark, attached to the report so the result can be compared with images 02 and 03 before any other screen is built.
