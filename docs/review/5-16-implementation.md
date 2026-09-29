# Item 5.16 implementation

Project, company and personal settings are implemented. Project sections are
Settings drawer sub-items; company settings are reachable from the project details,
company breadcrumb and chooser. Personal settings are reachable from the account
control. Breadcrumbs remain the only back affordance. Existing console classes
are used throughout; the master stylesheet is unchanged.

The approved §5.8 table has one executable definition in
`src/shared/project-settings.ts`. It supplies form labels, effects, defaults,
allowed values and numeric bounds, and constructs the project write schema.
The contract tests compare the complete active table with the definition list,
render every input, compare its description/bounds and test accepted/rejected
boundary values. Runtime query, aggregate, presence, key-grace and sampling
readers reuse these definitions. Missing hardware limits remain missing and query
execution refuses; saving another setting does not invent a hardware default.

Migration 050 records the verified legacy mapping next to the backfill:
rules_only, revert, carry, false, false, and absent sampleSize. Existing projects
retain their behaviour. Project creation persists these safe discovery defaults from the shared definition;
readers use the same defaults when a discovery property is absent. Sampling off with no size is coherent and produces no warning.
Sampling requires a size when enabled; source consent alone cannot bypass the
project gate. The sidecar wire now carries explicit project sampling permission,
and its generated OpenAPI contract is updated.

Discovery publication honours hold/rules_only, revert/carry, detected rename
identity and exposed-name adoption. Renames without stable references continue
to be removal plus addition. Type changes retain their run-diff facts even when
carrying decisions. Query execution takes one settings snapshot, and the durable
completion records the effective settings in its source plan. Changing settings
while execution is underway does not replace the recorded values.

Company settings expose default industry/region, allowed domains, idle timeout
and enforced SSO. Company/member and project/viewer controls are visible but
read-only. Database triggers serialize company/provider writes and refuse
anything that would leave enforced SSO with other than exactly one enabled
provider. Existing magic-link sessions are rejected and revoked at their next
read after company enforcement. New sessions pin the shortest applicable company
idle timeout; existing sessions retain their original timeout. Invitation writes
check allowed domains. Company defaults preselect unset create-project fields.

Settings writes include actor/before/after audit entries in the same transaction.
Narrow tenant-scoped database commands update project settings and rename without
granting the tenant role arbitrary project updates. Migration 051 supplies the
rename command. Audit grants remain append-only. Personal settings add date format
and reduced motion; email remains read-only. Reactive timestamp components use
the selected timezone and format, except explicitly UTC dashboard daily totals.
Reduced motion overrides animations/transitions while retaining OS behaviour
when the preference is off.

The §5.3 invalidation matrix includes the new writes. Query settings refresh
entitlement definitions, evidence settings refresh Activity projections, and
agent timing/key grace refresh the affected pool/presence families.

## Scope and verification

- Q-004, Q-005, Q-010, Q-020, Q-028–Q-030 and Q-034 remain deferred to 5.16a,
  outside Slice 1a. Neither scheduling nor daily budgets is exposed as an inert
  control. Existing stored deferred fields are preserved.
- Q-025–Q-027 configuration is implemented; retention, stored redaction and capture
  sampling execution remain 5.17. The UI explicitly states the current behaviour.
- Q-021 validates/exposes the approved 1,000–1,000,000 threshold, default 50,000.
  Its execution remains the prompt pipeline as specified in the approved table;
  direct SQL/explain does not gain an invented confirmation flow.
- Settings/schema, session, catalogue identity and sampling regression: six files,
  65 tests passed (20.72 seconds).
- Migration, query/evidence, staged execution and session regression: six files,
  59 tests passed (53.76 seconds). Both migrations rolled down and back up;
  the migration test verifies legacy values and the unchanged database column default.
  The project creation route test asserts the persisted discovery values and the
  absence of sampleSize and guessed query limits.
- Follow-up settings, in-flight evidence, introspection, demo pack and route-schema
  checks passed 63 tests, including Q-037's persisted in-flight settings proof. The accompanying source-registration file initially
  failed because its fixture update used a transaction variable outside its scope;
  the fixture was corrected to use withPlatform. Final source-registration,
  sampling and contract-completeness regression: four files, 47 tests passed
  (52.47 seconds).
- Settings and tenancy browser run: 21 tests passed (2.0 minutes), including
  keyboard, axe and overflow checks and snapshots at 390/900/1440. Settings include
  loading/error recovery, read-only views, successful saves and coherent sampling
  state. Captures were visually reviewed. A fixture omitted the industry's slug;
  it has been corrected so the company default is visibly selected. Final visual
  refresh: three tests passed (39.2 seconds), all seven settings surfaces at
  each width.
- The first save-flow run caught shared Button's default type=button; form actions
  now explicitly use type=submit. The aggregate privacy regression's old fixture
  exceeded the approved maximum; its sentinel is now inside the valid range,
  preserving the assertions against exposing thresholds.
- Final descriptor/document completeness, invalid stored-value rendering and
  Activity redaction regression: two files, 10 tests passed (9.38 seconds).
- Invitation regression: 12 tests passed (8.29 seconds), including Q-032's
  rejection before persistence/delivery and acceptance of an allowed domain.
- Strict typecheck, lint/boundary checks and production build have passed during
  verification. The existing >500 kB bundle warning remains (659.72 kB before
  gzip).
- The initial focused verification did not include the full repository or bypass
  suites. The full repository result after the discovery correction is below.
  Tests and migration verification use the isolated database, not development data.

## Discovery defaults correction

Project creation now writes the accepted discovery defaults from the shared
settings definitions: rules_only, revert, carry, false and false. sampleSize and
hardware-dependent query limits remain absent. The database column default is
unchanged. Missing discovery properties resolve to the same safe defaults on
read; invalid explicit values still fail validation. §5.8 distinguishes defaults
that preserve existing behaviour from values only the customer can supply.

The four fixture-only discovery updates added during initial verification were
removed. The creation route test checks actual persisted settings, including the
absence of sampleSize and query limits. The settings regression now checks that
introspection completes with safe defaults before exercising explicit overrides.
Strict typecheck and lint passed. Settings visual verification passed all three
widths (three tests, 1.2 minutes); the changed discovery capture was inspected.

Final full run: `npm test` completed in 570.49 seconds: **133 files passed,
1 failed; 1,343 tests passed, 1 failed** (134 files / 1,344 tests total).
The discovery/introspection failures are resolved without fixture settings.
Both settings migrations rolled down and up successfully in this run.

The sole failure is N-003 in `test/mcp-explain.test.ts:66`. That test writes
aggregateMinGroupSize=938173 and expects explain to permit the aggregate. The
approved 5.16 bound is 1–1,000, so the shared runtime validator refuses the
invalid stored setting and `permitted` is false. This test was left unchanged;
the production bound was not relaxed. The full suite is therefore **not green**.

The production build passed (659.81 kB before gzip, existing bundle-size warning).
The separate bypass suite was not rerun for this correction.

## Final verification after the explain correction

The approved N-003 sentinel change replaces 938173 with 937 without changing its
SQL or assertion structure. Explain no longer depends on project execution limits
or the pool threads budget: missing values are named in notes. Validation now uses
a separate parse/bind-only sidecar capability, fixed at 128 MB, one thread and two
seconds. See the 5.9 review and algorithm C.4 for the capability and deadline proofs.

Final `npm test`: **135 files passed; 1,347 tests passed; zero failures**, in
481.20 seconds. Both settings migrations rolled down and back up in this run.
The preceding six-file focused regression passed 68 tests (49.22 seconds).
Complete bypass gate: **97 passing checks, zero registered open checks, zero
regressions**. Strict typecheck, lint, production build and diff checks passed.
The existing bundle-size warning remains. These final results supersede the
single-failure full-run result recorded above; the discovery and explain failures
are both resolved. Tests used the isolated database, not development data.
