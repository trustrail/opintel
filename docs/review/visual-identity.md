# Item 5.27: visual identity

The shared inline SVG set transcribes the 38 designs in
`docs/visual-language.html`. Marks expose their name and category. Existing
containers and palette tokens are used; the control conformance gate is
unchanged. A separate placement check rejects duplicate row marks, kind marks
in uniform lists, redundant heading/empty-state identity and unnamed legacy
badge dots. Logical list scope comes from the data contract, not a virtual
window's current contents.

Navigation uses the designed destination marks. Treatment badges and Dashboard
spectrum labels use the six exposure shapes; by-reference remains text-only.
Quarantine, decision, refusal, incomplete and stale marks accompany actionable
states. Normal outcomes remain text. Uniform element trees carry treatment
marks, not element-kind marks. Decorative empty-state identity glyphs are
removed; contextual loading/error affordances remain.

Prompt and Audit log designs are retained without being surfaced. Query is
currently a uniform Activity stream, and dereference has no distinct Activity
mode. Agent, filing and evidence kind marks have no mixed-object list to label.
Their existence does not justify placing them in headings or uniform lists.

## Catalog readability correction

The prior 390px baseline already truncated column names to one character. That
was a defect before 5.27; the added mark exposed the remaining width deficit.
The initially regenerated image hid the name entirely and was rejected.

The reviewed master rule uses the existing 820px breakpoint. Narrow element
rows are 76px: tree indentation and name on the first line; exposed type,
treatment mark and Declarations on the second, without additional indentation.
The visible treatment label is omitted there and the non-focusable SVG has
`role="img"` and an accessible treatment name. Other marks accompanying labels
remain decorative. Unsupported/unnameable states retain text. Structural rows
remain 46px. Virtualisation uses cumulative mixed-height offsets, including
keyboard navigation, rather than multiplying the index by 46.

The 390px image was inspected after correction. The fixture's full names fit,
type and action remain visible, and checks assert that adjacent rows do not
overlap. Catalog also passes at 900 and 1440px. This is a readability correction,
not a claim that Catalog scroll performance improved; G-019's performance
threshold is unchanged.

## Validation and baseline causes

Production and conformance typechecks and lint passed. Eight focused UI tests
passed. The ten focused browser scenarios passed, but that command exited
nonzero because the conformance reporter requires all 52 routes. The full gate then passed all 209 scenarios in 12.3 minutes, visited 52/52
routes and reported zero findings with no retries. Partial coverage is not
counted as a full pass.

The initial full baseline-generation run had 79 passes, one Catalog failure and
one Settings case that passed only on retry. The Catalog failure led to the
reviewed correction above, not an assertion or timeout change.

Baseline-only commits group navigation, exposure treatment geometry, actionable
state geometry and Catalog's pre-existing responsive defect. Each message names
the marks and screens affected and records shared navigation/empty-state causes
where an image has more than one cause. Browser version remains bundled Chromium
153.0.8010.12 in the pinned Playwright 1.63.0 Noble image. Clocks remain frozen;
no snapshot threshold or timeout is changed.

The first comparison run exposed that the initially proposed generic element-row
selector also applied to Entitlements. Its baseline was not updated. The rule
was scoped to `data-catalog-tree`, preserving the approved Catalog layout and
leaving other trees unchanged. The interrupted run is not a passing result.

Scoping the rule also made its approved `background:transparent` override the
old `.tr.wait` badge background. The 390px Catalog diff was inspected: only the
extra yellow badge backing disappeared; the specified yellow-bg disc and ink
outline remain, with names, types and actions unchanged. Only that baseline
was regenerated. Entitlements' six comparisons then passed without any image
update. A subsequent full comparison supplies the final result below.

Final verification: the full visual comparison passed **81/81 cases in 7.6
minutes with no retries** after the Catalog-only selector and final 390px
baseline correction. No baselines were updated during that passing run. Final
production/conformance typechecks and lint passed after the selector correction.
The eight focused UI tests and full 209-scenario conformance run passed as
reported above; no timeout, threshold or control gate was changed.
