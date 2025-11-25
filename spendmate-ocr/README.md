# SpendMate OCR Service

Lightweight Flask wrapper around OCR engines that exposes a `/api/ocr` endpoint for
the SpendMate backend. If NAVER Clova credentials are provided the service will
prefer Clova OCR first and fall back to PaddleOCR only when necessary.

## Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Set optional environment variables in a local `.env` file:

```
OCR_LANG=korean   # default
PORT=5000
SAVE_UPLOADS=false
CLOVA_OCR_ENDPOINT=https://.../general
CLOVA_OCR_SECRET=your-secret
CLOVA_OCR_TIMEOUT=15
```

## Run

```bash
source venv/bin/activate
python app.py
```

The service provides:
- `GET /health` — readiness check.
- `POST /api/ocr` — multipart form upload (`file` field). Returns JSON with merged
  text (`raw_text`) and per-line records including bounding boxes and confidence.

## Quick Test

```bash
curl -X POST http://localhost:5000/api/ocr \
  -F "file=@/path/to/receipt.jpg"
```

The response includes `raw_text` and `lines` that Django can transform into the
SpendMate expense schema.
