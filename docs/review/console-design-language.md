# Console design language — Stage 2

Status: proposed for Rick's review, following approved [Stage 1](console-ia.md). No product screens or routes changed. No baselines regenerated. The existing brand files remain unchanged; the proposed changes are supplied as a reviewable patch.

Open [the static component page](console-components/index.html). It contains synthetic specimens, embeds its fonts and JavaScript, needs no server or network, and never calls a product API. Source and exact dependency lock are in [console-components](console-components/). Run `npm ci --prefix docs/review/console-components`, then `npm run build --prefix docs/review/console-components` to rebuild. This isolated package does not change the product's dependency graph.

## The visual argument

Opintel makes a decision about a value and records the consequence. The interface should make those two facts easy to read: plain language beside a precise identifier, an explicit treatment beside what it delivers. Deep purple defines structure; green identifies deliberate action; ivory is the working surface. Rows and rules organise evidence. Colour accompanies a label and never substitutes for one.

Retain the Trustrail identity from [visual-language.html](../visual-language.html) and [opintel-master.css](../opintel-master.css): deep purple `#1b0232`, green `#0cc655`, machine artifacts in IBM Plex Mono, literal treatment labels, and yellow reserved for a decision needed. Add ivory `#fbfaf7`, Space Grotesk display and IBM Plex Sans text as requested. The existing circular treatment marks remain an available redundant signifier; this specimen tests labelled colour chips without needing a mark to convey meaning. Do not use a mark alone as a row action.

Explicitly reject Inter, Roboto and system-default typography; card-grid dashboards; left-border status cards; gradient headers; emoji icons; Bootstrap-grey chrome; and icon-only toolbars. Buttons name the action. There is no dashboard in this specimen. Notices are horizontal rows with a category pill, a fact and a link. The purple masthead is flat. Summary facts appear once. Treatment colours are categories, not a health score or exposure ordering.

Dark mode is out of scope: these seven treatment pairs, source-value previews, diagrams, focus rings and every permission/error state need independent dark-surface validation. It is not a cheap inversion.

## Proposed evolution as a diff

Review [brand evolution patch](console-components/brand-evolution.patch). It is **not applied**. Its master stylesheet addition is the exact [review stylesheet](console-components/review.css), scoped to `#opintel-app[data-language="next"]`; existing selectors continue to serve the legacy console. It adds no new class names: component selectors are semantic elements/data attributes and existing `.btn`, `.tr`, `.mono` names.

The `visual-language.html` diff retires its duplicated inline styles/specimens and embeds this canonical component page. This replaces the default system stack and conflicting type/spacing/radius values with a single maintained contract. The specimen’s bundled fonts are the reproducible review source. Production font delivery will use local assets, not a remote runtime dependency.

| Keep | Add / evolve | Retire in `/next` |
|---|---|---|
| Purple and green brand anchors; explicit labels; machine/prose separation | Ivory canvas and deliberately limited typography | Lavender canvas and Manrope/system-default text |
| Literal states and absence semantics | Seven measured treatment fills, distinct in luminance | Similar pale fills that depend largely on hue |
| Existing class contracts | Opt-in data-attribute component styling | Ad hoc per-screen sizes, fractional type sizes and assorted radii |
| Disclosures for detail | One elevated adjacent panel and history Back | Breadcrumb hierarchy in `/next`, duplicate standalone detail rendering |
| Existing semantic actions and confirmations | Text-labelled controls, visible row-filter cues | Icon-only actions and inert shell affordances |

No automatic legacy rollout is proposed. If the change is later applied globally, it changes line wraps, virtual-list measurements, control heights, SVG labels and every baseline containing the shell. That is a full affected visual-scenario audit and regeneration cost, not a three-screen snapshot update. Under an isolated `/next` flag, legacy snapshots must remain unchanged; add the component page and all six approved screens at 390/900/1440, plus their state/dialog variants. Preserve the settled-paint/font precondition; regenerate only after Rick approves, recapture with zero differing pixels, and run the applicable gates in the approved sequence. No tolerance change is part of this design.

## Tokens

Exactly five sizes. Identifiers and values inherit the appropriate size but use IBM Plex Mono; they do not introduce a sixth size. Large numbers use the title or section token, never an oversized dashboard numeral. Text sizes are fixed across the three widths; wrapping and layout do the responsive work.

| Role | Face / weight | Size / line height |
|---|---|---|
| Page title | Space Grotesk 600 | 32 / 40 px |
| Section | Space Grotesk 500 | 24 / 32 px |
| Body / controls | IBM Plex Sans 400, 500 for action labels | 16 / 24 px |
| Secondary | IBM Plex Sans 400 | 14 / 24 px |
| Caption | IBM Plex Sans 400–500 | 12 / 16 px |

Spacing: 8, 16, 24, 32, 40, 48, 64 px. Use zero where adjacent geometry must touch. Borders (1–2 px), focus strokes (3 px) and font metrics are not spacing tokens. Control minimum height is 48 px; dense read-only rows can grow with wrapping. Radius: 8 px for controls/chips, 16 px for panels/state containers. One shadow: `0 8px 24px rgb(27 2 50 / .16)` for the floating panel and tooltip only. Lists use rules, not shadows.

Focus: 3 px purple outline with a 3 px ivory separating ring on light surfaces; green outline with a purple separating ring on purple. The outline is visible even around purple buttons. Never remove a focus indicator on selection or hover. Disabled text remains contrast-compliant and is accompanied by its permission/prerequisite reason, not faded into illegibility.

## Treatment and text contrast

The formula is WCAG sRGB relative luminance with `(Llighter + .05) / (Ldarker + .05)`, calculated from the exact tokens by [build.mjs](console-components/build.mjs). Every specified pair meets **4.5:1 even for caption text**. A pair not listed here is not approved for text. Native input surface uses the primary/surface pair; tooltip and selected segment use inverse/purple; buttons use clear/action; links inherit an approved foreground and remain underlined.

The seven treatment background luminances are 0.0051, 0.0808, 0.1621, 0.3117, 0.4112, 0.5111 and 0.8799. Thus they differ in lightness as well as hue. These differences do not establish an exposure rank, guarantee recognition without labels, or replace colour-vision testing. Custody is a warm mineral colour, withheld is purple, and only undecided is yellow. Error is a separate dark red; refusal/withheld are not error red.

| Pair | Foreground | Background | Background luminance | Ratio |
|---|---|---|---:|---:|
| Primary / ivory | #1b0232 | #fbfaf7 | 0.9560 | 18.27:1 |
| Secondary / ivory | #5a4a6b | #fbfaf7 | 0.9560 | 7.66:1 |
| Primary / surface | #1b0232 | #ffffff | 1.0000 | 19.07:1 |
| Secondary / surface | #5a4a6b | #ffffff | 1.0000 | 8.00:1 |
| Inverse / purple | #fbfaf7 | #1b0232 | 0.0051 | 18.27:1 |
| Clear / action | #1b0232 | #0cc655 | 0.4112 | 8.38:1 |
| Tokenized | #fbfaf7 | #1f6fd0 | 0.1621 | 4.74:1 |
| Masked | #1b0232 | #c8bca9 | 0.5111 | 10.19:1 |
| Aggregate only | #fbfaf7 | #65417f | 0.0808 | 7.69:1 |
| Custody | #1b0232 | #b09279 | 0.3117 | 6.57:1 |
| Withheld | #fbfaf7 | #1b0232 | 0.0051 | 18.27:1 |
| Undecided | #1b0232 | #fff730 | 0.8799 | 16.89:1 |
| Error / ivory | #7a1428 | #fbfaf7 | 0.9560 | 10.27:1 |

Focus purple/light exceeds 18:1; green/purple is 8.38:1. Decorative rules are not text or the sole indicator of a control; inputs and active boundaries use ink rather than the pale rule. Shadow colour is not a text surface. Brand font fallback names exist only for catastrophic font failure; review captures must show the embedded faces loaded.

## Component contract and specimen coverage

| Component | Rendered contract / behavior |
|---|---|
| Notice bar + category pill | Full-width ruled row, “Decision needed” yellow pill, one fact and “Review row filters”. No left accent border. Success/information uses neutral text, errors use their named state. Suppress empty notices. |
| Segmented control | Labelled group of named buttons with `aria-pressed`; Columns / Rows and By name / By table. Native Tab/Space/Enter navigation; selected state is not colour-only. This is not an ARIA tab widget with missing tab panels. |
| Value chips | Domain/value and object identifiers use Mono. A removal action has a complete accessible label, never an unexplained ×. Chips wrap instead of cutting off essential values. |
| Type-aware input | Integer step/min, date control, Boolean selector, known-enum selector, null operator with no operand, typed bounded text where no finite vocabulary exists. Client validation constrains the type; server policy, schema changes and conflicts can still refuse a save. No invented enum or value-discovery API. |
| Data table row | Name and where it appears; exposed type; labelled treatment control; what the agent sees. Horizontal overflow is explicitly keyboard reachable. Long values have expansion, not hover-only disclosure. |
| Summary bar | Small number of facts in one ruled line; one labelled primary/context action. Wrap as a unit on narrow widths. Does not repeat a treemap's exact facts on the same product screen. |
| Treemap tile | Synthetic row-count fixture only. `ParentSize` supplies dimensions; `@visx/hierarchy` squarify allocates area, labels use `@visx/text`, `@visx/group` groups nodes, `@visx/tooltip` manages hover/focus detail. Keyboard Enter/Space selects; Escape dismisses detail. Tiny tiles omit internal labels but retain accessible names and the adjacent text equivalent. |
| Receipt diagram | Measured container; `@visx/scale` places stages, Group/Text renders them. Wide horizontal and narrow vertical reading orders use the same evidence sequence. Relative container geometry, no fixed SVG canvas or aspect-ratio workaround. Text description conveys the meaning without inspecting a line. |
| Side panel | Keeps launching list visible when wide; stacks when narrow. One elevation, Back, explicit header, local detail. The specimen closes/reopens; product history/dirty-work handling remains Stage 1's contract. |
| Breadcrumb-free header | Opintel identity, context label and labelled Back; no breadcrumb. Static Back has a meaningful document/context target. Actual history and natural-parent behavior belongs to `/next`, not simulated browser history in this component page. |
| Shared states | L, E0, EF, X, P, M and S from Stage 1, selectable and rendered below. No new per-screen state vocabulary. |

The specimen deliberately uses a text table beside synthetic treemap data as its accessible equivalent and audit aid. That is not a proposal to repeat facts in two product widgets; a product visualization can expose the equivalent on demand. The specimen is also not a mock Home or Pool page.

## Shared states, rendered once

- **L**: labelled loading progress. Refetch preserves previous data with refreshing/as-of. Pending actions prevent duplicate submission.
- **E0**: no row filters, explanation of object default versus pool override, permitted setup action.
- **EF**: no matches, filters preserved, Clear filters.
- **X**: named scoped error, edits retained, Retry. The specimen retries locally and sends nothing.
- **P**: available content remains, permission reason next to disabled edit; hidden detail is not zero.
- **M**: loaded count and explicit Load more; specimen grows from three to six. Real screens use actual endpoint cursors and bounded rendering.
- **S**: saved position unavailable, draft/session limit and return to accessible list.

Errors and notices announce changes without replacing the entire document. No shimmer or perpetual animation is required. Reduced motion removes nonessential transitions. Product dialogs must trap focus only when genuinely modal, restore the launching control and preserve shown-once key protections; the adjacent specimen panel is deliberately nonmodal.

## visx, dependencies and license boundary

The isolated specimen pins `@visx/responsive`, `@visx/hierarchy`, `@visx/scale`, `@visx/group`, `@visx/text`, `@visx/tooltip` to **4.0.0**. It uses React/React DOM **19.3.0**, the three Fontsource packages **5.3.0**, and build-only esbuild **0.25.12**. The lockfile pins transitive dependencies. No direct d3 imports and no other chart library. `hierarchy` and `treemapSquarify` are imported through visx's public exports. Every chart/diagram uses `ParentSize`; ordinary HTML controls and type samples are not charts.

The dependency choice follows the [official visx repository](https://github.com/airbnb/visx) and [responsive package documentation](https://www.npmjs.com/package/@visx/responsive). Installed declarations verified the public hierarchy exports and React peer compatibility. The build traverses actual bundled dependencies and produces [THIRD-PARTY-NOTICES.txt](console-components/THIRD-PARTY-NOTICES.txt), including MIT visx, ISC d3 submodules, BSD-3-Clause `d3-hierarchy` 1.1.9, React and the fonts' SIL Open Font License. A missing license fails the specimen build. This file accompanies the standalone bundle; do not omit it when distributing the page. Stage 3 must repeat this accounting for the actual product bundle.

## Review and validation boundary

Review the five-size hierarchy, spacing/density, seven treatment colours, explicit row-filter cues, panel proportions and narrow behavior. The static page demonstrates all required components; it is not a visual baseline or a shipped feature. The proposed master/reference diff remains unapplied until review. Home contract audit says lists, not a treemap; no “most exposed” ordering has been invented.

Validation records and captures are recorded below after inspection. No product gate, baseline update, commit or push is authorized by this Stage 2 work. Stop for Rick before `/next` implementation.


**License distinction for review:** the requested shorthand “d3 submodules (ISC)” is not true of this dependency graph: `@visx/hierarchy` 4.0.0 depends on `d3-hierarchy` 1.1.9, whose installed package and full license say BSD-3-Clause. The review bundle includes that notice and does not relabel it or override the dependency. Rick should acknowledge this distinction before Stage 3 dependency adoption; no product packages have changed.

### Validation record

- Static build succeeds; 13/13 specified text pairs meet AA. Lowest: Tokenized, 4.74:1.
- Headless local Chrome at 390×900, 900×900 and 1440×900: no page overflow, no browser errors, no WCAG 2 A/AA or 2.1 AA axe violations on the page or seven state specimens.
- Segmented selection, all seven state views, Load more, keyboard tile selection and side-panel close/reopen checked at each width. Embedded Space Grotesk, IBM Plex Sans and IBM Plex Mono loaded at all three widths.
- Treemap/receipt SVG widths equal measured containers: 358, 852 and 1152 px respectively. The narrow diagram changes reading direction, preserving its sequence; treemap area preserves the supplied row proportions.
- An initial narrow contrast-table keyboard-scrolling finding was fixed by making the labelled region focusable. An initial capture readiness check counted visx’s internal text SVGs; it now waits for each measured visual to have its rendered SVG. Neither involved a product change or tolerance.
- Proposed patch passes `git apply --check`; original brand files and product package/lock files are unchanged. No gate or baseline regeneration.

Review captures: [390](../../tmp/review/console-language/components-390.png), [900](../../tmp/review/console-language/components-900.png), [1440](../../tmp/review/console-language/components-1440.png). All seven state crops and the machine-readable record are in [capture index](../../tmp/review/console-language/index.html). These are local review artifacts, not baselines; rebuild and run `node docs/review/console-components/validate.mjs` to refresh them with local Chrome and the repository’s Playwright/axe installation.

Stop here for Rick. No `/next` implementation until Stage 2 is approved.


## Stage 3 dependency decision

Only **Activity’s selected-receipt diagram** consumes visx in the prototype: ParentSize measures its container, scale positions the recorded stages, Group and Text render the diagram. Install only responsive/scale/group/text (4.0.0). Home uses lists; Sources, Pools, Decisions and Settings use semantic HTML controls/tables and have no visualization dependency. Do not install hierarchy or tooltip into the product. Revisit those packages only after per-object row counts/coverage exist and Rick approves the treemap exposure ordering. The BSD hierarchy dependency remains confined to the isolated Stage 2 specimen.

See [brand rollout scheduling](console-brand-rollout.md) for the exact 126-scenario / 204-image global inventory. The exact opt-in patch affects zero existing snapshots; global adoption is not a Stage 3 side effect.
