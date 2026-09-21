#!/usr/bin/env python3
"""
Independent test-vector generator for algorithm specifications A.2 and A.3.

Shares no code with the TypeScript implementation. Every rule that a language
built-in could get subtly wrong is defined explicitly here instead:

  - trim is an explicit character set, not str.strip()
  - numbers are canonicalised as strings, never through arithmetic
  - timestamps are parsed by an exact grammar, never fromisoformat()
  - caseless matching is NFKC -> casefold -> NFKC

Inputs are stored as raw JSON values, so a non-string input stays non-string.
Vectors use only characters assigned by Unicode 15.0, where Python and Node
agree under Unicode's normalisation and case-folding stability policies.
"""
import base64, hashlib, hmac, json, re, unicodedata
from datetime import date, datetime, timedelta, timezone
import zoneinfo

ENVELOPE_VERSION = "v1"
RFC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
KEY = bytes(range(32))                      # test key 0x00..0x1f, never outside tests

NUMERIC_RE = re.compile(r"-?(0|[1-9]\d*)(\.\d+)?")
ID_RE = re.compile(r"[a-z0-9]+")            # domains and canonicaliser ids
DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
TIMESTAMP_RE = re.compile(
    r"(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?"
    r"(Z|[+-]\d{2}(?::?\d{2})?)?")

# Unicode White_Space property plus U+FEFF (byte-order mark). Explicit because
# Python's strip() and JavaScript's trim() disagree on six code points.
TRIM = ("\u0009\u000a\u000b\u000c\u000d\u0020\u0085\u00a0\u1680"
        "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
        "\u2028\u2029\u202f\u205f\u3000\ufeff")

def crockford128(b: bytes) -> str:
    rfc = base64.b32encode(b).decode().rstrip("=")
    return "".join(CROCKFORD[RFC.index(ch)] for ch in rfc)

def canonical_text(v, case_insensitive: bool) -> str:
    if not isinstance(v, str):
        raise TypeError("text input must be a string")
    v = unicodedata.normalize("NFKC", v).strip(TRIM)
    if case_insensitive:
        v = unicodedata.normalize("NFKC", v.casefold())
    return v

def canonical_number(v) -> str:
    if not isinstance(v, str) or not NUMERIC_RE.fullmatch(v):
        raise ValueError(f"not a canonical numeric string: {v!r}")
    int_part, _, frac = v.lstrip("-").partition(".")
    frac = frac.rstrip("0")
    body = int_part + ("." + frac if frac else "")
    if body == "0":
        return "0"
    return "-" + body if v.startswith("-") else body

def canonical_date(v) -> str:
    if not isinstance(v, str) or not (m := DATE_RE.fullmatch(v)):
        raise ValueError(f"not a date: {v!r}")
    return date(*map(int, m.groups())).isoformat()      # validates the calendar

def canonical_timestamp(v, declared_zone=None) -> str:
    if not isinstance(v, str) or not (m := TIMESTAMP_RE.fullmatch(v)):
        raise ValueError(f"not a timestamp: {v!r}")
    y, mo, d, h, mi, s, frac, off = m.groups()
    local = datetime(int(y), int(mo), int(d), int(h), int(mi), int(s),
                     int((frac or "").ljust(6, "0")))
    if off is None:
        if not declared_zone:
            raise ValueError("naive timestamp with no declared zone")
        tz = zoneinfo.ZoneInfo(declared_zone)
        early, late = local.replace(tzinfo=tz, fold=0), local.replace(tzinfo=tz, fold=1)
        if early.utcoffset() != late.utcoffset():          # DST gap or overlap
            raise ValueError("local time is ambiguous or nonexistent in the declared zone")
        aware = early
    elif off == "Z":
        aware = local.replace(tzinfo=timezone.utc)
    else:
        sign = 1 if off[0] == "+" else -1
        digits = off[1:].replace(":", "")
        delta = timedelta(hours=int(digits[:2]), minutes=int(digits[2:] or 0))
        aware = local.replace(tzinfo=timezone(sign * delta))
    return aware.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")

def token(v, domain, canon_id, case_insensitive=False, mode="text", declared_zone=None):
    if v is None:
        return None
    for name, value in (("domain", domain), ("canon_id", canon_id)):
        if not isinstance(value, str) or not ID_RE.fullmatch(value):
            raise ValueError(f"{name} must match [a-z0-9]+, got {value!r}")
    c = {"text":      lambda: canonical_text(v, case_insensitive),
         "number":    lambda: canonical_number(v),
         "date":      lambda: canonical_date(v),
         "timestamp": lambda: canonical_timestamp(v, declared_zone)}[mode]()
    payload = b"\x00".join([ENVELOPE_VERSION.encode(), canon_id.encode(),
                            domain.encode(), c.encode("utf-8")])
    return f"{ENVELOPE_VERSION}_{domain}_{crockford128(hmac.new(KEY, payload, hashlib.sha256).digest()[:16])}"

T, N, D, TS = "stdtext1", "stdnum1", "stddate1", "stdtime1"
CASES = [
    # name, input, domain, canon_id, ci, mode, zone, expect_error
    ("domain c",                          "ACME-001", "c", T, False, "text", None, False),
    ("domain t differs from c",           "ACME-001", "t", T, False, "text", None, False),
    ("canonicaliser version differs",     "ACME-001", "c", "stdtext2", False, "text", None, False),
    ("basic trim",                        "  ACME-001  ", "c", T, False, "text", None, False),
    ("NBSP trim",                         "\u00a0ACME-001\u00a0", "c", T, False, "text", None, False),
    ("ideographic space trim",            "\u3000ACME-001\u3000", "c", T, False, "text", None, False),
    ("byte-order mark trim",              "\ufeffACME-001", "c", T, False, "text", None, False),
    ("next-line U+0085 trim",             "ACME-001\u0085", "c", T, False, "text", None, False),
    ("unit separator U+001F kept",        "ACME-001\u001f", "c", T, False, "text", None, False),
    ("NFKC ligature",                     "\ufb01le", "c", T, False, "text", None, False),
    ("NFKC full-width",                   "\uff21\uff23\uff2d\uff25-001", "c", T, False, "text", None, False),
    ("empty string",                      "", "c", T, False, "text", None, False),
    ("null",                              None, "c", T, False, "text", None, False),
    ("eszett ci",                         "Stra\u00dfe", "c", T, True, "text", None, False),
    ("STRASSE ci matches eszett",         "STRASSE", "c", T, True, "text", None, False),
    ("j-caron U+01F0 ci",                 "\u01f0", "c", T, True, "text", None, False),
    ("number integer",                    "100", "n", N, False, "number", None, False),
    ("number trailing zeros",             "100.000000", "n", N, False, "number", None, False),
    ("number 40 digits .1",               "123456789012345678901234567890123456789.1", "n", N, False, "number", None, False),
    ("number 40 digits .2 differs",       "123456789012345678901234567890123456789.2", "n", N, False, "number", None, False),
    ("number negative zero",              "-0.000", "n", N, False, "number", None, False),
    ("number negative",                   "-12.50", "n", N, False, "number", None, False),
    ("reject float value",                1.23, "n", N, False, "number", None, True),
    ("reject exponent",                   "1e2", "n", N, False, "number", None, True),
    ("reject underscores",                "1_000", "n", N, False, "number", None, True),
    ("reject leading dot",                ".5", "n", N, False, "number", None, True),
    ("reject trailing dot",               "100.", "n", N, False, "number", None, True),
    ("reject leading zero",               "007", "n", N, False, "number", None, True),
    ("date",                              "2026-09-21", "d", D, False, "date", None, False),
    ("reject impossible date",            "2026-02-30", "d", D, False, "date", None, True),
    ("timestamp Z",                       "2026-09-21T15:30:00.123456Z", "ts", TS, False, "timestamp", None, False),
    ("timestamp offset equals Z",         "2026-09-21T11:30:00.123456-04:00", "ts", TS, False, "timestamp", None, False),
    ("timestamp postgres text form",      "2026-09-21 15:30:00.123456+00", "ts", TS, False, "timestamp", None, False),
    ("timestamp declared zone",           "2026-09-21T11:30:00.123456", "ts", TS, False, "timestamp", "America/New_York", False),
    ("timestamp short fraction padded",   "2026-09-21T15:30:00.1Z", "ts", TS, False, "timestamp", None, False),
    ("reject naive without zone",         "2026-09-21T15:30:00", "ts", TS, False, "timestamp", None, True),
    ("reject date in timestamp mode",     "2026-09-21", "ts", TS, False, "timestamp", "UTC", True),
    ("reject missing seconds",            "2026-09-21T15:30", "ts", TS, False, "timestamp", "UTC", True),
    ("reject DST overlap",                "2026-11-01T01:30:00", "ts", TS, False, "timestamp", "America/New_York", True),
    ("reject DST gap",                    "2026-03-08T02:30:00", "ts", TS, False, "timestamp", "America/New_York", True),
    ("reject domain with underscore",     "x", "a_b", T, False, "text", None, True),
    ("reject empty domain",               "x", "", T, False, "text", None, True),
]

def main():
    suite = []
    for name, v, dom, canon_id, ci, mode, zone, should_err in CASES:
        entry = {"name": name, "input": v, "domain": dom, "canonId": canon_id,
                 "caseInsensitive": ci, "mode": mode, "declaredZone": zone,
                 "expectError": should_err}
        try:
            result = token(v, dom, canon_id, ci, mode, zone)
            if should_err:
                raise SystemExit(f"vector {name!r} should have been rejected, got {result}")
            entry["token"] = result
        except (ValueError, TypeError):
            if not should_err:
                raise
            entry["token"] = None
        suite.append(entry)
    print(json.dumps(suite, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
