# Browser-to-Engine source provisioning — deferred design

Status: design note only, 28 October 2026. Not part of the current implementation.
The gateway source API remains reference-only. Technical documentation's Engine
execution envelope and on-premises security boundary continue to apply: the
application never holds source connection secrets.

The current customer path is an Engine-host command, `./sources add NAME`, which
collects connection fields locally, hides password entry, writes the Engine's
private secret store and prints only a `secret://` reference. The console sends
that reference to the ordinary public source-registration API. Listing names
must reveal no connection details; removal is an explicit Engine-host operation.

A future browser path must preserve that boundary. A project administrator would
obtain a credential-encryption public key authenticated against the registered,
verified Engine identity. The browser would seal the connection fields for that
Engine, with project, source, operation, version and expiry bound into the
cryptographic envelope. The gateway could authorize and relay that opaque
request, but could neither decrypt it nor return secrets through a read API.
Only the Engine would decrypt, validate and persist a private credential, then
return its reference. Source registration, network policy, connection checking
and catalogue discovery would continue through their existing authorized paths.

Before implementation, specify the envelope and key lifecycle, authenticated
public-key discovery, replay/idempotency rules, recovery across a partial
registration, removal and explicit replacement. No retry may overwrite a stored
credential or rotate an identity implicitly. Logging, browser persistence and
operator output must never contain a secret or sealed payload. Tests must prove
that the gateway cannot decrypt, that cross-project/Engine/replayed envelopes
refuse, and that ordinary reads return references only. No new routes, key types,
secret adapters or browser controls are introduced by this note.
