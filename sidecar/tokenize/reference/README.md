# Tokenization: decisions and reference vectors

`vectors.py` is the independent reference for algorithm specifications A.2 and
A.3. `vectors.json` is its output and the acceptance test for the TypeScript
implementation. **Neither may be modified by the session that writes the
implementation.**

```
python3 vectors.py > vectors.json
```

42 vectors, 14 of them expected rejections. Test key: bytes 0x00 to 0x1f.

## Decisions (copy into algorithm specifications section A)

**Construction.** `v1_{domain}_{crockford128(HMAC-SHA256(key, payload)[0..15])}`
where `payload = "v1" 0x00 canon_id 0x00 domain 0x00 canonical_utf8`.
`v1` versions the construction. `canon_id` versions the canonicaliser per
element. Mixing the domain into the MAC prevents cross-domain joins by
stripping prefixes.

**Identifiers.** `domain` and `canon_id` are required and match `[a-z0-9]+`.
No underscores (the token format splits on `_`), no null bytes (the payload
delimiter), no empty domain.

**Text.** NFKC, then trim, then, if case-insensitive, full Unicode case
folding followed by NFKC again. Trim removes the Unicode White_Space property
plus U+FEFF, from both ends, as an explicit set. Never use a language
built-in: Python's `strip()` and JavaScript's `trim()` disagree on U+001C to
U+001F, U+0085 and U+FEFF. U+FEFF matters in practice because Excel starts
CSV exports with one.

**Numbers.** Input must match `-?(0|[1-9]\d*)(\.\d+)?`, the form Postgres
`numeric::text` emits. Canonicalised as a string: trailing fractional zeros
removed, `-0` becomes `0`. No arithmetic, so no precision limit. Rejected:
exponents, underscores, leading or trailing dots, leading zeros, and any
non-string value. Floating-point columns are cast upstream to numeric.

**Dates.** `YYYY-MM-DD`, validated as a real calendar date. A date is never
treated as midnight in some zone.

**Timestamps.** Input grammar: `YYYY-MM-DD[T ]HH:MM:SS[.f{1,6}][Z|±HH[[:]MM]]`.
Output: `YYYY-MM-DDTHH:MM:SS.ffffffZ`, UTC, microseconds zero-padded. A naive
timestamp needs a declared element or schema zone, and is **rejected** if the
local time is ambiguous (DST overlap) or nonexistent (DST gap) in that zone.
Seconds are required; a date alone is rejected in timestamp mode.

**Reading from the source.** Tokenization runs in the sidecar before rows
enter DuckDB. Tokenized columns are read as the source's own text, with the
source session's `TimeZone` set to UTC. Never tokenize a value the Postgres
driver has parsed: it reads naive timestamps in host local time and truncates
to milliseconds.

**Key.** 32 raw bytes, resolved through VaultPort in the sidecar only. Zero
buffers after use, but do not claim it as a guarantee: Node's HMAC copies the
key into OpenSSL, and a key read from an environment variable exists as an
immutable string. The guarantee is that the key never leaves the sidecar
process and never appears in a log, span, error, SQL string or database row.

## Requirements for the TypeScript implementation

- **Case folding needs a table.** Node has no case-folding function and
  `toLowerCase()` is not case folding. Commit a table generated from Unicode's
  `CaseFolding.txt`, statuses C and F.
- **Trim needs the explicit set above**, not `String.prototype.trim`.
- **Record the Unicode version at sidecar startup.** Node here reports 17.0,
  Python 15.0. Unicode's stability policies keep NFKC and case folding fixed
  for assigned characters, so they agree on everything the vectors use. A Node
  upgrade can still change tokens for characters assigned after the running
  version.
- **Parse by grammar.** No `Date`, no `parseFloat`, no `Number()` anywhere on
  the canonicalisation path.
