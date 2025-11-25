from __future__ import annotations

from typing import Any, Dict, List

from .generic import GenericParser


def parse_expense_payload(lines: List[Dict[str, Any]], raw_text: str) -> Dict[str, Any]:
    """가장 기본적인 파서만 실행."""
    parser = GenericParser()
    return parser.parse(lines, raw_text)
