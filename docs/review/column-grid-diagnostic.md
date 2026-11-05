# Column-grid reproduction on main 42391a3

## Evidence before conclusion

The Vite **dev** console on unchanged product sources from main 42391a3 was
served against a seeded isolated query fixture and real API routes. The browser
opened its pool, then clicked the full-name table link in Access. The grid stayed
visible after network settlement: rendered=true, no console/page errors, no HTTP
failures. Declaration/schema requests used the real production routes.

[Access screenshot](column-grid-diagnostic/pool-access.png) ·
[Grid screenshot](column-grid-diagnostic/column-grid.png) ·
[Browser/network result](column-grid-diagnostic/dev-result.json).
Trace retained locally at `tmp/column-grid-dev-trace.zip` (moved from the capture
output after review). Capture scripts/fixture/config are committed with this
record. Authentication is the injected fixture administrator, not a packaged
SMTP login. The first diagnostic fixture omitted declaration routes and produced
404s; adding the real routes corrected the diagnostic, with no product edit.
The completed diagnostic passed 1 test.

## Harness cause established

The original full-name locator correction found the table but clicked the
`[data-data-table-row]` **container**. In
`src/console-next/data/screen.tsx:41`, that div has no click handler. Its full-name
button and arrow invoke `onOpen`. Therefore waiting for treatment controls after
clicking the div does not establish a column-grid render defect.

The requested full browser-from-start run using the existing 42391a3 archives
in `tmp/console-first-run-acceptance-qxw6UI` reproduced this: its screenshot shows
[the table list still present](column-grid-diagnostic/fresh-table-list-timeout.png),
not a blank grid. Console/page errors and HTTP failures were all zero. It timed
out at the treatment-button wait after the ineffective container click.

The browser now clicks the button named `claims_warehouse.public.records` and
explicitly waits for `[data-data-column-head]` before choosing a treatment. All
existing treatment, query, receipt and per-table editor assertions remain.
Console errors and request method/path/status are retained without headers or
bodies. No old nav-label locator was involved; stable screen parameters remain.

## Corrected-button acceptance blocked earlier

A fresh run from the beginning, not resume, used the same published images and
archives in `tmp/console-first-run-acceptance-VzOUif`. Gateway/engine installation,
pairing, source add, SMTP sign-in and project creation passed. It stopped at
engine verification: POST `/api/v1/projects/:project/engines/:engine/verify`
returned **503**, then the existing 120000 ms wait for `First hour · 2 of 6 done`
expired. [Screenshot](column-grid-diagnostic/engine-verify-503.png).
The corrected column click was not reached in this attempt.

[Sanitized packaged results](column-grid-diagnostic/packaged-results.json) retain
the exact paths/statuses and failure messages. The underlying cause of the 503
was not investigated in this locator task. Stopped without another run or product
fix. No images were rebuilt/published; no cloud host touched. Final cloud release
archives remain blocked by acceptance.

## Validation and conclusion

Three first-hour contract tests, script syntax checks and lint passed. The dev
console grid renders, so no product bisect or product change was performed. The
established harness defect is clicking a layout container instead of its button.
The earlier blank resume screenshot alone does not establish a render exception;
this direct dev reproduction and fresh table-list screenshot supersede that
hypothesis. The original resumed path was not reused here.
