from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from .utils import extract_account, extract_amount, extract_datetime


class BankAlertParser:
    """Parser for Korean bank push notification screenshots."""

    name = "bank_alert"
    KEYWORDS = ("입금", "출금", "잔액", "계좌", "WON")

    def supports(self, lines: List[Dict[str, Any]], raw_text: str) -> bool:
        normalized = raw_text.replace("\n", " ")
        return any(keyword in normalized for keyword in self.KEYWORDS)

    def parse(self, lines: List[Dict[str, Any]], raw_text: str) -> Dict[str, Any]:
        combined = " ".join(line["text"] for line in lines)
        amount = None
        account = None
        timestamp = None
        balance = None
        merchant = None

        for idx, line in enumerate(lines):
            text = line.get("text", "")

            if amount is None:
                amount = extract_amount(text)
            if account is None:
                account = extract_account(text)
            if timestamp is None:
                timestamp = extract_datetime(text)
            if balance is None and "잔액" in text and idx + 1 < len(lines):
                balance = extract_amount(lines[idx + 1].get("text", ""))

            if merchant is None and any(token in text for token in ("[출금]", "[입금]")):
                merchant = self._clean_merchant(lines, idx + 1)

        if timestamp is None:
            timestamp = extract_datetime(combined)
        if balance is None:
            balance = extract_amount(combined.split("잔액")[-1]) if "잔액" in combined else None
        if merchant is None:
            merchant = self._fallback_merchant(lines)

        return {
            "source": self.name,
            "merchant": merchant,
            "amount": amount,
            "account": account,
            "timestamp": timestamp,
            "balance": balance,
        }

    def _clean_merchant(self, lines: List[Dict[str, Any]], next_index: int) -> Optional[str]:
        if next_index >= len(lines):
            return None
        candidate = lines[next_index].get("text", "")
        candidate = re.sub(r"\d|[*·.,]", "", candidate)
        candidate = candidate.replace("원", "").strip()
        candidate = re.sub(r"\s+", " ", candidate)
        return candidate or None

    def _fallback_merchant(self, lines: List[Dict[str, Any]]) -> Optional[str]:
        for line in lines:
            text = line.get("text", "")
            if re.search(r"[가-힣]", text) and not extract_amount(text):
                cleaned = re.sub(r"\d|[*·.,]", "", text).strip()
                if cleaned:
                    return cleaned
        return None
