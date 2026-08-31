"""Preflight y estructura conservadora para accesos familiares independientes.

Por defecto solo lee y muestra contadores agregados. ``--apply`` no etiqueta ni
modifica familias o cuentas históricas: crea índices parciales para documentos
nuevos y deja el modo global en ``manual``.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient


CONFIRMATION = "PREPARE-FAMILY-ACCESS-INFRASTRUCTURE"


def aggregate_duplicate_count(users) -> int:
    rows = list(users.aggregate([
        {"$match": {"email_normalized": {"$type": "string", "$ne": ""}}},
        {"$group": {"_id": "$email_normalized", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
        {"$count": "groups"},
    ]))
    return int(rows[0]["groups"]) if rows else 0


def preflight(database) -> dict[str, int]:
    users, families = database.users, database.families
    return {
        "families": families.count_documents({}),
        "family_accounts": users.count_documents({"role": "family"}),
        "family_accounts_without_family": users.count_documents({
            "role": "family", "$or": [{"family_id": None}, {"family_id": {"$exists": False}}],
        }),
        "family_accounts_with_slot": users.count_documents({
            "role": "family", "family_contact_slot": {"$in": [1, 2]},
        }),
        "active_family_accounts": users.count_documents({
            "role": "family", "account_status": "active", "active": {"$ne": False},
        }),
        "pending_family_accounts": users.count_documents({
            "role": "family", "account_status": "pending_activation",
        }),
        "duplicate_normalized_email_groups": aggregate_duplicate_count(users),
    }


def apply_infrastructure(database, report: dict[str, int]) -> None:
    if report["duplicate_normalized_email_groups"]:
        raise SystemExit("apply_blocked=duplicate_normalized_email_groups")
    users = database.users
    users.create_index(
        [("email_normalized", ASCENDING)], unique=True,
        partialFilterExpression={"email_normalized": {"$type": "string", "$gt": ""}},
        name="users_email_normalized_unique_partial",
    )
    users.create_index(
        [("family_id", ASCENDING), ("family_contact_slot", ASCENDING)], unique=True,
        partialFilterExpression={"family_contact_slot": {"$in": [1, 2]}},
        name="users_family_contact_slot_unique_partial",
    )
    users.create_index(
        [("provisioning_key", ASCENDING)], unique=True,
        partialFilterExpression={"provisioning_key": {"$type": "string", "$gt": ""}},
        name="users_provisioning_key_unique_partial",
    )
    database.family_access_jobs.create_index(
        [("idempotency_key", ASCENDING)], unique=True, name="family_access_job_idempotency_unique",
    )
    database.family_access_jobs.create_index(
        [("status", ASCENDING), ("next_attempt_at", ASCENDING), ("lease_expires_at", ASCENDING)],
        name="family_access_job_claim",
    )
    database.family_access_campaigns.create_index([("id", ASCENDING)], unique=True, name="family_access_campaign_id_unique")
    database.family_access_rate_limits.create_index([("created_at", ASCENDING)], expireAfterSeconds=7200, name="family_access_rate_ttl")
    database.settings.update_one({"id": "global"}, {"$setOnInsert": {"id": "global"}, "$set": {
        "family_access_provisioning.mode": "manual",
        "family_access_provisioning.updated_at": None,
        "family_access_provisioning.updated_by_user_id": None,
    }}, upsert=True)


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
            print("historical_documents_modified=0")
            print("family_access_mode=manual")
    finally:
        client.close()


if __name__ == "__main__":
    main()

