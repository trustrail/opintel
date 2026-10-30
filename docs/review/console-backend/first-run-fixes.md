# First-run console fixes

Console-only follow-up on `feat/console-next-first-run`, against designs 17–19.
No backend, API schema, migration, grant, environment or deployment changes.
The React/Radix, Phosphor regular, Motion and visx foundations remain shared.

## Changes

- Step 2 is “Verify the engine” throughout Welcome, Home and its action. All six
  tracker columns have fixed number/state, icon/title and subtitle rows. Done
  steps show the project and engine result; remaining steps explain their work.
  Titles fit at 1440 and 390. Subtitles retain one-line ellipsis where needed.
- Needs-you groups missing query settings into “Set query limits · N values”
  and discovery settings into their corresponding form. Every field contributes
  to the count. Other decisions/checks remain separate. The action opens the
  existing console-next Settings editor directly; its existing admin restriction
  remains. The queue fills the workbench when Exposure is absent. Desktop queue
  height fits up to five rows; phone keeps its existing five-plus-disclosure.
- Phone Needs-you actions stay visible, and the Radix viewport's inner wrapper
  no longer makes the list wider than the screen. An empty 30-minute series shows
  only “No requests yet”.
- Source connection uses a tiled header, the specified subtitle, round close
  button, full-width stacked fields, truthful reachable badge, scan caption,
  three unwrapped tile labels and a left-caption/right-action footer. Engine,
  schemas and sampling remain the existing pre-registration controls.
- Welcome places the actual paired engine beside Create project with icon
  spacing. Phone labels stay within their columns and the headline divider spans
  the plan's full width. Name focus uses the existing shared focus width/colour.

## Checks and screenshot method

- Strict typecheck passed.
- Unchanged lint and dependency boundaries passed.
- Console unit tests: 82 passed in seven files. Coverage includes grouping,
  preserving other queue items, direct editor destinations, empty strip,
  tracker results/subtitles, deferred tests, successful tests and invalidating a
  reachable badge after the reference changes.
- Explicit browser layout regression: passed. It asserts document width and all
  horizontal scrolling containers for Welcome and Home at 390, all six step
  titles at 390 and 1440, and visible phone Needs-you actions within the viewport.
- `test/review/console-next-first-run.capture.ts` runs the real console application
  with deterministic endpoint response fixtures. The six captures are UI review
  evidence, not a new packaged-install acceptance claim. The previous packaged
  owner-to-receipt acceptance remains recorded in `first-run.md`.
- The single full gate runs on the committed candidate after these targeted
  checks. Its result and any merge commit are reported separately.

## Remaining differences from designs 17–19

- The engine reference feed is unavailable, so Reference is typed with the
  `./sources add` hint; there is no reported-by timestamp, waiting-reference
  panel or demo-data action.
- The existing test endpoint defers connectivity until assignment and policy
  acknowledgement. Its real message is shown before registration, with no false
  reachable badge. A true test result shows the badge immediately; a successful
  scan also confirms reachability. After scanning, the source is already
  registered, so the footer action is **Done**, rather than another **Connect**.
- Existing engine/schema/sampling controls appear before registration. Reference
  and Name become read-only afterward. Real scan counts are shown; unknown row
  estimates remain unknown. No sample values from the image are hard-coded.
- Welcome retains the shared 48 px display token, optional invitation role note,
  and conditional industry selection when the company has no default. Phone
  Welcome uses two columns for the six-step plan; Home uses two columns with all
  three fixed rows per step. Long subtitle lines may truncate, titles do not.
- Home retains its existing health/navigation controls and actual Needs-you
  contents; unavailable Exposure/Activity placeholder panels are absent. The
  source instructions explain the typed flow rather than a reference picker.
  The capture fixtures have no health observations or live stream, so their
  health is unknown and live indicator is grey; no status is invented.

## Screenshots

- [1440 light · Welcome](first-run-fixes-screenshots/1440-light-welcome.png)
- [1440 light · Home step 3](first-run-fixes-screenshots/1440-light-home-step3.png)
- [1440 light · before registration](first-run-fixes-screenshots/1440-light-connect-before-registration.png)
- [1440 light · after scan](first-run-fixes-screenshots/1440-light-connect-after-scan.png)
- [390 light · Welcome](first-run-fixes-screenshots/390-light-welcome.png)
- [390 light · Home step 3](first-run-fixes-screenshots/390-light-home-step3.png)
