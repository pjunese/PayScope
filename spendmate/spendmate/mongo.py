from __future__ import annotations

from typing import Optional

from django.conf import settings
from pymongo import MongoClient

_mongo_client: Optional[MongoClient] = None


def get_mongo_client() -> MongoClient:
    """Return a singleton MongoDB client bound to the configured URI."""
    global _mongo_client
    if _mongo_client is None:
        if not settings.MONGODB_URI:
            raise RuntimeError("MONGODB_URI is not configured. Update your .env file.")
        _mongo_client = MongoClient(settings.MONGODB_URI)
    return _mongo_client


def get_collection(name: str):
    """Fetch a named collection from the configured Mongo database."""
    client = get_mongo_client()
    db_name = settings.MONGODB_DB_NAME or "spendmate"
    return client[db_name][name]
