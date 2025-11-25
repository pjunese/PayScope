from __future__ import annotations

from typing import Dict, List

from .utils import extract_account, extract_amount, extract_datetime, longest_hangul_line


class GenericParser:
    """최소한의 규칙으로 공통 필드를 추출하는 기본 파서."""

    name = "basic"

    def parse(self, lines: List[Dict[str, Any]], raw_text: str) -> Dict[str, Any]:
        combined = (raw_text or "").replace("\n", " ")

        amount = extract_amount(combined)
        account = extract_account(combined)
        timestamp = extract_datetime(combined)
        merchant = longest_hangul_line(lines)

        return {
            "source": self.name,
            "merchant": merchant,
            "amount": amount,
            "account": account,
            "timestamp": timestamp,
            "balance": None,
        }
