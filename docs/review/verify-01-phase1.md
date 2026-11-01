# VERIFY-01 phase 1

DEMO-01 was merged and pushed to main as
`ac91c4c51ab6d9a63aeb3f000bcb0ae68f565de8`, after the reported native arm64
release pass for `251f0e4`. This phase starts from that merge on
`feat/verify-01-frame`. It changes internal verification and operator harnesses,
not application behavior, migrations, source ingest, or the versioned V-01 answers.

## Frame

`scripts/verification/verifier/` builds internal artifact 1.0.0. The artifact is
self-contained JavaScript with its custody-agent child, version/revision and
source/artifact hashes. Customer bundle construction rejects verifier inputs.
It is not added to any image entry or customer archive.

The registry has 115 stable logical cell IDs, fixture-derived outcomes, dimensions,
prerequisites and expected evidence. Installation-specific source names and
credential UUIDs map to logical names/slots; installed responses never define
expectations. The finite scheduler runs each selected cell once before optional
random traffic. Dependency setup does not enlarge claimed coverage. Selection
supports all, capability, cell and dimension filters. Missing prerequisites,
interruption and an expired retiring credential are not exercised and fail.
Unknown selectors fail before setup. Invalid combinations are separate from cells.

JSON and Markdown record all selected cells, outcomes, dimensions, receipt IDs,
durations and sanitized checks, including cells not reached. Installation revision
and image identities are separate from verifier revision/source hashes. Raw rows,
connection strings, cookies, device tokens and receipt bodies stay out of reports.
Reports fail until complete; optional traffic failures/interruption also fail.

## Customer-path setup and the approved evidence adaptation

External V-01 database writes use the existing standalone synthetic writer with
an explicit target, never metadata or readiness. The real installed `./sources add`
stores credentials on the engine. Public APIs create a dedicated project, register,
verify and designate its paired engine, configure project limits/custody, initialize
the token key, register sources and read their catalogue. Public pool/table APIs
bind all eight tables explicitly. Declarations, treatments, row decisions, threads
budget and normal/lifecycle credentials all use the console's public APIs.
The compatibility operator setup no longer uses service/repository writes for
those operations. There is no public source-binding endpoint.

All 115 query outcomes/row expectations remain unchanged. Only these four cells'
row-scope evidence expectations change:

| Cell | Previous evidence | New evidence | Reason |
|---|---|---|---|
| pool0/v01.soak_recoveries.open_reference/reference_id/clear | unscoped | explicit all-rows decision ID/hash | Customer table binding requires an explicit row decision. |
| pool0/v01.soak_recoveries.open_reference/description/clear | unscoped | explicit all-rows decision ID/hash | Same table/decision, same three answer rows. |
| pool1/v01.soak_recoveries.open_reference/reference_id/clear | unscoped | explicit all-rows decision ID/hash | Customer table binding requires an explicit row decision. |
| pool1/v01.soak_recoveries.open_reference/description/clear | unscoped | explicit all-rows decision ID/hash | Same table/decision, same three answer rows. |

The all-rows predicate is the public editor's nullable-safe predicate on the first
supported column. Pool 0's treaty_reference retains its explicit false predicate;
pool 1 retains its missing row decision and zero rows. Other row predicates and
all treatments are unchanged. The implicit-table mode investigation/removal is
backlogged, not implemented.

The 16 existing custody cells require four certificate exchanges, actual unsealing
against fixture values and no skipped custody. The packaged-mode environment flag
is removed. The legacy exploration pass also refuses incomplete declared coverage.

## Release integration

`native.sh` builds the internal artifact separately and passes it to Stage 5.
Stage 5 runs finite all-cells coverage then the selected timed traffic duration
(default 120 seconds), retaining SMTP/browser/outage/restore checks. It also proves
a missing normal session produces 115 not exercised and a nonzero exit, and runs
custody-only selection. Stage 4 keeps its extra egress-denial and unchanged-rerun
checks, then uses the same fresh-archive Stage 5 acceptance for finite coverage,
receipts, browser and outage rather than a second timed pass rule. That final
Stage 4 step requires CUSTOMER_ARCHIVES, RELEASE_MANIFEST and INTERNAL_VERIFIER.

## Verification record

- Initial packaged-lab diagnostic: all 115 selected cells passed, zero failed,
  zero not exercised; `tmp/verify01-debug/all-public/result.json`.
- A preserved lab's self-advertised LAN engine address was unreachable from Docker;
  a certificate-valid `engineAddress` override used the normal registration API.
  No engine validation was changed. Original authorised XQ exports were used.
- Targeted checks, fresh final archive verification and the one completed-candidate
  full gate: pending at the time of this draft; updated below before delivery.

No migration is touched, so no migration-test exemption or applied-migration edit
is involved. No issued evidence is edited. The four requested backlog follow-ups
are recorded in `docs/master-backlog.md`.

Native release must be run by hand on the arm64 MacBook Air; this Intel host cannot
execute the native-arm64 script. Final command is recorded with the pushed revision
in the completed verification record.
