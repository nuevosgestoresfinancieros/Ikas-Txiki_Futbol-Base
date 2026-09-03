"""Preflight and optional unique index for family authorization rows.

The default command is read-only. Applying the index is deliberately explicit
because historical duplicate authorization rows must be reviewed first.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient


CONFIRMATION = "PREPARE-FAMILY-AUTHORIZATION-INDEX"


def duplicate_authorization_groups(collection) -> int:
    rows = list(collection.aggregate([
        {"$match": {"player_id": {"$type": "string", "$ne": ""}, "tipo": {"$type": "string", "$ne": ""}}},
        {"$group": {"_id": {"player_id": "$player_id", "tipo": "$tipo"}, "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$count": "groups"},
    ]))
    return int(rows[0]["groups"]) if rows else 0


def preflight(database) -> dict[str, int]:
    authorizations = database.authorizations
    incomplete = list(authorizations.aggregate([
        {"$group": {"_id": "$player_id", "types": {"$addToSet": "$tipo"}}},
        {"$match": {"_id": {"$type": "string", "$ne": ""}, "$expr": {"$lt": [{"$size": "$types"}, 6]}}},
    ]))
    return {
        "authorizations": authorizations.count_documents({}),
        "authorization_duplicate_groups": duplicate_authorization_groups(authorizations),
        "players_without_six_authorizations": len(incomplete),
    }


def apply_infrastructure(database, report: dict[str, int]) -> None:
    if report["authorization_duplicate_groups"]:
        raise SystemExit("apply_blocked=authorization_duplicate_groups")
    database.authorizations.create_index(
        [("player_id", ASCENDING), ("tipo", ASCENDING)],
        unique=True,
        partialFilterExpression={
            "player_id": {"$type": "string", "$gt": ""},
            "tipo": {"$type": "string", "$gt": ""},
        },
        name="authorizations_player_type_unique_partial",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()
    if args.apply and args.confirm != CONFIRMATION:
        raise SystemExit(f"apply_requires=--confirm {CONFIRMATION}")
    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=5000)
    try:
        database = client[os.environ["DB_NAME"]]
        report = preflight(database)
        for key, value in report.items():
            print(f"{key}={value}")
        print(f"dry_run={str(not args.apply).lower()}")
        if args.apply:
            apply_infrastructure(database, report)
            print("applied=true")
    finally:
        client.close()


if __name__ == "__main__":
    main()
