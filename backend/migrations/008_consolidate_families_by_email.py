"""Consolida familias duplicadas que comparten exactamente el mismo correo.

La importación histórica puede crear una ficha familiar por jugador. Esta
herramienta selecciona una ficha canónica por correo, reasigna jugadores,
inscripciones y una posible cuenta familiar, archiva las fichas retiradas y
solo entonces las elimina de ``families``. Por defecto funciona en vista
previa y bloquea por completo cualquier grupo con más de una cuenta familiar.
"""
from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient


CONTACT_FIELDS = (
    "progenitor1_nombre", "progenitor1_telefono", "progenitor1_email",
    "progenitor2_nombre", "progenitor2_telefono", "progenitor2_email",
    "domicilio", "contacto_principal", "preferencia_comunicacion", "observaciones",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def email_key(value: object) -> str:
    return str(value or "").strip().lower()


def family_email(family: dict) -> str:
    for field in ("progenitor1_email", "progenitor2_email"):
        value = email_key(family.get(field))
        if "@" in value:
            return value
    return ""


def pick_canonical(families: list[dict], family_users: dict[str, list[dict]]) -> dict:
    with_account = [family for family in families if family_users.get(str(family.get("id")))]
    source = with_account or families
    return sorted(source, key=lambda row: (str(row.get("created_at") or ""), str(row.get("id") or "")))[0]


def merged_family(canonical: dict, duplicates: list[dict], timestamp: str) -> dict:
    update = {field: canonical.get(field) for field in CONTACT_FIELDS}
    for duplicate in duplicates:
        for field in CONTACT_FIELDS:
            if not str(update.get(field) or "").strip() and str(duplicate.get(field) or "").strip():
                update[field] = duplicate[field]
    update["updated_at"] = timestamp
    return update


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Aplicar la consolidación")
    parser.add_argument("--confirm", default="", help="Debe ser CONSOLIDATE-FAMILIES-BY-EMAIL")
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=5000)
    database = client[os.environ["DB_NAME"]]
    families = list(database.families.find({}, {"_id": 0}))
    users = list(database.users.find({"role": "family"}, {"_id": 0, "id": 1, "family_id": 1, "username": 1, "account_status": 1}))
    users_by_family: dict[str, list[dict]] = defaultdict(list)
    for user in users:
        if user.get("family_id"):
            users_by_family[str(user["family_id"])].append(user)
    groups: dict[str, list[dict]] = defaultdict(list)
    for family in families:
        if (email := family_email(family)):
            groups[email].append(family)

    plans, conflicts = [], []
    for email, group in sorted(groups.items()):
        if len(group) < 2:
            continue
        group_users = [user for family in group for user in users_by_family.get(str(family.get("id")), [])]
        if len(group_users) > 1:
            conflicts.append({
                "email": email, "family_ids": [family.get("id") for family in group],
                "usernames": [user.get("username") for user in group_users],
                "reason": "multiple_family_accounts",
            })
            continue
        canonical = pick_canonical(group, users_by_family)
        duplicates = [family for family in group if family.get("id") != canonical.get("id")]
        plans.append({"email": email, "canonical": canonical, "duplicates": duplicates, "user": group_users[0] if group_users else None})

    report = {
        "families_total": len(families),
        "email_groups": len(groups),
        "duplicate_groups": len(plans) + len(conflicts),
        "groups_ready_to_consolidate": len(plans),
        "families_to_archive": sum(len(plan["duplicates"]) for plan in plans),
        "conflicts": conflicts,
        "sample": [{
            "email": plan["email"], "canonical_family_id": plan["canonical"].get("id"),
            "duplicates": [item.get("id") for item in plan["duplicates"]],
        } for plan in plans[:10]],
        "dry_run": not args.apply,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not args.apply:
        client.close()
        return
    if args.confirm != "CONSOLIDATE-FAMILIES-BY-EMAIL":
        raise SystemExit("Para aplicar use --confirm CONSOLIDATE-FAMILIES-BY-EMAIL")
    if conflicts:
        raise SystemExit("No se aplica una consolidación parcial: resuelva primero los conflicts")

    timestamp = now_iso()
    archived = moved_players = moved_inscriptions = moved_users = 0
    for plan in plans:
        canonical_id = str(plan["canonical"]["id"])
        duplicate_ids = [str(item["id"]) for item in plan["duplicates"]]
        family_ids = [canonical_id, *duplicate_ids]
        player_ids = [str(item["id"]) for item in database.players.find(
            {"familia_id": {"$in": family_ids}}, {"_id": 0, "id": 1}
        ) if item.get("id")]
        database.families.update_one(
            {"id": canonical_id}, {"$set": merged_family(plan["canonical"], plan["duplicates"], timestamp)}
        )
        if duplicate_ids:
            moved_players += database.players.update_many(
                {"familia_id": {"$in": duplicate_ids}}, {"$set": {"familia_id": canonical_id, "updated_at": timestamp}}
            ).modified_count
            moved_inscriptions += database.inscriptions.update_many(
                {"familia_id": {"$in": duplicate_ids}}, {"$set": {"familia_id": canonical_id, "updated_at": timestamp}}
            ).modified_count
        if plan["user"]:
            moved_users += database.users.update_one(
                {"id": plan["user"]["id"]},
                {"$set": {"family_id": canonical_id, "linked_player_ids": player_ids, "updated_at": timestamp}},
            ).modified_count
        for duplicate in plan["duplicates"]:
            database.family_duplicate_archive.insert_one({
                "action": "consolidate_by_email", "at": timestamp, "canonical_family_id": canonical_id,
                "email": plan["email"], "document": duplicate,
            })
        if duplicate_ids:
            archived += database.families.delete_many({"id": {"$in": duplicate_ids}}).deleted_count

    database.family_consolidation_audit.insert_one({
        "action": "consolidate_families_by_email", "at": timestamp,
        "groups": len(plans), "families_archived": archived, "players_moved": moved_players,
        "inscriptions_moved": moved_inscriptions, "users_updated": moved_users,
    })
    print(json.dumps({"applied": True, "groups": len(plans), "families_archived": archived, "players_moved": moved_players, "inscriptions_moved": moved_inscriptions, "users_updated": moved_users}, ensure_ascii=False))
    client.close()


if __name__ == "__main__":
    main()
