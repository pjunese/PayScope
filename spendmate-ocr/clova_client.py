from __future__ import annotations

import io
import json
import os
import time
import uuid
from typing import Any, Dict, List

import requests
from dotenv import load_dotenv
from PIL import Image

from parsers import parse_expense_payload
from parsers.utils import normalize_text

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))


def _get_config() -> tuple[str | None, str | None]:
    endpoint = os.getenv("CLOVA_OCR_ENDPOINT")
    secret = os.getenv("CLOVA_OCR_SECRET")
    return endpoint, secret


def clova_available() -> bool:
    endpoint, secret = _get_config()
    return bool(endpoint and secret)


def _serialize_lines(data: Dict[str, Any]) -> tuple[List[Dict[str, Any]], str]:
    raw_lines: List[str] = []
    serialized: List[Dict[str, Any]] = []
    for image_entry in data.get("images", []):
        for field in image_entry.get("fields", []):
            text = normalize_text(field.get("inferText", ""))
            confidence = field.get("inferConfidence")
            bbox = None
            vertices = field.get("boundingPoly", {}).get("vertices") or []
            if vertices:
                bbox = [[vertex.get("x"), vertex.get("y")] for vertex in vertices]
            serialized.append(
                {
                    "text": text,
                    "confidence": confidence,
                    "bbox": bbox,
                }
            )
            if text:
                raw_lines.append(text)
    return serialized, "\n".join(raw_lines)


def run_clova_ocr(image: Image.Image) -> Dict[str, Any]:
    endpoint, secret = _get_config()
    if not endpoint or not secret:
        raise RuntimeError("Clova OCR 환경 변수가 설정되지 않았습니다.")

    buffer = io.BytesIO()
    quality = int(os.getenv("CLOVA_OCR_JPEG_QUALITY", "90"))
    image.save(buffer, format="JPEG", quality=quality)
    buffer.seek(0)

    boundary_filename = f"upload-{uuid.uuid4().hex}.jpg"
    payload = {
        "version": os.getenv("CLOVA_OCR_VERSION", "V2"),
        "requestId": uuid.uuid4().hex,
        "timestamp": int(time.time() * 1000),
        "images": [
            {
                "format": "jpg",
                "name": boundary_filename,
            }
        ],
    }

    files = {
        "file": (boundary_filename, buffer.read(), "application/octet-stream"),
        "message": (None, json.dumps(payload), "application/json"),
    }

    headers = {
        "X-OCR-SECRET": secret,
    }
    timeout = float(os.getenv("CLOVA_OCR_TIMEOUT", "15"))
    response = requests.post(endpoint, headers=headers, files=files, timeout=timeout)
    if not response.ok:
        raise RuntimeError(f"Clova OCR 요청 실패({response.status_code})")

    data = response.json()
    lines, raw_text = _serialize_lines(data)
    if not lines:
        raise RuntimeError("Clova OCR 응답에서 텍스트를 찾을 수 없습니다.")

    parsed = parse_expense_payload(lines, raw_text)
    debug = {
        "engine": "clova",
        "inferResult": [img.get("inferResult") for img in data.get("images", [])],
    }
    return {"raw_text": raw_text, "lines": lines, "parsed": parsed, "debug": debug}
