import io
import math
import os
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from paddleocr import PaddleOCR
from PIL import Image
from werkzeug.utils import secure_filename

from clova_client import clova_available, run_clova_ocr
from parsers import parse_expense_payload
from parsers.utils import normalize_text

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(APP_ROOT, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
load_dotenv(os.path.join(APP_ROOT, ".env"))
USE_CLOVA = os.getenv("USE_CLOVA", "true").lower() == "true"

# Lazy load OCR model so server startup stays light.
ocr_model: PaddleOCR | None = None


def get_ocr() -> PaddleOCR:
    global ocr_model
    if ocr_model is None:
        lang = os.getenv("OCR_LANG", "korean")  # default to Korean receipts
        ocr_args: Dict[str, Any] = {
            "use_textline_orientation": True,
            "use_doc_unwarping": False,
            "use_doc_orientation_classify": False,
            "lang": lang,
            "ocr_version": os.getenv("OCR_VERSION", "PP-OCRv5"),
        }
        ocr_model = PaddleOCR(**ocr_args)
    return ocr_model


def build_response(raw_result: List[Any], meta: Dict[str, Any] | None = None) -> Dict[str, Any]:
    """Convert PaddleOCR output into 기본 형태의 SpendMate 응답 스키마."""
    if not raw_result:
        parsed = parse_expense_payload([], "")
        payload: Dict[str, Any] = {"raw_text": "", "lines": [], "parsed": parsed}
        if meta:
            payload["debug"] = meta
        return payload

    first = raw_result[0]
    lines: List[Dict[str, Any]] = []

    if isinstance(first, dict):
        texts = first.get("rec_texts", [])
        scores = first.get("rec_scores", [])
        boxes = first.get("rec_polys") or first.get("rec_boxes") or []
        normalized_texts = [normalize_text(text) for text in texts]
        for idx, text in enumerate(normalized_texts):
            score = float(scores[idx]) if idx < len(scores) else None
            bbox = boxes[idx] if idx < len(boxes) else None
            if hasattr(bbox, "tolist"):
                bbox = bbox.tolist()
            lines.append({"text": text, "confidence": score, "bbox": bbox})
        raw_text = "\n".join(normalized_texts)
    else:
        # Legacy format: list of [box, (text, score)]
        total_text = []
        for line in first:
            text = normalize_text(line[1][0])
            confidence = float(line[1][1])
            bbox = line[0]
            if hasattr(bbox, "tolist"):
                bbox = bbox.tolist()
            lines.append({"text": text, "confidence": confidence, "bbox": bbox})
            total_text.append(text)
        raw_text = "\n".join(total_text)

    parsed = parse_expense_payload(lines, raw_text)
    payload = {"raw_text": raw_text, "lines": lines, "parsed": parsed}
    if meta:
        payload["debug"] = meta
    return payload


def generate_variants(image: Image.Image) -> List[Tuple[str, np.ndarray]]:
    rgb = np.array(image.convert("RGB"))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)

    variants: List[Tuple[str, np.ndarray]] = [("original", bgr)]

    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)
    sharpen_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    sharpened = cv2.filter2D(clahe, -1, sharpen_kernel)
    clahe_bgr = cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)
    variants.append(("clahe", clahe_bgr))

    blur = cv2.GaussianBlur(sharpened, (3, 3), 0)
    adaptive = cv2.adaptiveThreshold(
        blur,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        8,
    )
    adaptive_bgr = cv2.cvtColor(adaptive, cv2.COLOR_GRAY2BGR)
    variants.append(("adaptive", adaptive_bgr))

    return variants


def _extract_texts_and_scores(raw_result: List[Any]) -> Tuple[List[str], List[float]]:
    if not raw_result:
        return [], []
    first = raw_result[0]
    if isinstance(first, dict):
        texts = first.get("rec_texts", [])
        scores = [float(s) for s in first.get("rec_scores", [])]
    else:
        texts = [item[1][0] for item in first]
        scores = [float(item[1][1]) for item in first]
    return texts, scores


def score_result(raw_result: List[Any]) -> float:
    texts, scores = _extract_texts_and_scores(raw_result)
    if not scores:
        return 0.0
    avg_score = sum(scores) / len(scores)
    total_chars = sum(len(text) for text in texts)
    non_empty = len([text for text in texts if text.strip()])
    char_bonus = min(total_chars, 240) / 240 * 0.5
    line_bonus = min(non_empty, 20) / 20 * 0.3
    return avg_score + char_bonus + line_bonus


def run_ocr_with_variants(image: Image.Image) -> Tuple[List[Any], Dict[str, Any]]:
    ocr = get_ocr()
    variants = generate_variants(image)
    best_result: List[Any] | None = None
    best_score = -math.inf
    best_name = None
    diagnostics: List[Dict[str, Any]] = []

    for name, variant in variants:
        try:
            result = ocr.ocr(variant)
        except Exception as exc:  # noqa: BLE001
            diagnostics.append({"variant": name, "error": str(exc)})
            continue

        score = score_result(result)
        texts, scores = _extract_texts_and_scores(result)
        diagnostics.append(
            {
                "variant": name,
                "score": score,
                "lines": len(texts),
                "average_confidence": sum(scores) / len(scores) if scores else 0.0,
            }
        )

        if score > best_score and result:
            best_score = score
            best_result = result
            best_name = name

    meta = {"variant": best_name, "variants": diagnostics}
    return best_result or [], meta


def ocr_image(image: Image.Image) -> Dict[str, Any]:
    clova_errors: List[str] = []
    if USE_CLOVA and clova_available():
        try:
            return run_clova_ocr(image)
        except Exception as exc:  # noqa: BLE001
            clova_errors.append(str(exc))

    result, meta = run_ocr_with_variants(image)
    combined_meta = {**(meta or {}), "engine": "paddle"}
    payload = build_response(result, combined_meta)
    if clova_errors:
        debug = payload.setdefault("debug", {})
        debug["clova_errors"] = clova_errors
    return payload


def create_app() -> Flask:
    app = Flask(__name__)

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "ok"}), 200

    @app.route("/api/ocr", methods=["POST"])
    def process_receipt():
        if "file" not in request.files:
            return jsonify({"error": "file field required"}), 400
        file_storage = request.files["file"]
        if file_storage.filename == "":
            return jsonify({"error": "empty filename"}), 400

        filename = secure_filename(file_storage.filename)
        buffer = io.BytesIO(file_storage.read())
        buffer.seek(0)
        try:
            with Image.open(buffer) as img:
                img = img.convert("RGB")
                ocr_result = ocr_image(img)
        except Exception as exc:  # noqa: BLE001
            return jsonify({"error": f"invalid image: {exc}"}), 400

        # Optional: persist upload for debugging (disabled by default).
        if os.getenv("SAVE_UPLOADS", "false").lower() == "true":
            buffer.seek(0)
            with open(os.path.join(UPLOAD_DIR, filename), "wb") as out_file:
                out_file.write(buffer.read())

        return jsonify(ocr_result), 200

    return app


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5050"))
    app = create_app()
    app.run(host="0.0.0.0", port=port)
