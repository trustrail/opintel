"""The same cases through LangChain tools, without an LLM selecting cases."""
from common import main
from describe import CASES as DESCRIBE
from treatments import CASES as TREATMENTS
from refusals import CASES as REFUSALS
from joins import CASES as JOINS
from evidence import CASES as EVIDENCE

if __name__ == "__main__":
    main("framework", [*DESCRIBE, *TREATMENTS, *REFUSALS, *JOINS, *EVIDENCE], framework=True)
