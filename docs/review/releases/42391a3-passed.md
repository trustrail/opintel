# RELEASE-42391a3 — passing Intel acceptance and cloud archives

The newly authorized single run from the start passed with exit 0:
`tmp/console-first-run-acceptance-nj348q/install-result.json`.

Command (same standard harness, no resume):

```sh
node scripts/images/console-first-run-install.mjs tmp/release-42391a3-acceptance-archives 42391a3e86db16dfdac0736cbf5927efa6ada7f6
```

Five installation checkpoints and all 12 browser checkpoints passed, including
SMTP sign-in, project creation/engine attachment, verify, schema selection/scan,
query limits, compound pool creation, explicit clear decision, credential issue,
authenticated MCP query, receipt in Audit, first-receipt marker and per-table
editors. The receipt shows **6 rows**. Zero page errors, console errors and HTTP
failures; no deadline failure in this invocation. Engine verification passed,
so the conditional 503 stop was not triggered. Previous locator/deadline and
503/TLS failures remain recorded separately and are not erased or reclassified.
[Acceptance evidence](42391a3-passed/acceptance.json).

The published product images remain revision 42391a3. No image was rebuilt or
republished during this rerun. Main is bbad6ee after the approved diagnostic
merge; the subsequent kind-icon-aware harness fix and reports are on
fix/acceptance-table-button, not merged. Product sources were not changed.
No cloud host was contacted.

After acceptance passed, four fresh amd64 archives were built using the standard
customer-package builder and existing published manifest:

```sh
PLATFORM=linux/amd64 node scripts/images/customer-package.mjs tmp/release-42391a3-published.json tmp/cloud-42391a3-archives --candidate
python3 scripts/images/check-customer-archives.py tmp/cloud-42391a3-archives
```

The archives retain their approved candidate designation. The builder now
suppresses macOS metadata/xattrs/ACLs/file flags and sets COPYFILE_DISABLE=1.
All four passed metadata inspection and full extraction in the pinned Linux
Node runtime container with **zero stderr warnings**, including no
LIBARCHIVE.xattr warnings. [Checks](42391a3-passed/archive-checks.json) ·
[SHA256SUMS](42391a3-passed/SHA256SUMS). Files live in
`/Users/rzarita/opintel/tmp/cloud-42391a3-archives/`.

Packaging/provisioning contracts: 11 passed. Node/Python script syntax and
repository lint passed. No full gate was run for these script/docs changes.
Only reproducible images.tar duplicates were removed for disk space; original
compressed archives, service state and diagnostic logs were preserved.
