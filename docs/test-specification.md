# Opintel: Test Specification

**Companion to the Technical Requirements. Organised by slice.**
Version 1.0 · September 2026

---

## 0. Coverage method

"100% of functionality" is only meaningful if it is *traceable*, not asserted. Coverage here is established by four techniques applied to every requirement in Parts A–D:

| Technique | Applied to |
|---|---|
| **Equivalence partitioning** | Every input: valid, invalid, boundary, empty, oversized |
| **Boundary value analysis** | Every numeric or temporal limit: TTLs, budgets, row caps, thresholds |
| **State transition** | Every state machine, sessions, introspection runs, agent presence, releases, observations |
| **Decision table** | Every branching rule, route resolution, entitlement resolution, source resolution, gate evaluation |

**Traceability rule.** Every normative statement in the requirements carries at least one test ID. A requirement with no test is a coverage gap and blocks the slice. A test with no requirement is either dead or reveals an unwritten requirement, resolve, never delete quietly.

**Test types:** `F` functional · `A` authorization · `S` security · `D` data integrity · `P` performance · `X` accessibility · `C` contract · `R` resilience.

**Automation:** all cases are automated unless marked **M** (manual), which is reserved for judgement, visual quality, copy review, and the ergonomics assessment in the pilot criteria.

**Fixtures.** One seeded project, `Far East Treaty Book`, Kuwait Re, Reinsurance. Sources: the demo pack, which is twelve cedant spreadsheets in inconsistent formats landing into a demo Postgres, plus one customer Postgres. 2,140 elements, four pools, sixty-one deliberately undecided, deterministic. Every test starts from this seed and restores it. Tests that mutate the seed run in a transaction rolled back at teardown, or against a per-worker database. Integration tests use `TEST_DATABASE_URL`, never the development `DATABASE_URL`; CI migrates the isolated test database before running them.

---

# SLICE 1: PILOT

## S1-A · Sign-in screen and route resolution

| ID | Type | Case | Expected |
|---|---|---|---|
| A-001 | F | Screen renders with no email entered | Email field, "Continue with email", and every platform-enabled provider button visible |
| A-002 | F | `GET /auth/providers` with unknown domain | Returns platform defaults only. No company is revealed |
| A-003 | F | Email at a domain with SSO **available, not enforced** | Link sent, and the screen offers "You can also continue with {provider}" |
| A-004 | F | Email at a domain with SSO **enforced** | Redirect to the IdP. No email sent. Destination named before redirect |
| A-005 | F | Email at an unknown domain | Response identical in shape to A-003. **No email sent** |
| A-006 | S | Timing of A-003 vs A-005 across 100 runs | Median difference under 30ms; no statistically separable distribution |
| A-007 | F | Email with a pending invite, no company match | Link sent with the invite attached |
| A-008 | F | Provider button clicked with the email field empty | Provider flow starts; email arrives from the IdP |
| A-009 | F | Provider button clicked with an email typed | Typed email used as a login hint |
| A-010 | F | Malformed email | Inline validation, no request sent |
| A-011 | F | Email 320 characters (RFC max) | Accepted |
| A-012 | F | Email 321 characters | Rejected client and server side |
| A-013 | F | Unicode and plus-addressed emails | Normalised consistently; `a+b@x.com` and `a+c@x.com` are distinct accounts |
| A-014 | X | Full keyboard traversal of the screen | Every control reachable, visible focus, logical order |
| A-015 | X | axe scan | Zero violations |
| A-016 | M | Screen reviewed against §A.9 copy rules | Passes |

## S1-B · Magic link

| ID | Type | Case | Expected |
|---|---|---|---|
| B-001 | F | Valid link clicked once | Session created, redirects to the project chooser |
| B-002 | F | Same link clicked twice | Second attempt fails with a clear message and a way to request another |
| B-003 | F | Link at 14m59s | Accepted |
| B-004 | F | Link at 15m01s | Rejected as expired, with a re-request action |
| B-005 | D | Token stored | Only the SHA-256 hash is in the database; a query for the plaintext returns nothing |
| B-006 | F | New link requested while one is outstanding | The earlier link is invalidated |
| B-007 | F | Link opened in a different browser | Confirmation prompt, not a failure |
| B-008 | F | Confirmation accepted | Session created; the confirmation is recorded on the session |
| B-009 | F | Confirmation declined | No session; the token is consumed |
| B-010 | S | 4th request in 15 minutes for one email | 429; response body identical for known and unknown addresses |
| B-011 | S | 11th request from one IP | 429 with backoff |
| B-012 | S | Token tampered by one character | Rejected; no timing signal distinguishes it from expiry |
| B-013 | S | Token from a link opened in a browser with no matching device nonce requires explicit confirmation | Rejected |
| B-014 | D | Two concurrent consumptions of one token | Exactly one succeeds (assert on the atomic update) |
| B-015 | F | Invite-bearing link accepted | Membership relationship written **at this moment**, not before |

## S1-C · Federated identity

| ID | Type | Case | Expected |
|---|---|---|---|
| C-001 | F | OIDC round trip with PKCE | Session created, `method` recorded as `oidc:{provider}` |
| C-002 | S | Callback with mismatched `state` | Rejected |
| C-003 | S | Callback with mismatched `nonce` | Rejected |
| C-004 | S | Authorization code replayed | Rejected |
| C-005 | F | Provider returns `email_verified: false` | Refused. No account created, no link made |
| C-006 | F | Same email via magic link then Google | One `user_account`, two `user_identity` rows |
| C-007 | F | Same email via Google then magic link | Same as C-006; order is irrelevant |
| C-008 | S | Two providers assert the same email, one unverified | Only the verified one links |
| C-009 | F | New user, no invite, JIT disabled | Refused with a clear "ask for an invitation" message |
| C-010 | F | New user with a pending invitation, first sign-in via a provider | Account created, invitation accepted, relationship written. **Domain capture and unsolicited JIT are Slice 2** |
| C-011 | S | Domain claimed but DNS TXT not verified | JIT refused |
| C-017 | F | Company with `sso_enforced`, member submits email | Redirected to the IdP; no link sent |
| C-018 | F | Company with `sso_enforced`: **non-member** submits an email at the same domain | Not redirected; the enforcement applies to members only |

## S1-D · Sessions

| ID | Type | Case | Expected |
|---|---|---|---|
| D-001 | F | Cookie attributes | `httpOnly`, `Secure`, `SameSite=Lax` |
| D-002 | S | Cookie contents | Opaque ID only; no claims, no JWT |
| D-003 | F | Idle 8h01m | Session rejected |
| D-004 | F | Activity at 7h59m then a request | Session extended |
| D-005 | F | Absolute 30 days despite activity | Session rejected |
| D-006 | F | Logout | Session revoked; the back button does not restore it |
| D-007 | F | Session list | Shows device, IP, last seen; current session marked and not self-revocable |
| D-008 | F | Revoking another session | That session's next request is rejected |
| D-009 | S | Session ID from another user replayed | Rejected |
| D-010 | F | Role change | Session ID rotates |
| D-011 | R | Redis restarted | Sessions invalid; users re-authenticate; no error page |

## S1-E · Companies: projects, membership

| ID | Type | Case | Expected |
|---|---|---|---|
| E-001 | F | Create a company | SpiceDB `company#admin@user` written; assert the tuple |
| E-002 | F | Create a project | `project#company@company` written |
| E-003 | A | Company admin opens a project with no direct grant | Resolves to `administer` via inheritance |
| E-004 | A | Remove a company admin | Access to every project under it is gone in one write |
| E-005 | A | Grant project operator | Can admit-adjacent actions; **cannot** set entitlements: 403 from the API, control absent from the UI |
| E-006 | A | Viewer requests unredacted arguments | 403 at the API, asserted at the API not the UI |
| E-007 | A | Non-member requests a project | **404**, not 403 |
| E-008 | A | Member of company A requests a project of company B | 404 |
| E-009 | F | Derivation panel for three users | Matches SpiceDB's own explanation exactly |
| E-010 | F | Invite created | No SpiceDB tuple exists while pending |
| E-011 | F | Invite accepted | Tuple written at acceptance |
| E-012 | F | Invite expired | Rejected with a re-request action |
| E-013 | F | Invite revoked before acceptance | Link no longer works |
| E-014 | F | Invite to an existing member | Rejected with a clear message |
| E-015 | D | Project switcher | Lists exactly what `LookupResources` returns, no more |
| E-016 | P | `LookupResources` across 200 projects | Under 100ms; timed assertion runs alone via `npm run test:performance`. Functional list equivalence stays in the main suite |


## S1-E2 · Creating a project and migrating industry

| ID | Type | Case | Expected |
|---|---|---|---|
| E2-001 | F | User administers exactly one company | Company pre-selected, shown read-only with a change affordance |
| E2-002 | F | User administers several | Selector listing only administrable companies |
| E2-003 | A | User administers none | Explanation and request-access action. **Never an empty form** |
| E2-004 | A | Company the user cannot administer | Absent from the selector; direct API call returns 403 |
| E2-005 | F | Industry selector | Each option shows inherited counts and example terms |
| E2-006 | F | Create without an industry | Rejected; industry is required |
| E2-007 | F | No industry fits | `General` pack offered |
| E2-008 | F | Duplicate project name in one company | Rejected inline |
| E2-009 | F | Same name in two different companies | Allowed |
| E2-010 | F | Create succeeds | SpiceDB `project#company` and `project#admin` written; assert both tuples |
| E2-011 | D | Inheritance after create | **By reference.** No vocabulary rows copied; assert the row count is unchanged |
| E2-012 | F | Republish the industry pack after create | Project sees the new terms without a migration |
| E2-013 | F | A new project with no sources *(needs item 3.11 demo sources)*| No demo source is connected automatically. The offer appears, nothing is provisioned |
| E2-014 | F | Demo source connected at create *(3.11 proves provisioning and shared connector; persisted undecided assertion needs 4.1)* | Provisioned, introspected, every element undecided. Same connector port as a customer source |
| E2-015 | F | Copy settings from another project *(needs item 3.x sources)* | Query, reference, evidence, alert settings copied |
| E2-016 | D | Copy settings | **Does not** copy entitlements, sources, pools or vocabulary overrides; assert each is empty *(needs item 5.1 pools)* |
| E2-017 | F | Region defaults from the company | Pre-filled, changeable at create |
| E2-018 | F | Region after create | Read-only everywhere; no API route mutates it |
| E2-019 | F | Create fails server-side | Entered values preserved; form does not reset |
| E2-020 | F | Landing after create | Project dashboard with three-step setup guidance |
| E2-021 | D | Audit entry | `ProjectCreated` recorded with actor, company, industry, region *(needs audit_entry, item 5.10)* |
| E2-022 | X | Create screen | Keyboard traversable, axe clean |
| E2-023 | A | Migrate industry as project admin only | 403, company admin is also required |
| E2-024 | F | Migrate dry run | Reports shadowed terms and, in Slice 1b, prompts in the last 30 days using terms unique to the old industry. **Protocols do not exist until Slice 3**, so nothing is reported about them |
| E2-025 | F | Migrate without typed confirmation | Rejected |
| E2-026 | D | After migration, entitlements *(needs entitlement, item 4.1)* | **Every entitlement unchanged**; assert row-by-row |
| E2-027 | D | After migration, sources, pools, keys (proved in item 5.1) | Unchanged |
| E2-028 | D | After migration, project-scope terms | Retained and still overriding |
| E2-031 | F | After migration, observation *(needs the observations register, Slice 3)* | Lists terms that no longer resolve |
| E2-032 | D | Historical evidence after migration *(needs evidence records, item 5.10)* | Still explains itself against its original vocabulary version |
| E2-033 | F | Prompt using an old-industry-only term after migration *(needs prompt mode, Slice 1b item 6.6)* | Refused and named; not silently mis-resolved |
| E2-034 | D | Vocabulary version | Bumped once; `effectiveVocabulary` invalidated for this project only |
| E2-035 | R | Migration fails mid-way | Rolled back; project fully on the old industry |

## S1-F · Data sources and connection

| ID | Type | Case | Expected |
|---|---|---|---|
| F-001 | F | Connect Postgres with a valid read-only role *(save and queue need item 3.12)* | Test passes, source saved, introspection queued |
| F-002 | F | Connect with wrong credentials | Test fails with a message naming the failure, source not saved |
| F-003 | F | Connect to an unreachable host | Fails with a timeout message inside 10s |
| F-004 | F | Connect a second Postgres source that receives landed spreadsheets *(needs item 3.12)* | Succeeds; landed tables catalogued like any other |
| F-005 | S | Credentials in an API response | Absent from every payload |
| F-006 | D | Credentials at rest | Vault reference only; a database scan finds no plaintext |
| F-007 | A | Member without `bind_source` connects *(needs the connect route, item 3.12)* | 403 |
| F-008 | F | Delete a source with entitlements *(needs entitlement, item 4.1)* | Confirmation names the dependent entitlements; typed confirmation required |
| F-009 | F | Two sources of different types in one project *(deferred until a second connector exists; not item 3.12)* | Both catalogue independently |
| F-010 | R | Source becomes unreachable after connection *(3.6 proves source status; query refusal deferred to 5.7)* | Status reflects it; queries refuse rather than serve stale |

## S1-G · Introspection and catalogue

| ID | Type | Case | Expected |
|---|---|---|---|
| G-001 | F | First introspection | Every table and column catalogued, all undecided |
| G-002 | P | 200 tables | Completes under 60s |
| G-003 | F | Re-run with no change | Empty diff |
| G-004 | F | Column added | Diff contains exactly one addition, undecided |
| G-005 | F | Column dropped | Marked removed; the entitlement is retained but inactive |
| G-006 | F | Column renamed, stable id available | Element id unchanged; entitlement carries; observation raised |
| G-007 | F | Column renamed, no stable id | Treated as removal plus addition; new element undecided |
| G-008 | F | Type widened within family (`varchar(50)`→`varchar(100)`) | Entitlement carries |
| G-009 | F | Type family changed (`integer`→`varchar`) | Item 3.6 records the type-family diff and required invalidation. Item 4.1 deletes the entitlement row after the diff is recorded, restoring undecided |
| G-010 | F | Table renamed | Objects re-map; exposed DuckDB name unchanged by default |
| G-011 | F | "Adopt renamed names" enabled | Name changes; labelled a breaking change |
| G-012 | D | Identifier requiring normalisation | Normalised name recorded once; identical across two runs |
| G-013 | F | Two identifiers colliding after normalisation | Suffix applied; observation raised |
| G-014 | S | `schema` mode payload | Contains no row data |
| G-015 | A | Sampling without consent | 403 from the sidecar |
| G-016 | F | Sampling with consent | Top values returned; call recorded in the audit log |
| G-017 | F | Introspection fails mid-run | State `failed` with a safe actionable reason preserved unchanged in the source response and UI; retry creates a new run on the same source, retaining history and the previous catalogue |
| G-018 | R | Introspection cancelled | Session released; no partial catalogue written |
| G-019 | P | Schema explorer with 5,000 elements | No dropped frames on scroll; measured in the isolated browser performance suite (`npm run test:visual:performance`) |
| G-020 | F | Empty schema | Purposeful empty state, not a blank table |

## S1-H · Entitlements and view compilation

| ID | Type | Case | Expected |
|---|---|---|---|
| H-001 | F | New element default | Undecided; counted in the undecided total |
| H-002 | F | Set `clear` | View recompiles under 2s; who and when recorded |
| H-003 | F | Set `withheld` | Column absent from the compiled DDL |
| H-004 | D | Undecided element | Absent from the compiled DDL |
| H-005 | F | Set `tokenized` | Column present, wrapped in the token function |
| H-006 | D | Same input tokenized in two sources | Identical output token |
| H-007 | F | Set `masked` | Mask applied per the configured form |
| H-008 | F | Set `aggregate_only` | Recorded as a constraint, not a view column |
| H-009 | F | Attempt to set an element back to undecided | Not offered; API rejects |
| H-010 | F | Bulk set 500 elements | Completes under 3s |
| H-011 | A | Bulk set to `clear` without justification | 400 |
| H-012 | F | Bulk set to `clear` with justification | Succeeds; justification in the audit log |
| H-013 | F | Pattern rule matches a newly discovered column | Treatment applied automatically; source recorded as `rule`, distinct from `user` |
| H-014 | F | Pattern rule and an existing entitlement conflict | Existing entitlement wins; rule does not overwrite |
| H-015 | A | Operator sets an entitlement | 403 |
| H-016 | P | Tree with 5,000 elements, 200 selected | Responsive |
| H-017 | F | Same element, two pools, different treatments | Both compile; neither affects the other |
| H-018 | D | View DDL for a pool | Contains exactly the entitled elements, no more |

## S1-I · Pools: keys, MCP

| ID | Type | Case | Expected |
|---|---|---|---|
| I-001 | F | Create a pool | Item 5.1: pool/key invariants, one current and one retiring key, grace boundary, tenant isolation. Item 5.2: generation and prefixed key shown once. Item 5.14: copy required to dismiss |
| I-002 | D | Key at rest | Item 5.1: schema stores only a 32-byte digest and partial display prefix, rejecting a plaintext pool credential. Item 5.2: hashing and plaintext irrecoverability |
| I-003 | F | Key shown a second time | Not possible through any route (item 5.2; deferred from 5.1) |
| I-004 | F | Agent connects with a valid key | Tools listed |
| I-005 | S | Agent connects with an invalid key | 401, no detail about which pool exists |
| I-006 | S | Agent connects with a revoked key | 401 |
| I-007 | F | `describe` | Entitled elements with post-treatment types; withheld marked; undecided absent |
| I-008 | D | `describe` type for a tokenized integer | `VARCHAR`, not the source type |
| I-009 | F | `SELECT *` on a table with a withheld column | Other columns returned; withheld named in the text content the model reads |
| I-010 | F | Query naming a withheld column | `element_withheld`, not a binder error |
| I-011 | F | Query naming an undecided column | `entitlement_missing` |
| I-012 | F | Query naming a non-existent column | Ordinary error, distinguishable from the two above |
| I-013 | F | Tools listed for a query-only pool | `ask` absent |
| I-014 | F | Pool mode changed | `tools/list_changed` emitted |
| I-015 | F | Key rotation with grace | Both keys valid; 20-agent pool serves with zero failures |
| I-016 | F | Grace expiry | Old key rejected; agents still on it are reported |
| I-017 | F | Immediate revoke | Confirmation names the agent count; typed confirmation |
| I-018 | F | Agent presence lifecycle | `connecting → active → idle → stale → disconnected` on SIGKILL |
| I-019 | D | Agent never silently removed | Disconnected agents remain visible |
| I-020 | F | Reconnect after stale | Same twin, reconnect count incremented |
| I-021 | D | `agent_id` absent from the request | Accepted; presence recorded as unverified. **Nothing is authorised on it** |
| I-022 | S | Agent claims another agent's `agent_id` | Accepted, and the test asserts that no authorization outcome differs |
| I-023 | C | MCP tool schemas | Contract tests pass in both directions |

## S1-J · Sidecar

| ID | Type | Case | Expected |
|---|---|---|---|
| J-001 | C | All five endpoints | Contract tests pass |
| J-002 | F | Introspect via sidecar vs direct connection | Identical catalogue |
| J-003 | S | `/validate` | Opens zero source connections |
| J-004 | S | Base catalog, fully qualified | Object not found |
| J-005 | S | Base catalog for a withheld column | Object not found |
| J-006 | S | `duckdb_databases()` / `duckdb_tables()` / `duckdb_columns()` | Only the pool's objects |
| J-007 | S | `information_schema.tables` / `.columns` | Only the pool's objects |
| J-008 | S | `duckdb_views()` or `SHOW CREATE` | Refused, or bodies redacted |
| J-009 | S | Base reference in a CTE, subquery or `UNION` | Object not found |
| J-010 | S | Base reference in a prepared statement or macro | Refused at parse |
| J-011 | S | Quoted or case-varied identifier | Object not found |
| J-012 | S | `ATTACH` of an already-attached source | `sql_not_permitted` |
| J-013 | S | `SET search_path` toward a base catalog | Refused |
| J-014 | S | `SET enable_external_access = true` | Fails after `lock_configuration` |
| J-015 | S | `COPY … TO` | `sql_not_permitted` |
| J-016 | S | `read_csv`, `read_parquet`, `httpfs` | `sql_not_permitted` |
| J-017 | S | `INSTALL` / `LOAD` | `sql_not_permitted` |
| J-018 | S | `INSERT` / `UPDATE` / `DELETE` / `CREATE` | `sql_not_permitted` |
| J-019 | D | 100k sentinel rows, then scan disk and mapped memory | Zero matches |
| J-020 | R | Memory limit exceeded | Fails; does **not** spill to disk |
| J-021 | R | Query exceeds timeout | Cancelled; session released; source connections closed within 2s |
| J-022 | R | Sidecar killed mid-query | No partial data anywhere; workspace reported degraded |
| J-023 | R | Sidecar unreachable | API fails closed |
| J-024 | S | Row values in logs or traces | Absent (assert against the allowlist) |
| J-025 | P | Concurrency ceiling reached | Queued to the bound, then refused, never unbounded |
| J-026 | F | Row limit exceeded | `truncated: true` returned, not a silent cut |

## S1-K · Query mode: end to end

| ID | Type | Case | Expected |
|---|---|---|---|
| K-001 | F | Simple select through the pool view | Correct rows, treatments applied |
| K-002 | F | Cross-source join, two connectors | Correct result; both sources touched |
| K-003 | D | Join on a tokenized key across sources | Join holds; no real identifier released |
| K-004 | F | Aggregate over an `aggregate_only` element | Allowed |
| K-005 | F | Row-level select of an `aggregate_only` element | Refused |
| K-006 | F | `GROUP BY` producing groups below the minimum size | Refused |
| K-007 | P | Simple query end to end | Under 2s |
| K-008 | P | Cross-source join | Under 15s |
| K-009 | R | One source unreachable mid-query | Refused, not partially answered |

## S1-L · Prompt mode (lite)

| ID | Type | Case | Expected |
|---|---|---|---|
| L-001 | F | Known metric, known parameters | Correct answer; CIL recorded |
| L-002 | D | Same prompt, same vocabulary version, 10 runs | Identical CIL every time |
| L-003 | F | Metric expressed as a known synonym | Normalises to the canonical name |
| L-004 | F | Unknown metric | Preserved verbatim, marked unknown, never guessed |
| L-005 | F | Malformed CIL returned by the model | Refusal, not a repair or a partial answer |
| L-006 | F | Parameter value with a typo | Clarification offering real values with real frequencies |
| L-007 | D | Clarification options | Every option exists in `top_values`; none invented |
| L-008 | F | Clarification answered | Pipeline resumes and completes |
| L-009 | R | Clarification answered after an API restart | Resumes correctly |
| L-010 | F | Clarification abandoned past its TTL | Expires cleanly; no orphaned run |
| L-011 | F | Parameter matching nothing | Available values passed downstream; nothing invented |
| L-012 | F | Term with no mapping | Refused, named, and the rest of the question answered |
| L-013 | F | Measure without a grain rule | **Composition refused**, not warned |
| L-014 | F | Ambiguous source, two candidates | Clarification naming both |
| L-015 | F | Two equal-standing join paths | Refused, both named |
| L-016 | F | No join path | `sources_cannot_be_joined` |
| L-017 | F | QQC L1, query references a source outside the plan | Blocked; scope violation recorded |
| L-018 | F | QQC L2, estimate above the threshold | Confirmation required; does not execute without it |
| L-019 | F | QQC L3, semantically wrong SQL | Returned for rewrite |
| L-020 | F | Prompt requesting a withheld element | Refused, element named |
| L-021 | D | Evidence record for a prompt | Contains CIL, source plan, SQL, verdicts, vocabulary version |
| L-022 | F | New project, inherited vocabulary only | Answers a question on day one |
| L-023 | F | Synonym edited | Re-embeds under 5s; affected phrasing now classifies |
| L-024 | P | Prompt end to end | Under 15s |

## S1-M · Evidence and Activity

| ID | Type | Case | Expected |
|---|---|---|---|
| M-001 | D | One request | Exactly one record |
| M-002 | D | Record contents | Every element and its treatment, including withheld |
| M-003 | S | Application role attempts UPDATE on a record | Denied at the grant level |
| M-004 | S | Application role attempts DELETE | Denied at the grant level |
| M-005 | D | Two identical requests a minute apart | Same policy version |
| M-006 | D | Entitlement changed between requests | Different policy versions |
| M-007 | P | Filter 1M records by pool and range | Under 500ms |
| M-008 | P | Export 100k records | Streams without exhausting memory |
| M-009 | F | Export respects filters | Only matching records present |
| M-010 | D | Runs touching a demo source, in an export | Absent. `synthetic` is derived from the sources reached, never from a project flag |
| M-011 | F | Record for a refused request | Present, with the reason |
| M-012 | F | Record for a partially reduced response | Names what was withheld and why |
| M-013 | A | Viewer opens a record | No unredacted arguments |
| M-014 | D | Redaction set to aggressive | Arguments redacted per policy |
| M-015 | P | Activity list, 1M records | Virtualised, no frame drops |

## S1-N · Workbench

| ID | Type | Case | Expected |
|---|---|---|---|
| N-001 | F | Run a question | Result and full trace |
| N-002 | F | Stage rail during a run | Stages advance; elapsed counter runs; **no bare spinner at any point** |
| N-003 | F | Dry run | Plans and stops; states nothing was read |
| N-004 | F | Clarification | Rendered inline as selectable real options |
| N-005 | F | ⌘/Ctrl+Enter | Runs |
| N-006 | F | Trace contents | Match the stored record exactly, field by field |
| N-007 | F | Copy on a code block | Copies and confirms |
| N-008 | A | Member without `simulate` | Screen not reachable |
| N-009 | X | Keyboard traversal | Every control reachable, focus visible |
| N-010 | X | axe scan | Zero violations |
| N-011 | F | Failed run | Error state naming what happened and the fix |

## S1-O · UI states: design system, accessibility

| ID | Type | Case | Expected |
|---|---|---|---|
| O-001 | F | Loading state | Matches the reference implementation's pattern for that surface: a stage rail with an elapsed counter where work is staged, a purposeful empty state otherwise. Never a bare spinner |
| O-002 | F | Every screen, empty | Purposeful empty state with a next action |
| O-003 | F | Every screen, error | States what happened and the fix, with retry |
| O-004 | F | Every screen, ready | Renders |
| O-005 | X | axe on every screen | Zero violations |
| O-006 | X | Every treatment badge | Dot **and** text label |
| O-007 | X | Colour-blindness simulation, six treatments | All distinguishable |
| O-008 | X | `prefers-reduced-motion` | Every transition disabled |
| O-009 | F | Visual snapshots, three viewports | Match baseline |
| O-010 | D | Grep for raw hex in `src/screens`, `src/features` | Zero |
| O-011 | D | Grep for arbitrary Tailwind values | Zero; ESLint fails the build if introduced |
| O-012 | F | Optimistic mutation fails | Rolls back with a toast |
| O-013 | F | SSE disconnects | Banner distinguishes "dashboard disconnected" from "agents down" |
| O-014 | M | Copy reviewed against §A.9.4 | Passes |

## S1-Q · Settings and configuration

Every setting in C.4 has a case. A setting with no case is a coverage gap.

| ID | Type | Case | Expected |
|---|---|---|---|
| Q-001 | F | Personal: name, timezone, date format, reduced motion | Persist; timestamps across the app re-render in the new zone |
| Q-002 | F | Personal: reduced motion on | Overrides the OS media query; all transitions disabled |
| Q-003 | F | Personal: email field | Read-only, with an explanation |
| Q-004 | F | Notifications: each of six toggles | Persist per project; delivery matches |
| Q-005 | F | Digest day and hour | Sent in the user's timezone, once |
| Q-006 | A | Viewer opens project settings | Read-only, not hidden. Controls disabled with an explanation |
| Q-007 | F | Project details: rename | Persists; appears on the next export |
| Q-008 | F | Project details: region | Read-only; no API route mutates it |
| Q-009 | F | Project details: industry | Read-only with a Migrate action; never an inline select |
| Q-010 | F | Discovery: schedule off / hourly / daily / weekly | Job scheduled accordingly; next-run time shown |
| Q-011 | F | Discovery: new elements = hold | Newly discovered elements are undecided |
| Q-012 | F | Discovery: new elements = apply rules only | Rule-matched elements set; unmatched stay undecided |
| Q-013 | F | Discovery: type-family change = revert | Element reverts; observation raised |
| Q-014 | F | Discovery: type-family change = carry over | Entitlement retained; observation still raised |
| Q-015 | F | Discovery: rename = treat as new | Element becomes undecided |
| Q-016 | F | Discovery: adopt renamed names on | DuckDB name changes; labelled a breaking change; agents referencing the old name fail clearly |
| Q-017 | F | Discovery: sampling off | `/sample` returns 403 even with per-source consent |
| Q-018 | F | Query: timeout | Enforced at the sidecar; a longer query is cancelled |
| Q-019 | F | Query: row limit | `truncated: true` returned, never a silent cut |
| Q-020 | F | Query: daily row budget per pool | Refusal on exceed, naming the budget |
| Q-021 | F | Query: cardinality confirmation threshold | Above it, confirmation required |
| Q-022 | F | Query: aggregate minimum group size | Groups below it refused |
| Q-023 | F | Query: memory limit | Enforced; fails rather than spills |
| Q-024 | F | Query: concurrency per pool | Queued to the bound, then refused |
| Q-025 | F | Evidence: retention tiers | Records aged out on schedule; rollups retained |
| Q-026 | F | Evidence: redaction aggressive / allowlist / none | Applied to stored arguments; assert at rest |
| Q-027 | F | Evidence: capture sampling below 100% | Errors still captured at 100%; sampling rate stated in the UI |
| Q-028 | F | Alerts: each rule type | Fires on its trigger only |
| Q-029 | F | Alerts: cooldown | One delivery per cooldown per rule |
| Q-030 | F | Alerts: webhook with a bad URL | Validation on save; delivery failure surfaced, retried with backoff |
| Q-031 | F | Company: default industry and region | Applied as defaults on the create-project form |
| Q-032 | F | Company: allowed email domains | Invites outside the list rejected |
| Q-033 | F | Company: idle timeout changed | Applies to sessions created after the change |
| Q-034 | F | Company: enforce two-step for admins | Admin without it is prompted at next sign-in |
| Q-035 | A | Company settings by a company member, not admin | Read-only |
| Q-036 | D | Every setting write | Audit entry with actor, before and after |
| Q-037 | R | Setting changed while a query is in flight | In-flight query uses the value in force at start; recorded on the record |
| Q-038 | X | Every settings page | Keyboard traversable, axe clean, three viewports |

## S1-R · Catalogue: rules, and derived read models

Entities whose behaviour is not covered by the flows above.

| ID | Type | Case | Expected |
|---|---|---|---|
| R-001 | F | `catalogElement` fetched by prefix | Only that subtree returned; never the whole catalogue |
| R-002 | P | `catalogElement` list, 50k elements | Paginated; no unbounded response |
| R-003 | D | `catalogElement.duckdbName` | Stable across two introspections; recorded at first discovery |
| R-004 | F | `patternRule` created | Applies only to elements discovered after it |
| R-005 | F | `patternRule` priority | Highest priority wins on multiple matches |
| R-006 | F | `patternRule` deleted | Existing entitlements it set are retained |
| R-007 | D | `patternRule` provenance | Entitlements it sets record `source: rule`, distinct from `user` |
| R-008 | F | `subject` with aliases | Each alias classifies to the canonical subject |
| R-009 | F | `operation` result shape | Drives the result renderer; a mismatch is a defect |
| R-010 | D | `sotCoverage` | Recomputed on entry change; matches an independent count |
| R-011 | D | `knowledgeStats.fastLaneCoverage` | Matches an independent count over the same window |
| R-012 | D | `runStage` | One row per stage per run, in order, with timings |
| R-013 | F | `runStage` for a refused run | Records the stage that refused and why |
| R-014 | D | `qqcResult` | One row per run that reached QQC; all three levels present |
| R-015 | D | `auditEntry` ordering | Matches SpiceDB revision order for access changes |
| R-016 | S | `auditEntry` written by a non-privileged path | Impossible; only the service role inserts |
| R-017 | D | `releaseFetch` | One row per fetch attempt including refusals, with both gate results |
| R-018 | D | `industryVocabulary` republished | `effectiveVocabulary` invalidated for every project in that industry, by version bump |
| R-019 | F | `verticalFragment` promoted from a project | Appears in every project in that industry without a migration |
| R-020 | F | `verticalProtocol` promoted | Same; and matching intents move to the Fast Lane |
| R-021 | D | `effectiveVocabulary` merge | Project term shadows the inherited one; `scope` field correct on every term |
| R-022 | D | `undeclaredJoin` | Derived from run history; disappears once declared |
| R-023 | F | `introspectionRun` state machine | Every legal transition succeeds; every illegal one is rejected |
| R-024 | F | `synonymCandidate` rejected | Does not reappear on the next identical expression |

## S1-S · Client data layer

| ID | Type | Case | Expected |
|---|---|---|---|
| S-001 | D | Every query key | Produced by its entity's key factory; ESLint blocks array literals |
| S-002 | F | Project switch | All keys prefixed with the old project removed in one operation |
| S-003 | D | Immutable entities (`run`, `runStage`, `qqcResult`, `auditEntry`, `releaseFetch`) | Never refetched once cached |
| S-004 | F | Every mutation in the invalidation matrix | Invalidates exactly the listed keys, no more and no fewer |
| S-005 | F | Optimistic mutation succeeds | No flicker, no refetch of unchanged data |
| S-006 | F | Optimistic mutation fails | Rolls back; toast names what failed |
| S-007 | D | Forbidden-optimistic mutations | Show pending and wait; assert no optimistic path exists |
| S-008 | F | SSE high-frequency delta | Written with `setQueryData`; no refetch |
| S-009 | F | SSE structural change | Invalidates; Query refetches once, not per event |
| S-010 | R | SSE reconnect with a small gap | Fresh snapshot names query-key families to refetch; `Last-Event-ID` does not replay missed deltas|
| S-011 | R | SSE reconnect with a large gap | Fresh snapshot forced |
| S-012 | D | No duplicate server state in Zustand | Assert by inspection and by a lint rule on store shapes |

## S1-T · Retrieval layer

| ID | Type | Case | Expected |
|---|---|---|---|
| T-001 | F | Metric recovery, one dominant match | Auto-resolved; synonym candidate written; quality warning added |
| T-002 | F | Recovery, two close candidates | Clarification naming both |
| T-003 | F | Recovery, nothing above the floor | Unresolved; passed downstream as unknown with hints. **Never guessed** |
| T-004 | D | Recovery boundary, similarity exactly 0.85 | Not auto-resolved; strictly greater than required |
| T-005 | D | Recovery boundary, gap exactly 0.15 | Not auto-resolved |
| T-006 | D | Recovery scope | Only this industry and project; another industry's metrics never returned |
| T-007 | S | Recovery cross-tenant | A project never retrieves another project's embeddings; assert on the filter |
| T-008 | F | Thresholds changed in configuration | New values take effect without a deploy and appear in the trace |
| T-009 | F | Fragment pre-loading | One query per CIL component; results grouped by component, not flattened |
| T-010 | F | Unresolved parameter | Not embedded until clarified |
| T-011 | D | Content hash unchanged on save | No re-embedding job enqueued |
| T-012 | F | Synonym edited | Re-embeds within 5s; status visible in the UI during it |
| T-013 | F | Metric formula edited | Re-embeds |
| T-014 | F | Industry pack republished | Every affected embedding re-embedded; project overrides untouched |
| T-015 | D | Duplicate re-embed triggers | Collapse to one job on `(owner_type, owner_id, model)` |
| T-016 | D | Mixed models in the table | A retrieval filters to one model; assert no cross-model comparison |
| T-017 | F | Model upgrade backfill | New rows written alongside old; active model flipped per industry only on completion |
| T-018 | F | Rollback after a model flip | Old rows still present; flipping back restores prior behaviour |
| T-019 | D | Old-model rows | Deleted only after 30 days on the new model |
| T-020 | R | Embedding provider unavailable | Retrieval returns empty with a distinct code; classification proceeds; metric reported unknown. **No silent degradation** |
| T-021 | P | Metric recovery | p95 under 30ms |
| T-022 | P | Fragment pre-loading, five components | p95 under 80ms |
| T-023 | P | Retrieval with 50k vectors in one industry | Within budget |
| T-024 | D | Vector sent to the client | Never; assert on every payload |
| T-025 | D | `content` stored | Reproduces the exact embedded input |
| T-026 | R | Full rebuild from `content` | Completes and is timed; results match the originals |
| T-027 | D | Embedding calls metered | Counted per project alongside LLM tokens |

## S1-U · Clarification policy

| ID | Type | Case | Expected |
|---|---|---|---|
| CLR-01 | Pool set to `refuse`, ambiguous prompt | Immediate `clarification_required` naming every ambiguity |
| CLR-02 | Pool set to `pause`, ambiguous prompt | Durable pause, resumable |
| CLR-03 | Three ambiguities in one prompt | **One** clarification with three items |
| CLR-04 | Save as default accepted | Registry or term written; the identical prompt does not ask again |
| CLR-05 | Policy recorded | Every run states which policy applied |
| CLR-06 | Readiness after declaring | The concept moves from ambiguous to declared |
| CLR-07 | Export | Contains every term with its readiness state |
| CLR-08 | Discovery question coverage | Reports asked, clarified, and unresolved counts |

## S1-V · Spreadsheet ingest

Landing happens inside the customer's environment and writes to their Postgres. From that point a landed table is an ordinary source and every other test area applies to it unchanged.

| ID | Type | Case | Expected |
|---|---|---|---|
| ING-01 | F | A file arrives in the landing zone | Detected, registered, processing starts |
| ING-02 | F | Filing party identified from filename/folder and verified against declared content | Item 3.7 attributes; item 3.8 verifies. A mismatch quarantines naming both; content never creates attribution |
| ING-03 | F | Period identified | Correct period, recorded |
| ING-04 | F | Premium versus claims bordereau distinguished | Correct kind |
| ING-05 | F | A file for a period already filed | Recognised as a restatement, not a duplicate |
| ING-06 | F | An exact byte-identical re-delivery | Recognised as a duplicate, not landed twice |
| ING-07 | R | Two files arrive simultaneously | Item 3.7 proves concurrent detection and registration. Both land, no interleaving and no partial table are deferred to item 3.9 |
| ING-08 | **S** | **A file that cannot be attributed to a filing party** | **Quarantined with a reason. Never guessed, never landed** |
| ING-09 | F | Declared header row is not the first row | Correct declared row and headers used; no inference |
| ING-10 | F | Merged header and data cells | Merged header quarantines; merged data repeats the anchor value deterministically |
| ING-11 | F | Twelve sheets, one declared | Exact declared sheet selected, choice recorded; an absent sheet quarantines |
| ING-12 | F | Mixed types within a column | Item 3.8 emits the entire column as TEXT preserving values; item 3.9 lands it as text, never silently coerced |
| ING-13 | F | Fully empty row and trailing notes below the data | Extraction stops at the first fully empty row; notes are absent from the rows handed to item 3.9 |
| ING-14 | F | A column with no header | Landed under a generated stable name |
| ING-15 | F | Duplicate headers in one sheet | Suffixed deterministically, both retained |
| ING-16 | R | Malformed file inside a batch | Fails alone. The batch continues |
| ING-17 | R | Very large file | Streams, does not exhaust memory |
| ING-18 | D | Numeric and date parsing | Locale handled explicitly, never guessed from the machine |
| ING-19 | F | `append_as_at` lands a first filing | One table, rows carry filing id and as-at date |
| ING-20 | F | `append_as_at` lands a restatement | Both versions present and queryable |
| ING-21 | F | `table_per_filing` lands a first filing | One table named for the filing |
| ING-22 | F | `table_per_filing` lands a restatement | Separate table, prior untouched |
| ING-23 | D | Strategy recorded on the source | Present and immutable after the first filing |
| ING-24 | D | Strategy stamped on every evidence record | Present on runs touching that source. Persisted evidence assertion belongs to item 5.11; item 3.9 records the source strategy |
| ING-25 | F | No strategy chosen at connection | Connection refused. There is no default |
| ING-26 | **S** | **A restatement under either strategy** | **Visibly a restatement. A reserve that moved is traceable to the filing that moved it** |
| ING-27 | F | Filing register after several filings | What arrived, from whom, when, strategy, what it superseded. Item 3.13 shows landed filings in expandable source rows, newest first, with supersession visible |
| ING-28 | F | Register reconciled against the landing zone | Every file accounted for, including quarantined ones |
| ING-29 | F | Quarantined file appears in the register | With its reason locally and category in the application, and a route to resolve it. Item 3.13 surfaces quarantines in Dashboard and Observations with local inspection/retry instructions; never inside a source |
| ING-30 | D | Landed columns after introspection *(3.10 proves ordinary catalogue handoff; persisted undecided assertion needs entitlement, item 4.1)* | Every one undecided, exactly as a native table |
| ING-31 | S | Files leaving the customer environment | Never. Asserted on the sidecar's egress |
| ING-32 | D | File contents in logs or traces | Never. Asserted against the field allowlist |
| ING-33 | F | A filing party header mapped to a term *(1b)* | Resolves in prompt mode like any column |
| ING-34 | F | An unmapped header *(1b)* | Refused and named. Never guessed |
| ING-35 | F | Two filing parties, different headers, one term *(1b)* | Both resolve, aggregate correctly |
| ING-36 | D | A question answered from a landed bordereau *(1b)* | Same pipeline, same record shape, same trace as a native table |

**ING-08 and ING-26 are the two that matter most.** A bordereau attributed to the wrong filing party is worse than one that did not land, and a reserve that moved silently is a wrong number nobody can trace.

## S1-P · Pilot acceptance (the customer-facing criteria)

| ID | Type | Case | Expected |
|---|---|---|---|
| P-001 | F | Pick five random requests from the last two weeks | Full record produced for each in under a minute |
| P-002 | F | Column added in week 4 without telling the agent team | Does not appear in any agent response |
| P-003 | F | Withheld field requested by SQL and by prompt | Both refused; both in the record |
| P-004 | M | Customer engineer configures their own agent from the docs | Succeeds without vendor code |
| P-005 | M | Sponsor's judgement on entitlement effort | Recorded in writing |
| P-006 | P | Agent queries against a production-like source | DBA judgement plus recorded query cost |
| P-007 | F | Revoke a pool key | Next request refused; visible in the log |

---

# SLICE 2: ENTERPRISE

## S2-A · SAML, SCIM and lifecycle

SAML is Slice 2. These cases were previously and incorrectly listed under Slice 1.

| ID | Type | Case | Expected |
|---|---|---|---|
| C-012 | F | SAML assertion, signed, valid | Session created |
| C-013 | S | SAML assertion with an invalid signature | Rejected |
| C-014 | S | SAML assertion replayed | Rejected by the replay cache |
| C-015 | S | IdP-initiated SAML without `InResponseTo` | Rejected unless explicitly enabled |
| C-016 | S | SAML assertion past `NotOnOrAfter` | Rejected |



| ID | Type | Case | Expected |
|---|---|---|---|
| SA-001 | C | SCIM Users CRUD | Conformance suite passes |
| SA-002 | C | SCIM Groups CRUD | Conformance suite passes |
| SA-003 | F | User deprovisioned at the IdP | Sessions revoked within 60s; SpiceDB relationships removed |
| SA-004 | F | User reprovisioned | Access restored; prior evidence still attributed correctly |
| SA-005 | F | Group mapped to a project role | Membership follows group changes |
| SA-006 | S | SCIM token from another company | 401 |
| SA-007 | F | SCIM and manual invite for the same person | One account; no duplicate |
| SA-008 | F | `sso_enforced` turned on with active magic-link sessions | Sessions invalidated; next sign-in routes to the IdP |

## S2-B · Availability and degraded mode

| ID | Type | Case | Expected |
|---|---|---|---|
| SB-001 | R | Postgres primary fails | Failover inside the stated RTO; no data loss |
| SB-002 | R | SpiceDB unavailable | Serve from the cached snapshot within the staleness ceiling |
| SB-003 | R | SpiceDB unavailable past the ceiling | **Refuse.** Fail closed |
| SB-004 | D | Staleness recorded | Every record made in degraded mode states the snapshot age |
| SB-005 | R | Redis unavailable | Sessions invalid; queries refuse; a clear banner, not an error page |
| SB-006 | R | One sidecar of a fleet unhealthy | Traffic routed away; workspace unaffected |
| SB-007 | R | All sidecars unhealthy | Workspace degraded; agents receive `source_unavailable` |
| SB-008 | R | Zone failure | Service continues; alarm raised |
| SB-009 | P | Sustained load at the SLA ceiling | Latency budgets held; error budget consumption measured |
| SB-010 | R | Rolling deploy under load | Zero failed agent requests |

## S2-C · Residency and metering

| ID | Type | Case | Expected |
|---|---|---|---|
| SC-001 | D | Project in `eu-west-1` | Every evidence record stored in region; assert at the storage layer |
| SC-002 | D | Cross-region read attempt | Refused |
| SC-003 | F | Export from a regional project | Served from that region |
| SC-004 | D | Metering counts | Tokens, embeddings, queries, rows released, evidence bytes, per project per day |
| SC-005 | F | Plan ceiling reached | Graceful refusal naming the ceiling; not a silent stop |
| SC-006 | F | Ceiling raised | Service resumes without a restart |
| SC-007 | D | Metering vs provider billing | Within 2% over a 7-day window |
| SC-008 | S | Metering tampering via the API | Not possible; counters are server-derived |

## S2-D · On-premises sidecar

| ID | Type | Case | Expected |
|---|---|---|---|
| SD-001 | F | Outbound-only connection established | API dispatches work; no inbound rule required |
| SD-002 | R | Connection dropped | Re-established with backoff; in-flight work fails cleanly |
| SD-003 | S | Signed binary verification | Signature checked before execution |
| SD-004 | F | Upgrade | Rolls forward; rollback tested |
| SD-005 | S | Sidecar egress | Only to declared source hosts |
| SD-006 | D | Customer holds credentials | Opintel never receives them; assert on the payloads |
| SD-007 | M | Deployment guide followed by someone unfamiliar | Working sidecar without vendor assistance |

## S2-E · Additional connectors

Each new connector repeats **F-001…F-010**, **G-001…G-020**, **J-002**, and **K-002** against its own fixture, plus:

| ID | Type | Case | Expected |
|---|---|---|---|
| SE-001 | F | Type mapping | Every source type maps to a documented DuckDB type or is marked unsupported |
| SE-002 | F | Schemaless source | Inferred field paths catalogued; incompleteness disclosed in the UI |
| SE-003 | F | Source without a schema level | Synthesised schema applied; names remain three-part |
| SE-004 | P | Pushdown | Predicates pushed where supported; `unsupported_pushdown` returned where not |

---

# SLICE 3: COMPOUNDING

## S3-A · Source of Truth Registry

| ID | Type | Case | Expected |
|---|---|---|---|
| TA-001 | F | Concept with a registry entry | Never falls through to matching; assert no matching call is made |
| TA-002 | F | Concept without an entry, one clear candidate | Used, and noted as inferred |
| TA-003 | F | Concept with several candidates | Clarification naming them |
| TA-004 | F | Clarification accepted with "save as default" | Registry entry written; next identical query does not ask |
| TA-005 | D | Coverage figure | Matches an independent count of entries over queried concepts |
| TA-006 | F | Conflicting entries for one concept | Prevented by the partial unique index |
| TA-007 | F | Entry deactivated | Resolution falls back to matching, and says so |

## S3-B · Relationships

| ID | Type | Case | Expected |
|---|---|---|---|
| TB-001 | F | Declared join | Used before any inference |
| TB-002 | F | Foreign key present, no declaration | Used, and reported as inferred |
| TB-003 | F | Column-name match only | Used, reported as inferred, and surfaced for declaration |
| TB-004 | F | Two equal-standing paths | Refused; both named |
| TB-005 | F | Many-to-many | Fan-out mitigated **and** stated on the record |
| TB-006 | F | Undeclared pair used twice | Appears in the undeclared list |
| TB-007 | F | Pair declared from that list | Disappears from it; used thereafter |

## S3-C · Fragments: lanes, QQC

| ID | Type | Case | Expected |
|---|---|---|---|
| TC-001 | D | Protocol match | **Zero LLM calls**; assert on the PAL call counter |
| TC-002 | P | Fast Lane end to end | Under 2s |
| TC-003 | P | Slow Lane, four fragments | Under 15s |
| TC-004 | F | Composition agent attempts to override the source plan | Prevented |
| TC-005 | F | Composition agent reaches outside the plan | Prevented; scope violation recorded |
| TC-006 | F | Fragment pre-link from the metric catalogue | Used without a similarity search |
| TC-007 | F | Recurring intent above the threshold | Protocol candidate created |
| TC-008 | F | Candidate promoted | Next identical question runs on the Fast Lane |
| TC-009 | D | No auto-promotion path exists | Assert by code search and by test |
| TC-010 | F | Fragment extracted from a fallback | Candidate created for review |
| TC-011 | F | Cross-project pattern above the threshold | Promotion candidate created |
| TC-012 | A | Non-admin promotes | 403 |
| TC-013 | F | Fast Lane coverage figure | Matches an independent count over the window |

## S3-D · Observations: dashboard, audit

| ID | Type | Case | Expected |
|---|---|---|---|
| TD-001 | F | Column added | "Awaiting a decision" observation within one cycle |
| TD-002 | F | Observation workflow | `open → acknowledged → resolved`; history retained |
| TD-003 | F | Flapping condition | One observation, not fifty; dedupe and cooldown asserted |
| TD-004 | F | Each of the nine observation types | Fires on its trigger, and only on it |
| TD-005 | D | Access change | In the audit log in write order, matching the SpiceDB revision |
| TD-006 | S | Audit log UPDATE or DELETE by the application role | Denied at the grant level |
| TD-007 | F | Dashboard when nothing needs attention | Visibly calm and empty |
| TD-008 | D | Since-last-visit delta across two sessions | Correct |
| TD-009 | F | Alert rule fires | Delivered once per cooldown to every configured channel |
| TD-010 | F | Webhook endpoint down | Retried with backoff; failure surfaced |

## S3-D · Industry migration, Slice 3 additions

Protocols and fragments do not exist before Slice 3, so these cases are not runnable in Slice 1.

| ID | Type | Case | Expected |
|---|---|---|---|
| E2-029 | F | After migration, orphaned protocols | Deactivated, never deleted |
| E2-030 | F | After migration, orphaned fragments | Deactivated, never deleted |

## S3-E · Demo sources and evaluation

| ID | Type | Case | Expected |
|---|---|---|---|
| TE-001 | F | New project with demo sources | Seeded deterministically; checksum matches |
| TE-002 | F | Reset | Restores the seed exactly; checksum matches |
| TE-003 | F | Each scenario trigger | Produces its documented effect on the documented screen |
| TE-005 | F | Demo source reconnected after deletion | Provisioned again from the industry pack; seed restored |
| TE-006 | D | Evidence from a demo source | Marked synthetic, derived from the sources reached; never in an export |
| TE-007 | F | Own agent connected to a pool bound only to demo sources | Real MCP endpoint, generated data |

## S3-F · Key-policy release

| ID | Type | Case | Expected |
|---|---|---|---|
| TF-001 | F | Element set `by reference` | Pointers returned; the agent is told so in the text content |
| TF-002 | D | Reference resolves | To the **treated** value, a tokenized email resolves to the token |
| TF-003 | S | Gate 1 failure | **Zero provider calls** |
| TF-004 | F | Release revoked | Next fetch refused; other releases of the element untouched |
| TF-005 | F | Agent revoked | Fan-out across exactly its live locators; count matches the index |
| TF-006 | R | Provider unreachable during revoke | `revoke_pending`; Gate 1 refuses locally meanwhile |
| TF-007 | F | TTL expired, provider would still release | Refused locally |
| TF-008 | F | Retry after a provider outage | Does not consume the budget |
| TF-009 | F | Budget crossed, observe mode | Observation raised; not refused |
| TF-010 | F | Budget crossed, hard cap | Refused |
| TF-011 | D | Settings resolution | Most restrictive wins; an element override cannot loosen a pool setting |
| TF-012 | F | Reconciliation, injected mismatch both directions | Both detected |
| TF-013 | F | Sealed mode revocation | Reaches a payload fetched but not opened |
| TF-014 | F | Mediated mode revocation | Does not reach it; recorded correctly |
| TF-015 | C | Provider contract | Nightly test passes; all others run against the local adapter |
| TF-016 | D | Alias identifier format | `agent:{project}:{agent}`. **Never a pool identifier**; assert on the recipient sent |
| TF-017 | D | Recipients per packet | Individual aliases, never a group; assert on the payload |
| TF-018 | F | Sub-hour TTL with an hour-granularity provider | Gate 1 refuses at the real TTL; provider expiry set to the ceiling |
| TF-019 | F | `DELETE_ON_RECEIPT` | Sent false; Opintel counts redemptions against the retry allowance |
| TF-020 | F | Three by-reference elements in one response | Three packets issued concurrently; latency within budget |
| TF-021 | R | Provider rate limit hit on issue | Backoff; the by-reference elements are refused, the rest of the response is returned |
| TF-022 | D | Custodian identity lifecycle | Created on first issuance, disabled on retirement; assert both calls |
| TF-023 | D | Provider swapped for the local adapter | Every T11 case passes unchanged; no use case imports the provider |

---

## Appendix A: exit gates

A slice ships when **all** of the following hold:

| Gate | Requirement |
|---|---|
| Functional | 100% of that slice's cases pass |
| Traceability | Every normative requirement maps to at least one passing case; the matrix is generated, not maintained by hand |
| Security | Every `S` case passes. A failing `S` case blocks release regardless of severity assessment |
| Performance | Every `P` budget met under k6 at the stated concurrency |
| Accessibility | Zero axe violations across every screen at three viewports |
| Resilience | Every `R` case passes in a chaos run against a production-shaped environment |
| Contract | Consumer and provider verification pass for MCP and the sidecar |
| Manual | Every `M` case reviewed and signed off by a named person |
| Regression | All prior slices' suites still pass |

**On coverage claims.** The suite above covers every requirement written down. It does not cover requirements nobody wrote, which is the usual source of production defects. Every defect found outside this suite is added to it in the same pull request as its fix, and the requirement it implies is written into Parts A–D at the same time.

---

## Appendix B: Traceability matrix

Coverage is only meaningful if it is checkable. This matrix maps every entity and every screen to the cases that exercise it. **A row with no test IDs is a coverage gap and blocks the slice.**

Generated from test metadata at CI time, not maintained by hand. The table below is the expected output.

### Entities → cases

| Entity | Cases |
|---|---|
| `industry` | E2-005, E2-006, E2-007, E2-023…E2-035, R-018 |
| `industryVocabulary` | E2-011, E2-012, R-018, R-021, L-022 |
| `verticalFragment` | R-019, TC-006, TC-011 |
| `verticalProtocol` | R-020, TC-001, TC-011 |
| `user` | A-013, C-006, C-007, D-001…D-011, Q-001…Q-003 |
| `company` | E-001, E-004, E-008, Q-031…Q-035, SA-008 |
| `member` | E-003, E-005, E-006, E-009, E-013, E-014, Q-006, SA-003, SA-005 |
| `invite` | E-010…E-014, E2-003, C-009, B-015 |
| `session` | D-001…D-011, C-001, C-017, SA-003, Q-033 |
| `project` | E-002, E-007, E2-001…E2-022, Q-007…Q-009 |
| `dataSource` (ingest) | ING-01…ING-32 |
| `dataSource` | F-001…F-010, G-017, J-002, Q-010…Q-017, SD-006, SE-001…SE-004 |
| `introspectionRun` | G-001…G-020, R-023, Q-010 |
| `catalogElement` | G-001…G-016, R-001…R-003, H-001, H-018 |
| `entitlement` | H-001…H-018, E2-026, K-001, K-004…K-006, TF-002 |
| `patternRule` | H-013, H-014, R-004…R-007, Q-012 |
| `pool` | I-001…I-023, K-002, Q-020, Q-024, TF-005 |
| `agent` | I-018…I-022, SA-003 |
| `effectiveVocabulary` | L-003, L-022, L-023, R-018, R-021, E2-028 |
| `metric` | L-001, L-003, L-004, L-013, R-021, TC-006, T-001…T-008, T-012, T-013 |
| `subject` | R-008, L-001 |
| `operation` | R-009, L-001 |
| `parameter` | L-006, L-007, L-011, R-021 |
| `synonymCandidate` | L-023, R-024 |
| `sotEntry` | TA-001…TA-007, L-014 |
| `sotCoverage` | TA-005, R-010 |
| `joinDeclaration` | TB-001…TB-007, L-015, L-016, K-002 |
| `undeclaredJoin` | TB-006, TB-007, R-022 |
| `fragment` | TC-006, TC-010, R-019, T-009, T-010 |
| `protocol` | TC-001, TC-007, TC-008, R-020 |
| `protocolCandidate` | TC-007, TC-008, TC-009, TC-012 |
| `fragmentCandidate` | TC-010, TC-012 |
| `knowledgeStats` | TC-013, R-011 |
| `run` | M-001…M-015, L-021, N-006, S-003, T-008 |
| `runStage` | N-002, R-012, R-013 |
| `qqcResult` | L-017…L-019, R-014, TC-003 |
| `observation` | TD-001…TD-004, G-009, G-013, R-024 |
| `auditEntry` | TD-005, TD-006, R-015, R-016, Q-036, E2-021, G-016 |
| `release` | TF-001…TF-014, Q-021 |
| `releaseFetch` | TF-003, TF-008, R-017 |
| `keyCustodyIdentity` | TF-022, TF-016 |
| `reconciliationRun` | TF-012 |

### Screens → cases

| Screen | Cases |
|---|---|
| Request a link | A-001…A-016 |
| Link sent | B-006, A-014, A-015 |
| Consuming the link | B-001…B-005, B-012, B-013 |
| Different-browser confirmation | B-007…B-009 |
| Accept invitation | E-010…E-014, B-015 |
| Project chooser | E-015, E-016 |
| Create a project | E2-001…E2-022 |
| All projects | E-015, O-001…O-004 |
| Dashboard | TD-007, TD-008, O-001…O-005 |
| Observations | TD-001…TD-004, O-002 |
| Observation detail | TD-002, TD-004 |
| Activity | M-007, M-009, M-015, O-001…O-005 |
| Run record detail | M-002, M-011…M-014, N-006 |
| Releases | TF-001, TF-004, TF-009, TF-010 |
| Release detail | TF-011, TF-013, TF-014 |
| Workbench | N-001…N-011, L-006, L-008 |
| Data sources | F-001…F-010, O-002 |
| Source detail | G-019, G-020, R-001, R-003 |
| Introspection run and diff | G-003…G-013, G-017, G-018 |
| Vocabulary | L-003, L-023, R-021, Q-006 |
| Synonym candidates | L-023, R-024 |
| Source of truth | TA-001…TA-007, R-010 |
| Relationships | TB-001…TB-007, R-022 |
| Knowledge | TC-007…TC-013, R-011 |
| Entitlements | H-001…H-018, O-001…O-004 |
| Pools | I-001…I-003, I-015…I-017 |
| Pool detail | I-015, I-016, Q-020, Q-024 |
| Agent twin | I-018…I-022 |
| Access | E-003…E-009, E-013 |
| Audit log | TD-005, TD-006, R-015, Q-036 |
| Project settings, all seven | Q-006…Q-030, Q-036…Q-038 |
| Company and personal settings, all seven | Q-001…Q-005, Q-031…Q-035, SA-006, SC-005 |
| Demo sources and evaluation | TE-001…TE-007 |
| Primitive gallery | O-001…O-011 |

| `embedding` | T-001…T-027 |
| `pool` (clarification policy) | CLR-01…CLR-05 |
| `effectiveVocabulary` (readiness, export) | CLR-06…CLR-08 |

### Endpoints → cases

Every endpoint in Parts A and D carries at least one contract case (`C`) plus its functional cases. The generated matrix fails CI if any endpoint has zero.

### Gate

CI generates this matrix from test annotations and compares it against the entity, screen and endpoint inventories in Parts C and D. **Any inventory item with zero cases fails the build.** This is what makes the coverage claim checkable rather than asserted.
