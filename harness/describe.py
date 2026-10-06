"""What this pool can discover through MCP."""
from common import Case, main

CASES = [Case("describe this pool", "Objects and treatments available to this pool are intelligible.", "opintel.describe")]

if __name__ == "__main__":
    main("describe", CASES)
