"""Different-domain equality joins refuse in explain and query."""
from common import Case, main

CASES = [
    Case("different-domain join explain", "Refuses, names both columns and points to administrator-assigned shared tokenization without exposing domain strings.", "opintel.explain", "OPINTEL_HARNESS_JOIN_SQL"),
    Case("different-domain join query", "Refuses instead of returning a misleading empty answer, with actionable content and metadata.", "opintel.query", "OPINTEL_HARNESS_JOIN_SQL"),
]

if __name__ == "__main__":
    main("joins", CASES)
