# XQ published API documentation snapshot

This directory contains all 140 pages from the XQ `xqmsg` Stoplight project's published `master` table of contents, retrieved on 2026-10-18T00:55:30.608085+00:00. All 19 specifically requested pages are included. No headless browser was needed.

Start with [the complete table of contents](index.md) or [the requested findings](reading-notes.md). Each page is named after its published slug and carries its source URL, retrieval time, branch and source URI. Articles retain their published Markdown. API/model pages retain their complete structured Stoplight definitions in formatted JSON, with endpoint and description extracted above them. Relative links inside published content remain as published; use the local table of contents or the page's source URL for navigation.

## Retrieval and provenance

The HTML embeds `window.URQL_DATA` and `window.__OVERMIND_MUTATIONS`. These identify project 117324. Stoplight's client encodes project IDs as base64url of `prj:<id>`, giving `cHJqOjExNzMyNA`.

Public read endpoints used:

- `https://xq.stoplight.io/api/v1/projects/cHJqOjExNzMyNA/table-of-contents`
- `https://xq.stoplight.io/api/v1/projects/cHJqOjExNzMyNA/nodes/<page-slug>`

All 140 node downloads succeeded. [manifest.json](manifest.json) records each node's API URL, source URI, branch-node ID, SHA-256 of the original data string and SHA-256 of its saved Markdown file. This is a retrieval-time snapshot, not an atomic revision lock or proof of live API behavior.

The publisher's examples contained complete JWT-shaped tokens. 25 occurrences were replaced with `<published-example-token-redacted>`; affected pages and counts are recorded in the manifest. No other source content was deliberately redacted. Example addresses, IDs and short example credentials are publisher-supplied examples, not local configuration. No local credentials or certificate bundle were read for this pull.

No authenticated XQ service calls, application changes, tests or gate runs were made. The findings distinguish published contracts from missing documentation; they do not infer contracts from the SDK or prior probes.
