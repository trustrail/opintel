# Acceptance table button correction

Approved merge of fix/column-grid-diagnostic was pushed to main as bbad6ee.
A fresh packaged run on the existing 42391a3 images passed engine verification
(no 503) but timed out on the exact accessible button name. The shared table
kind icon contributes to that name; it is not just the visible catalogue code.

The harness now selects the button containing code text matching the exact full
catalogue name, rather than comparing its entire accessible name. No product
source, timeout, treatment/query/receipt assertion or image changed. The grid
header assertion remains before treatment selection.

Dev regression with real seeded API routes passed both the pool Access link and
the exact code-text button selection: 1 test passed (57.804 s), grid rendered,
zero console/page errors and zero HTTP failures. Evidence:
[dev-result.json](acceptance-button-regression/dev-result.json),
[grid screenshot](acceptance-button-regression/column-grid.png). Trace retained
privately at tmp/acceptance-button-dev-trace.zip. New results were moved aside
and original main diagnostic evidence restored, preserving both runs.

Script syntax and lint passed. Duplicate images.tar files in completed local
labs were removed; original archives, service state and logs were preserved.
A fresh packaged run with the corrected code-text locator is pending. It will
use the existing 42391a3 archives, with no image rebuild/publication.
