# CONSOLE-02 — cloud and OAP console follow-ups

Branch: `fix/console-followups-2`, from main `f6476a9`. No merge.

## Evidence and changes

1. **Presence.** `AgentPresenceView` required literal false, the repository saved literal false, and migration 044 prohibited true. Migration 098 removes that historical constraint without rewriting an applied migration. After MCP certificate authentication succeeds, observation checks the credential linked to the authenticated key: identity-bound, bound, not revoked, matching fingerprint. Only then is presence verified. Bearer-only credentials remain claimed-only, even if they present a certificate. Public presence input cannot set verification. Names remain self-declared labels and never authorize anything. No historical observation is inferred to have been verified.
   Stale means three configured heartbeat intervals without an authenticated request/heartbeat (60 seconds at the default 20-second interval). Connected-now includes connecting/active/idle and excludes stale/disconnected. Both controls explain this; timing is unchanged.
   Tests: `credential-identity-binding.test.ts` CONSOLE-02 presence; `agent-presence.test.ts` I-018–021 and heartbeat timing; `agent-presence-migration.test.ts` 098 up/down/up; `pools.test.tsx` verified lanes/stale-versus-now.
2. **Identity labels.** Device label, certificate label and bound date now have explicit ` · ` separators. Credential labels are also separated from identity summaries. Removed the agent workbench’s existing rule that hid row `time` elements. Dates now use the existing timestamp typography and phone grid position. Verified agent badges consume the presence API; client names and device labels remain self-declared.
   Tests: `pools.test.tsx` identity labels and bound date; `workflows.test.tsx` real twin/Activity link.
3. **Contributor guidance.** Removed “Explore schema” guidance from contributor-key failures and bulk declaration validation. The real destination is Data → source → table column list → column name menu → Use as contributor key. Choosing aggregate-only reads existing column declarations and shows that guidance before saving; an absent usable contributor key prevents submission. The existing server refusal remains enforced.
   Tests: `aggregate-contributor.test.ts`, `element-declarations.test.ts`, `data.test.tsx` contributor guidance.
4. **Catalogue names.** Pools Access reads the existing catalogue and displays its exposed qualified name. Data table rows also show that name in monospace. Both have a copy action; display names are never used to reconstruct SQL names. Catalogue-read errors remain visible.
   Tests: `pools.test.tsx` qualified Access name; `data.test.tsx` exact-name clipboard action.
5. **Custody designation.** The existing refusal now names Settings → Engines → row menu (⋯) → Use for custody. The source form links to Settings → Engines when that refusal occurs.
   Tests: `engine-registry.test.ts` missing designation; `data.test.tsx` source-save link.
6. **Agent-kit 401.** The SDK previously replaced the error envelope with HTTP status. The kit now observes the final response after the existing enrollment-proof exchange, preserving public refusal code/cause. For credential-state failures without a cause, it preserves the existing known public state message. Arbitrary fields/messages, challenge locators and secrets are not echoed. The gateway and enrollment retry behaviour are unchanged.
   Tests: `steps-custody.test.ts` identity mismatch/unproven/pending and credential-state diagnostics; `provisioning-runtime.test.mjs`.
7. **Query limits.** Timeout, returned rows, memory and pool concurrency now say “required” and have required form controls; empty submission is rejected. Pools displays a linked blocking notice when the Needs-you queue reports unset query limits. The backend already generates all four setting-required items, including projects with pools, and removes them after settings are saved; no duplicate queue or API change was added.
   Tests: `settings.test.tsx` four required fields; `pools.test.tsx` blocking notice; `needs-you.test.ts` NY-001/003/007.

No new CSS classes, API routes, grants or receipt changes. The existing response field `verified` becomes a boolean instead of a false-only literal.

## Validation

- Standard development preparation: Postgres and Redis healthy; migration 098 applied using the repository migration runner.
- Targeted integration/contracts/migrations: 63 files, 298 tests passed; supplementary schema/migration and HTTP-authentication checks: 5 files, 58 tests passed. This includes every migration up/down and migration-fixture test, table grants, MCP contracts and DEP-008 packaging/provisioning.
- Console: 13 files, 165 tests passed (exit 0); final list/copy/date recheck: 2 files, 66 tests passed. Early in-progress checks exposed two outdated/ambiguous test selectors, corrected without weakening assertions, and three existing row-builder tests hit their 5-second deadline; the final run passed with those deadlines unchanged. Happy DOM emitted socket/abort teardown diagnostics in the full console run; its assertions and exit status passed.
- Strict typecheck and unchanged lint/boundary checks passed.
- Single completed-candidate `npm run check` on `65f4aea`: both typechecks, lint/boundaries, production artifact, 38 conformance checks (28/28 screen routes, zero findings), and all 2,301 normal tests in 271 files passed. The browser/MCP smoke scenario exceeded its 30-second deadline (31.8 seconds); the gate exited 1 after 2,750.33 seconds. The failure also logged `budget_exceeded` during query validation and an MCP connection-close error during teardown. These are recorded, not suppressed.
- The one permitted standalone `npm run test:smoke` retry on the unchanged `65f4aea` passed: one scenario in 15.9 seconds (45.1 seconds including setup), exit 0. No timeout, assertion or product code changed; the full gate was not rerun. This matches the previously observed Intel-host deadline pattern but does not independently establish the timeout's root cause. Validation is recorded as all preceding gate tiers passed plus standalone smoke passed, not as an exit-0 full gate.

Candidate implementation commit: `65f4aeac5616f1955cb513d08a6baa37472b9246`, pushed to `origin/fix/console-followups-2`. This final report update is docs-only. No merge.

Gate evidence: `/private/tmp/console02-gate-65f4aea.log`; original gate JSON, smoke trace and error context retained under `/private/tmp/console02-first-smoke/`; standalone smoke log `/private/tmp/console02-smoke-once-65f4aea.log`.

Logs on the development host: `/private/tmp/console02-targeted.log`, `console02-targeted-final.log`, `console02-console-final.log`, `console02-list-controls.log`, `console02-typecheck-final.log`, `console02-lint.log` (all under `/private/tmp/`). Test names above provide the requested per-item evidence; no production deployment or cloud-session verification is claimed.

## Interpretation

“Verified name” is the requested display term for a connection authenticated with the credential’s bound certificate. It does not verify the truth of the name or person behind it. A stale badge describes lack of recent traffic, not a failed certificate binding.
