"""What clear, aggregate-only and tokenized answers look like."""
from common import Case, main

CASES = [
    Case("clear projection", "A named clear column returns usable values.", "opintel.query", "OPINTEL_HARNESS_CLEAR_SQL"),
    Case("aggregate-only aggregate", "A permitted aggregate returns an answer; choose a group above the disclosure minimum.", "opintel.query", "OPINTEL_HARNESS_AGGREGATE_SQL"),
    Case("tokenized projection", "Tokens and their restrictions are explained, with reduction metadata intact.", "opintel.query", "OPINTEL_HARNESS_TOKEN_SQL"),
]

if __name__ == "__main__":
    main("treatments", CASES)
