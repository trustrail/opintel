# Home review fixes

Delivery branch: `feat/console-home-fixes`. The current console is unchanged.
This branch contains the parallel Home and its reviewed corrections. The phone
completion authorizes one full gate after commit, then merge/push only on pass.

1. Every needs-you page is read to its terminal cursor. All items remain mounted
   in fixed-height rows. Desktop scrolls inside the card; phones show five items
   plus “N more”, expanding the remainder into the page. Keyboard focus reaches
   the final item. The former 100-page cap is covered by a 101-page regression.
2. Known setup and failed-check findings use warning, including missing engine
   registration/verification, failed or incomplete source checks, uninitialized
   token keys and self-signed TLS. Unknown means the check could not be read/run.
   Desktop icons use the status colour and the actual reason on hover.
3. Navigation attention comes from needs-you kinds: column/row decisions mark
   Data and Pools; settings/check items mark Settings. Health totals do not
   manufacture navigation dots.
4. Decision lines use API-provided pool/table/view/column context and the shared
   kind icons: pool badge, table, `·`, column (or row rule). No opaque title is
   parsed into invented entities. Badge initials come from the real pool name;
   its full name remains available on hover. Multi-table name groups retain all
   their actual table/view members and their original counts.
5. Effects appear only when a row expands. Expanding adds a fixed detail region
   with the resolving link; collapsed rows contain no effect subtitle.

Confirmed: band numbers open their filtered lists (including granted receipts
and connected agents); kind names appear on hover; keyboard focus is visible;
reduced motion disables animation. Unit tests and the real-API browser capture
cover these behaviors. No authorization, entitlement or query guard changed.

## Validation

- Console tests: 16 passed.
- Needs-you/health backend tests: 10 passed.
- Strict typecheck: passed.
- Lint: passed.
- Four-view manual capture: passed, real PostgreSQL/Engine APIs and Redis SSE,
  no browser page errors. All queue rows reachable, focus/hover/filter checks
  pass, live requests change from 7 to 8 and disconnect enables polling.

## Updated screenshots

| Width | Light | Dark |
|---|---|---|
| 1440 px | [Light](phase1-screenshots/home-1440-light.png) | [Dark](phase1-screenshots/home-1440-dark.png) |
| 390 px | [Light](phase1-screenshots/home-390-light.png) | [Dark](phase1-screenshots/home-390-dark.png) |

[Capture evidence](phase1-screenshots/capture.json) ·
[Full Phase 1 report](phase1.md)

The screenshot numbers/names are actual isolated fixture results, not the
illustrative reference values. Mail remains omitted; an unreadable TLS flag is
unknown. Unrelated pre-existing local changes are excluded from the commit.


## Phone completion

Phone width is the existing <=700 px breakpoint. With eight real fixture items,
Home initially shows five and “3 more”. Expanding shows all eight in place;
there is no internal phone scroll. Desktop scrolling is unchanged. Project
switches reset the phone disclosure. Screenshots above are the updated phone
views (desktop reference captures are retained).

The full gate is run exactly once after the candidate commit. Its result and,
only on pass, the pushed main merge commit are recorded in the final handoff.
