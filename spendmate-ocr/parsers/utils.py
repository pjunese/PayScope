import re
import unicodedata
from typing import Dict, List, Optional


def extract_amount(text: str) -> Optional[int]:
    match = re.search(r"(\d{1,3}(?:,\d{3})*)(?=\s*원)", text)
    if not match:
        return None
    return int(match.group(1).replace(",", ""))


def extract_account(text: str) -> Optional[str]:
    match = re.search(r"\d{3,4}-\d{3}-\d{3,4}\*+", text)
    if match:
        return match.group(0)
    match = re.search(r"\d{3,4}-\d{3}-\d{3,4}", text)
    if match:
        return match.group(0)
    return None


def extract_datetime(text: str) -> Optional[str]:
    patterns = [
        re.compile(r"(\d{1,2}/\d{1,2})\s*(\d{1,2}:\d{2}:\d{2})"),
        re.compile(r"(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2}:\d{2})"),
        re.compile(r"(\d{4}\.\d{2}\.\d{2})\s*(\d{2}:\d{2}:\d{2})"),
        re.compile(r"(\d{4})(\d{2})(\d{2})[T\s]*(\d{2})(\d{2})(\d{2})"),
    ]

    for pattern in patterns:
        match = pattern.search(text)
        if match:
            groups = match.groups()
            if len(groups) == 2:
                date, time = groups
                return f"{date} {time}"
            if len(groups) == 6:
                y, m, d, hh, mm, ss = groups
                return f"{y}-{m}-{d} {hh}:{mm}:{ss}"
    return None


def longest_hangul_line(lines: List[Dict[str, str]]) -> Optional[str]:
    hangul_lines = [
        line["text"] for line in lines if re.search(r"[가-힣]", line["text"])
    ]
    hangul_lines.sort(key=len, reverse=True)
    return hangul_lines[0].strip() if hangul_lines else None


_ALLOWED_CHARS_PATTERN = re.compile(r"[^0-9A-Za-z가-힣\[\]\(\)\-.,:/*\s]")


def normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text or "")
    normalized = _ALLOWED_CHARS_PATTERN.sub(" ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"(?<=[가-힣])\s+(?=[가-힣])", "", normalized)
    normalized = re.sub(r"(?<=\d)\s+(?=\d)", "", normalized)
    return normalized.strip()


def last_number(text: str) -> Optional[int]:
    matches = re.findall(r"\d[\d,\.]{0,10}", text)
    for token in reversed(matches):
        digits = re.sub(r"[^0-9]", "", token)
        if not digits:
            continue
        try:
            value = int(digits)
        except ValueError:
            continue
        if value:
            return value
    return None
