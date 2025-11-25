"""
Quick-and-dirty dummy data seeder for Mongo expenses.

Usage:
  export DJANGO_SETTINGS_MODULE=spendmate.settings  # optional if running via manage.py shell
  python seed_dummy_expenses.py --user-id <mongo_user_id> --count 50

Notes:
- Respects MONGODB_URI / DB / COLLECTION from settings or environment.
- Creates confirmed expenses with selection.amount_value and selection.date_text set.
- Dates are spread across the last 90 days.
"""

from __future__ import annotations

import argparse
import os
import random
from datetime import datetime, timedelta

from django.conf import settings
from django.utils import timezone
from dotenv import load_dotenv
from pymongo import MongoClient


def get_env_settings():
  load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
  uri = os.getenv("MONGODB_URI") or getattr(settings, "MONGODB_URI", None)
  db_name = os.getenv("MONGODB_DB_NAME") or getattr(settings, "MONGODB_DB_NAME", "spendmate")
  collection = os.getenv("MONGODB_COLLECTION") or getattr(settings, "MONGODB_COLLECTION", "expenses")
  if not uri:
    raise SystemExit("MONGODB_URI가 설정되지 않았습니다.")
  return uri, db_name, collection


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--user-id", required=True, help="몽고DB expenses 문서에 저장될 user_id (문자열)")
  parser.add_argument("--count", type=int, default=50, help="생성할 더미 문서 수")
  args = parser.parse_args()

  uri, db_name, collection_name = get_env_settings()
  client = MongoClient(uri)
  collection = client[db_name][collection_name]

  now = timezone.now()
  docs = []
  categories = ["식비", "카페/간식", "교통", "쇼핑", "기타"]
  merchants = ["Blue Bottle", "Starbucks", "GS25", "CU", "배달의민족", "카카오모빌리티", "무신사", "쿠팡"]

  for _ in range(args.count):
    days_ago = random.randint(0, 89)
    dt = now - timedelta(days=days_ago)
    amount = random.randint(3000, 45000)
    merchant = random.choice(merchants)
    category = random.choice(categories)
    doc = {
      "user_id": str(args.user_id),
      "notes": "dummy",
      "parsed": {},
      "created_at": dt,
      "status": "confirmed",
      "ocr": {},
      "selection_date": dt,
      "confirmed_at": dt,
      "selection": {
        "merchant": merchant,
        "quantity": "1",
        "amount_text": f"{amount:,}원",
        "amount_value": amount,
        "date_text": dt.date().isoformat(),
        "category": category,
        "split_mode": "equal",
        "participant_count": 1,
        "custom_share": None,
      },
    }
    docs.append(doc)

  if not docs:
    print("생성할 문서가 없습니다.")
    return

  result = collection.insert_many(docs)
  print(f"Inserted {len(result.inserted_ids)} dummy expenses into {db_name}.{collection_name}")


if __name__ == "__main__":
  main()
