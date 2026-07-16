"""Migración conservadora e idempotente para usuarios RBAC.

Por defecto solo informa. Use ``--apply`` para escribir cambios.
No asigna permisos elevados a usuarios cuyo vínculo no pueda demostrarse.
"""
from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import ASCENDING, MongoClient


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Aplicar la migración")
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    admin_user = os.environ.get("ADMIN_USER")
    if not admin_user:
        raise SystemExit("ADMIN_USER no está configurado")
    client = MongoClient(os.environ["MONGO_URL"])
    users = client[os.environ["DB_NAME"]]["users"]
    now = datetime.now(timezone.utc).isoformat()

    admin_match = users.find_one({"username": admin_user})
    legacy = list(users.find({"username": {"$ne": admin_user}, "role": {"$exists": False}}, {"username": 1}))
    print(f"administrative_user_found={bool(admin_match)}")
    print(f"legacy_users_to_disable={len(legacy)}")
    if not args.apply:
        print("dry_run=true")
        client.close()
        return

    if admin_match:
        users.update_one(
            {"_id": admin_match["_id"]},
            {"$set": {
                "role": "admin", "active": True, "assigned_team_ids": [],
                "language": admin_match.get("language", "es"),
                "notification_preferences": admin_match.get("notification_preferences", {}),
                "updated_at": now,
            }},
        )
    users.update_many(
        {"username": {"$ne": admin_user}, "role": {"$exists": False}},
        {"$set": {
            "role": "player", "active": False, "assigned_team_ids": [],
            "language": "es", "notification_preferences": {}, "updated_at": now,
        }},
    )
    users.create_index([("username", ASCENDING)], unique=True, name="users_username_unique")
    users.create_index([("id", ASCENDING)], unique=True, sparse=True, name="users_id_unique")
    users.create_index([("role", ASCENDING), ("active", ASCENDING)], name="users_role_active")
    users.create_index([("assigned_team_ids", ASCENDING)], name="users_assigned_teams")
    users.create_index([("player_id", ASCENDING)], sparse=True, name="users_player")
    users.create_index([("family_id", ASCENDING)], sparse=True, name="users_family")
    print("applied=true")
    client.close()


if __name__ == "__main__":
    main()
