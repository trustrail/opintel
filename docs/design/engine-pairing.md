# Engine pairing: one code, one claim

The engine operator runs `./install` and gives the printed engine address and
pairing code to the gateway operator over their trusted out-of-band channel.
The gateway operator types `./register-engine ENGINE_ADDRESS CODE`. Nothing is
carried by file. `./pairing-code` on the engine host explicitly issues a fresh
15-minute code only while the engine is unpaired; it does not rotate TLS keys.

The versioned code contains the engine leaf-certificate SHA-256 pin and a random
256-bit claim secret. The engine stores the secret only in its private state,
with expiry and the bound pin. Possession of a public pin alone grants nothing.
Codes and trust payloads never enter logs. Codes are operator secrets, not query
credentials. A successful claim consumes the code permanently.

A dedicated engine pairing listener on TCP 3103 uses the engine's existing TLS
identity. The gateway completes TLS and checks hostname and the code's exact pin
before writing HTTP headers or a body. This explicit pin is the bootstrap trust
anchor; platform CA trust is not assumed. The gateway supplies its public leaf,
CA and address through that encrypted pinned channel. The engine checks the code,
expiry, identity binding, certificate validity and CA signature, then durably
records that single gateway as its peer before changing runtime trust. Concurrent
claims serialize; a second claim, expired code, wrong code or existing different
peer refuses. Pairing never replaces an existing peer or generates credentials.

The response carries the engine's public trust and its generated demo-source
connection configuration, encrypted on the same channel. The gateway verifies
that response against the pinned identity and records it privately. Both query
and heartbeat paths continue requiring the exact registered certificate and CA.
The engine atomically reloads the recorded client trust and closes old sockets;
the companion reads the new pinned trust before its next heartbeat. Query routes
never accept the pairing code or an unverified certificate.

A lost response must not make the single-use code reusable. A separate result
route requires proof of possession of the already-recorded gateway TLS private
key and returns only that engine's registration result. The gateway can resume
through this route; it cannot change the peer. Durable peer state wins over an
unconsumed-looking code after a crash. The pairing listener declares distinct
permissions for claim, recorded-peer result, and local readiness. Request size,
time, attempts and diagnostic fields are bounded. No SQL, key, token, code, pin,
certificate body or demo-source credential is logged.

Open TCP 3103 from gateway to engine for pairing/recovery, alongside engine API
3100. Existing heartbeat (engine → gateway 3102), optional ingest receipts (3101)
and demo source (gateway → engine 5434) retain their roles. The local operator can
inspect status; no network route creates, renews or resets a pairing code.
