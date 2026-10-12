"""The same cases through LangChain tools, without an LLM selecting cases."""
import os
from common import main, Case
from describe import CASES as DESCRIBE
from treatments import CASES as TREATMENTS
from refusals import CASES as REFUSALS
from joins import CASES as JOINS
from evidence import CASES as EVIDENCE

if __name__ == "__main__":
    custody = [Case("custody response preservation", "LangChain preserves the sealed rows, custody grant bundle and receipt metadata.", "opintel.query", "OPINTEL_HARNESS_CUSTODY_SQL")] if os.environ.get("OPINTEL_HARNESS_CUSTODY_SQL") else []
    main("framework", [*DESCRIBE, *TREATMENTS, *REFUSALS, *JOINS, *EVIDENCE, *custody], framework=True)
