# AGENTS.md

Rules for any agent working in this repository. **These are not preferences.** A change that violates one is rejected regardless of whether it works.

Keep this file short. If it grows past two pages it stops being read.

---

## What this is

Opintel sits between AI agents and a company's databases. It controls what each agent may see field by field, queries the databases in place, and records what every agent actually received.

**On "no copy", which is easy to overstate.** Two different things are true and neither is "nothing is ever written":

- **The query path copies nothing.** Queries run against the source in place, results are held in memory, and nothing is persisted after the response. No warehouse, no extract, no second store.
- **Nothing leaves the customer's environment.** Spreadsheet ingest does write: it flattens a file and lands it into the customer's own Postgres. That is the customer's data moving inside the customer's network, performed by software they run, and Opintel never receives the file.

Say it that way. An unqualified "nothing is copied" is false once ingest exists and a security reviewer will find it.

The promise the product is sold on: **no field is ever readable by accident, and for any request an agent made you can state exactly what it received.**

Most rules below exist to protect that sentence.

---

## Read before writing

| Document | When |
|---|---|
| `docs/implementation-plan.md` | Always. It names the item you are building |
| `docs/slice1-technical-documentation.md` | The sections your item names |
| `docs/algorithm-specifications.md` | Any item touching tokenization, view compilation, the DuckDB session, tenant isolation, or the pipeline |
| `docs/test-specification.md` | The test IDs your item must make pass |
| `docs/opintel-master.css` | Any frontend work |
| `reference/console.html` | Any frontend work. This is the reference implementation, not a mockup |

**Build one item at a time, in the plan's dependency order.** Do not start an item whose dependencies are not green.

---

## Never do these

1. **Never write code for these items.** They are hand-written, except where a row records a decision otherwise:
   | Item | What |
   |---|---|
   | 1.4 | Tenant isolation wrapper |
   | S4 | Ephemerality proof. **Delegated by decision**, on the condition that the reviewed design is implemented as specified: positive controls that stay live during the scan, incomplete coverage reported as incomplete rather than as zero matches, filesystem writes observed rather than inspected only at the end, and memory residuals reported honestly rather than suppressed |
   | S2 | DuckDB two-session construction. **Delegated by decision.** The bypass suite is specified in docs/bypass-attacks.md, written independently of the implementation, and is the verification hand-writing would otherwise provide. A session may implement any S2 item, including the suite, but must not weaken, remove or narrow an attack in the list |
   | C.6 | The bypass suite. **Delegated as item S2b by decision**, implemented from docs/bypass-attacks.md. Changing what an attack tests is a decision for review, not an implementation choice |


   If asked to implement one, say so and stop, unless its row records a decision otherwise. A generator produces plausible wrong answers in exactly these places, and a wrong bypass suite passes while proving nothing.
2. **Never modify `docs/opintel-master.css` without being told to.** It is the product's stylesheet, extracted from the console. Port markup to its existing classes.
3. **Never invent a CSS class.** If one is genuinely missing, say so and stop. Adding it is a reviewed change to the master file. Properties that affect rendering performance without affecting appearance, such as containment, are set where they apply and do not require a master pattern. This rule prevents ad hoc visual decisions; behavioural containment is not one.
4. **Never use `any`.** `strict` and `noUncheckedIndexedAccess` are on.
5. **Never write a raw hex colour or an arbitrary Tailwind value** (`text-[13px]`, `bg-[#1B0232]`). Tokens only.
6. **Never import a vendor SDK in feature code.** Everything external sits behind a port in `infrastructure/`.
7. **Never access the database outside a scope.** There are three and the pool is not exported:

   | Scope | For |
   |---|---|
   | `withTenant` | Tenant data. RLS active, user and project bound to the transaction |
   | `withPlatform` | Reading industry and vocabulary at industry scope |
   | `withPlatformAdmin` | Writing industry scope. Distinct role, and no customer-facing route reaches it |
8. **Never add a route without a declared permission.** The server asserts this at startup.
9. **Never authorize anything on `agentId`.** It is self-declared and used only for presence and evidence. The pool key is the membership.
10. **Never delete an entitlement row to make an element undecided.** Undecided is the absence of a row. There is no such treatment value and no route back to it.
11. **Never update or delete an evidence record.** The grants forbid it. If you need to change one, you have misunderstood the model.
12. **Never edit an applied migration.** Restore its exact applied bytes and put corrections in a new forward migration. Never rewrite the checksum ledger to accept an edit.
13. **Never guess where the spec is silent.** Stop and ask. A plausible invention is worse than a question, because it passes review.

---

## Always do these

**Domain**
- `Result<T, DomainError>` in domain and application layers. Exceptions only for genuine infrastructure failure
- Branded ids: `ProjectId`, `PoolId`, `ElementId`. Never a bare `string`
- One aggregate per transaction
- Domain events carry identifiers, never domain objects

**Boundaries**
- `api -> application -> domain`. Infrastructure implements ports defined in application. Domain imports nothing
- A module imports another module only through its public `index.ts`

**API**
- Zod at every boundary. The same schema generates the OpenAPI document and the typed client
- Cursor pagination. Never offset
- The error envelope, always. `message` is written for a human and appears in the UI unchanged

**Frontend**
- Server state in TanStack Query. UI state in Zustand beside its screen. There is no `src/store`
- Every query key comes from its entity's key factory
- Every screen renders loading, empty, error and ready
- Every mutation invalidates exactly what the matrix says
- Navigation: a project-level destination screen is a drawer sub-item under
  its parent, shown when the parent is active. It is never only a link on
  the parent's screen. Links that carry a specific object (a source's runs,
  a failing run, a superseded filing) stay in context. See §5.5.
- Breadcrumbs: every segment except the current page is a link to that
  scope. At narrow widths, show only the parent as a back link. See §5.5.
- Drawer items with sub-items carry a disclosure chevron: right when
  collapsed, down when expanded.
- No screen renders its own back link or button. The breadcrumb is the only
  back affordance. See §5.5.

**Failure**
- Fail closed. If an entitlement cannot be resolved, refuse
- A refusal is not an error. It logs at `info` and is never alerted on
- Every refusal is recorded with its reason

**Telemetry**
- No customer data in logs, spans or metric labels. Field names and identifiers yes, values never
- Never label a metric by element, agent, user or run id

---

**Validation scheduling**
- Run typecheck, lint, builds, browser setup and test suites sequentially on one machine. Never overlap separate validation commands. `npm run check` supplies the full ordered path; focused checks follow the same rule.
- Iterate with affected tests; run typecheck and lint after a coherent batch. Run the required gates once on the completed candidate before its commit, using the change-scoped rule and subject to the screen-review workflow below. Never run a full gate with a known defect outstanding: fix it and verify locally first. Quiet output during a long suite is expected, not evidence of a stall. See the plan's §6.6 for the focused path.
- **Change-scoped completed-item validation:** `npm run check` always. Run the browser pass when anything under `src/app/` or `docs/opintel-master.css` changes. Run performance and ephemerality when Engine, treatment or storage paths change, and always before a release tag. Shared code changes that affect one of those paths count too. This rule selects when suites run; it does not reduce their assertions or thresholds. The current `check` script still includes every suite; until the command is separated, invoking it runs that superset.
- **Screen work the user reviews:** during redesign iteration, do not run the visual project or regenerate baselines. Implement, run affected functional, conformance/placement and accessibility checks, then report the screen ready for review. Iterate on the user's judgement. Only when the user explicitly says a screen is right may its baselines be regenerated, in one baseline-only commit naming the approved change. Before the item commit, run snapshots for screens the item did not touch to catch unintended changes. This overrides snapshot iteration in the plan's §6.6: snapshots record the approved design; they do not decide whether a redesign is right.

- **Baseline reproducibility:** after regeneration, capture every changed scenario again on unchanged code in the same pinned browser environment, using Playwright’s stabilized screenshot matcher. Diff the new capture against the regenerated image: dimensions must match and the differing-pixel count must be zero before committing. A matcher pass with tolerance is not sufficient; do not use retries or widen tolerances to establish reproducibility.

## Definition of done

An item is finished when all of these hold. This is the pull request template.

- [ ] The named test IDs pass
- [ ] Typecheck passes, strict
- [ ] Lint passes, including boundary and token rules
- [ ] Migrations run up and down
- [ ] New routes declare a permission
- [ ] New external calls sit behind a port
- [ ] New screens have all four states, pass axe, and have snapshots at 390 / 900 / 1440; user-reviewed screens receive baselines only after explicit design approval
- [ ] No new CSS class
- [ ] Where the build diverged from the spec, the spec is updated in the same change

---

## When you are unsure

Say what you are unsure about and stop. Do not pick an option and proceed.

The specifications are unusually detailed precisely so that this rarely happens. If you find yourself choosing, the specification has a gap and the gap is the thing to report.
