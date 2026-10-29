# Pools completion review

Changes live in `src/console-next/pools`; the current console and backend contracts are unchanged.

The column picker groups scanned columns by exposed name across the chosen tables, sorted by coverage. It uses the most common supported exposed type, shown in the option, to select numeric, boolean, date/time or text controls. Boolean operators are equality/inequality; other supported types use the existing comparison operators. Each chosen table gets a chip checked with the same browser-safe typed predicate parser the existing console uses: green when compatible, amber with “gets no rows until its own rule” otherwise. Unsupported/missing columns do not gain access. All rows remains a separate explicit decision. No Value type control appears in creation.

Creating the pool confirms the labelled suggested thread value. No thread confirmation checkbox remains. Optional limits still omit empty values and display project limit. Waiting is a fixed-width numeric badge; its hover text separates undecided columns from tables needing rows. Rows and arrows open the selected pool; the stray Data label is gone. Individual pool squares in the header/picker contain the code alone. Counts, including bound tables, chosen tables, source selection counts and suggested threads, use singular/plural correctly.

Credential lanes show every unique agent name observed on that credential. As explicitly clarified in review, solid circles require verified name identity. The current API fixes `verified` to false, so every current name remains dashed, including names observed authenticating with a modern credential. Authentication and legacy key metadata determine lane membership, never identity verification. Fresh/stale/disconnected states affect connected-now counts, not circle solidity. Names remain self-declared. No six-name truncation remains; long lanes scroll horizontally.

## Stack manifest

The private console manifest now declares the same existing versions as the root installation. No other UI kit was added. Output of the requested command:

```text
    "@phosphor-icons/react": "^2.1.10",
    "@radix-ui/react-checkbox": "^1.4.1",
    "@radix-ui/react-dialog": "^1.3.1",
    "@radix-ui/react-dropdown-menu": "^2.2.1",
    "@radix-ui/react-popover": "^1.3.1",
    "@radix-ui/react-scroll-area": "^1.4.0",
    "@radix-ui/react-tabs": "^1.2.1",
    "@radix-ui/react-tooltip": "^1.4.1",
    "@visx/group": "^4.0.0",
    "@visx/scale": "^4.0.0",
    "@visx/shape": "^4.0.0",
    "motion": "^14.7.1",
    "react": "^19.3.0",

```

## Verification

Lint, strict typecheck, 35 console tests and the real-API capture check passed before the candidate commit. The single full-gate outcome and merge commit are reported with delivery. The real-API capture fixture exercises pool creation, rows and confirmed credential commands against PostgreSQL and SpiceDB, without mocked browser responses. It checks the typed dropdown, compatibility chip, absence of Value type/thread confirmation, code-only badge, numeric Waiting and claimed-only lane circles.

| View | Capture |
| --- | --- |
| Access, 390 light | [PNG](pools-fixes-screenshots/pools-access-390-light.png) |
| Create pool, 390 light | [PNG](pools-fixes-screenshots/pools-create-390-light.png) |
| Create pool, 1440 light | [PNG](pools-fixes-screenshots/pools-create-1440-light.png) |
| All pools, 1440 light | [PNG](pools-fixes-screenshots/pools-all-1440-light.png) |

[Capture evidence](pools-fixes-screenshots/capture.json). These are manual review captures, separate from retired pixel baselines.
