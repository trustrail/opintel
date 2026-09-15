# Start here

Everything is in place. Nothing to copy, rename or move.

## 1. Start the services

    docker compose up -d

## 2. Open Codex

    codex

## 3. First prompt

**The audit is finished.** Six rounds were run against these documents before
any code existed, and the last one returned no contradictions. You do not need
to run another. If you want to, the prompt is in `docs/prompt-library.md`.

**Start a new Codex session** and go straight to the first work item:

    Implement item 1.1 from docs/implementation-plan.md.

    Read: docs/slice1-technical-documentation.md sections 1.1 bounded
    contexts, 5.1 frontend tree, and 9.1 pipeline stages 1 to 3. Read
    AGENTS.md in full.

    Create only: the src tree, tsconfig with strict and
    noUncheckedIndexedAccess, eslint with the module boundary rule and rules
    blocking `any`, raw hex and arbitrary Tailwind values, dependency-cruiser
    config, and CI stages 1 to 3.

    No application code. Modules stay empty folders with an index.ts.

    Done when typecheck, lint and an empty test run pass in CI.
    Do not implement anything from another item.

Deliberately small. It establishes the shape everything else inherits, and it
shows you how the agent behaves on an unambiguous task before anything is at
stake.

Then work through `docs/prompt-library.md` one item at a time, in order,
reviewing each diff before the next.

## 4. Then build, one item at a time

`docs/prompt-library.md` has a prompt for every item, in dependency order.
Start at 1.1. Review each diff before the next.

Six items are marked DO NOT DELEGATE and are written by hand:

| Item | What |
|---|---|
| 1.4 | Tenant isolation wrapper |
| 4.3 | Tokenization |
| 4.4 | View compiler |
| S2 | DuckDB two-session construction |
| S4 | Ephemerality proof |
| C.6 | The bypass suite |

These are where a generator produces plausible wrong answers, and where a
wrong answer fails silently.

## What is here

| Path | What |
|---|---|
| `AGENTS.md` | Rules the agent must not violate |
| `docs/implementation-plan.md` | 91 items, dependency ordered, with gates |
| `docs/slice1-technical-documentation.md` | Domain, API, auth, schema, frontend, errors, testing, observability, CI, security, vocabulary, clarification |
| `docs/algorithm-specifications.md` | Tokenization, view compiler, DuckDB session, tenant wrapper, pipeline |
| `docs/test-specification.md` | 537 cases |
| `docs/opintel-master.css` | The product stylesheet. Ships unchanged |
| `docs/opintel-schema.zed` | SpiceDB schema |
| `docs/prompt-library.md` | A prompt per item. For you, not the agent |
| `reference/console.html` | The UI reference implementation. Open it in a browser |
| `src/` | Empty module tree, four layers per module |

## One thing to know

`reference/console.html` is not a mockup to be improved on. The shipped UI is
meant to look identical to it, and `docs/opintel-master.css` is its stylesheet,
extracted and shipped unchanged. React components are written to its existing
class names.

## Corrections applied

This package incorporates the findings of a specification audit run before any
code was written. Eleven cross-document contradictions were resolved, the
SpiceDB schema was corrected (it carried a superseded agent-admission model),
a migration ordering bug was fixed, fourteen previously undefined types were
specified, and every section citation in the prompt library was corrected.

## Audit history

Three rounds were run against these documents before any code existed.

| Round | Found | Notable |
|---|---|---|
| 1 | 24 | A superseded agent-admission model in the SpiceDB schema, a broken migration, a prompt library citing a document that is not in this repository |
| 2 | 11 | The route permission inventory, the Tailwind theme mapping, MailPort, the device-confirmation endpoint |
| 3 | 8 | The embedded authorization graph diverging from the `.zed` file, protocol tests that belong to Slice 3, `Clock`, `IdFactory`, `SchemaSpec`, `GeneratorSpec` |
| 4 | 12 | **The unqualified "nothing is copied" claim**, which stopped being true once spreadsheet ingest existed, plus nine implementation types used in interfaces but never defined |
| 5 | 15 | Twelve more types, including several published module interfaces, plus the branded id inventory made formal rather than prose |
| 6 | 5 | **No contradictions.** The last five published interfaces, plus four more the audit missed that a systematic check found |

**Section 1 came back empty on round 6.** Every published interface in the
bounded-context map now has a signature, and a check across every code block in
both specifications finds no type used without a declaration.

**On rounds 4 to 6.** Each defined types, and the next round found the types
used inside those definitions. Round 6 closed it by construction rather than by
list: 18 published interfaces, 112 declared types, and an automated check that
every PascalCase name appearing in a code block resolves to a declaration.

**Section 2 is not a defect list and never was.** Package manager, UUID library,
Redis key layout, snapshot baselines and OIDC clock skew are decisions for
whoever builds. They have been stable and correct across all six rounds. Make
them as you go and record them in the specification as you do.

Round 4 found the most commercially important defect of the four: the product
was claiming, in customer-facing material, that nothing is copied. Landing
writes a file into the customer's Postgres, so the defensible claims are that
**the query path copies nothing** and **nothing leaves the customer's
environment**. Both hold; the unqualified version did not.
