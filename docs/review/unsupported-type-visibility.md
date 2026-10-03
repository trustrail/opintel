# Unsupported type visibility

Unsupported discovery remains successful. Each completed run stores unsupported
findings with element identity/name, source type and the mapping classification:
`explicitly_excluded` or `unmapped`. Findings recur on unchanged discovery, rather
than disappearing behind an empty diff. Unsupported additions use this category
instead of the category that tells a person to decide access.

The Data sources list counts all active elements, shows unsupported separately,
and excludes unsupported/unnameable elements from undecided. The read-only
Observations screen groups active unmapped findings by source/type. It calls them
Opintel mapping gaps, names the type and links to the most recent supporting run.
Explicit exclusions remain in the diff/counts but are not mapping-gap observations.
The endpoint is constructed and registered in `start.ts`, requires `project#view`,
and has tenant-scoped SQL and project-bound cursor pagination. Completion, source
changes and stream reconnect invalidate the counts and observations.

The observations query uses the most recent stored finding per element, checked
against the current active catalogue. Thus partial-schema and failed runs cannot
hide findings, and repair/removal closes a current finding without erasing history.
No migration or external reporting channel is introduced. Existing runs are not
rewritten; the next introspection records the new findings.

## What the development demo recorded

Read-only inspection on 2026-09-30 found source
`f41a3901-04a4-47fe-8aaa-0ccad1c643f1` and one introspection run,
`01a0eae7-dcbd-749c-9ffe-fbf32cff3043`.

- Started 2026-09-29 02:04:19.143 UTC; completed 02:04:25.145 UTC.
- State `complete`, no error. Progress reported 11 objects and sampling consent false.
- 110 diff entries: 11 `CatalogObjectAdded`, 99 `CatalogElementAdded`.
- Those entries recorded identities and exposed names, but no source type,
  exposed type or unsupported classification.
- No persisted pattern-rule observations with a message for this source's runs.
- The current catalogue had 99 active elements: 11 bare `numeric` with
  `exposed_type IS NULL`, 11 `timestamptz`, 22 `date`, 11 `uuid`, and 44 `text`.
  The 11 unsupported elements had 11 withheld entitlement rows.

The available database therefore substantiates **11**, not twenty-two,
unsupported demo elements. The run has no immutable full metadata snapshot from
which to reconstruct a different historical type count. Type/null facts survived
in the current catalogue; the run diff did not capture them. Neither the run nor
the development catalogue was altered during this inspection.

## Verification

- Catalogue/source/route-schema integration: 50 tests passed in three files.
- Endpoint, stream invalidation and catalogue-tree regression: 12 tests passed in
  three files, including permission denial, cursor isolation and tenant isolation.
- Docker Chromium: 24 visual cases passed with axe at 390/900/1440. New unsupported
  diff and observation snapshots inspected, plus source counts. Unrelated baseline
  updates (dashboard, history, empty source and wizard) from the browser's changed
  avatar rendering were discarded.
- Strict typecheck, lint/boundaries and production build passed.
- Docker functional browser verification: 9 passed, including observation loading,
  error recovery and empty-card omission. The native runner could not start because
  its Chromium binary was absent; Docker supplied the same bundled browser used
  for the visual checks.
- No database migration, query execution or treatment behavior changed.
