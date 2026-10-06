"""Whether a reader can act on refusals, not merely recognise them."""
from common import Case, main

CASES = [
    Case("withheld column named directly", "The refusal names the requested column and gives an actionable reason.", "opintel.query", "OPINTEL_HARNESS_WITHHELD_SQL"),
    Case("aggregate-only row access", "The refusal explains that this column must be aggregated.", "opintel.query", "OPINTEL_HARNESS_AGGREGATE_ROW_SQL"),
    Case("tokenized ordering", "Ordering a tokenized column refuses and explains the restriction.", "opintel.query", "OPINTEL_HARNESS_TOKEN_ORDER_SQL"),
]

if __name__ == "__main__":
    main("refusals", CASES)
