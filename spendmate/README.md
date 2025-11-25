# SpendMate Backend

REST API for ingesting expense images, delegating OCR to the PaddleOCR Flask
service, and persisting results to MongoDB.

## Setup

```bash
cd ~/Desktop/spendmate
source venv/bin/activate
pip install -r requirements.txt  # if new packages were added
```

Create a `.env` file (located alongside `manage.py`) with at least:

```
DJANGO_SECRET_KEY=<generated-secret>
DJANGO_DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=spendmate
MONGODB_COLLECTION=expenses
OCR_SERVICE_URL=http://127.0.0.1:5050/api/ocr
FRONTEND_URL=http://localhost:5173
```

## Run

```bash
source venv/bin/activate
python manage.py runserver 8000
```

Make sure the OCR service (`~/Desktop/spendmate-ocr/app.py`) is running on the
port referenced by `OCR_SERVICE_URL`.

## API

- `POST /api/expenses/upload/`

  Multipart form-data with:
  - `file` (required): receipt or notification image.
  - `user_id` (optional): identifier for the owner.
  - `notes` (optional): free-form memo.

  Response:
  ```json
  {
    "id": "<mongodb id>",
    "ocr": {
      "raw_text": "...",
      "lines": [...],
      "parsed": {
        "source": "bank_alert",
        "merchant": "비에이블스터디",
        "amount": 11000,
        "account": "1002-553-067***",
        "timestamp": "11/02 12:33:11",
        "balance": 1871195
      }
    }
  }
  ```

MongoDB stores the original OCR payload, parsed fields, and metadata for
auditability.

## Smoke Test

1. Start OCR service (`python app.py`) in `~/Desktop/spendmate-ocr`.
2. Start Django server (`python manage.py runserver`).
3. Upload an image:
   ```bash
   curl -X POST http://127.0.0.1:8000/api/expenses/upload/ \
     -F "file=@/Users/pjunese/Downloads/prjtest.jpg"
   ```
4. Verify the response JSON contains `parsed` fields and that the MongoDB
  collection now has a new document.

- `POST /api/expenses/confirm/`

  JSON body:
  ```json
  {
    "document_id": "<mongodb id>",
    "merchant": "상호명",
    "quantity": "2",
    "amount_text": "11,000원",
    "amount_value": 11000,
    "date_text": "2024-11-02",
    "category": "식비",
    "split_mode": "equal",
    "participant_count": 2,
    "custom_share": null
  }
  ```

  Persists the manually selected values back onto the MongoDB document so that
  downstream 리포트/패턴 분석에서 신뢰할 수 있는 데이터를 사용할 수 있습니다.
