"""An agent receives an evidence reference but has no retrieval tool."""
from common import Case, main

CASES = [Case("answer evidence reference", "A successful answer returns an evidence id. Inspect tools/list for whether the agent can retrieve it; no operator perspective is mixed in.", "opintel.query", "OPINTEL_HARNESS_CLEAR_SQL")]

if __name__ == "__main__":
    main("evidence", CASES)
