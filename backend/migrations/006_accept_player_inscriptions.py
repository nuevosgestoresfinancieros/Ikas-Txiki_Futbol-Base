"""Acepta de forma trazable las inscripciones vinculadas a jugadores.

La utilidad no se ejecuta durante el despliegue. Por defecto muestra cuántas
inscripciones de la temporada indicada se actualizarían. La escritura exige
una confirmación literal y no modifica fichas de jugadores, familias, equipos
ni inscripciones sin ``player_id``.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--season", default="2026-2027", help="Temporada a regularizar")
    parser.add_argument("--apply", action="store_true", help="Aplicar el cambio")
    parser.add_argument("--confirm", default="", help="Debe ser ACCEPT-PLAYER-INSCRIPTIONS")
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=5000)
    database = client[os.environ["DB_NAME"]]

    base_query = {"temporada": args.season, "player_id": {"$nin": [None, ""]}}
    pending_query = {**base_query, "estado": {"$ne": "aceptada"}}
    report = {
        "season": args.season,
        "linked_inscriptions": database.inscriptions.count_documents(base_query),
        "already_accepted": database.inscriptions.count_documents({**base_query, "estado": "aceptada"}),
        "to_accept": database.inscriptions.count_documents(pending_query),
        "unlinked_inscriptions_not_touched": database.inscriptions.count_documents({
            "temporada": args.season, "$or": [{"player_id": {"$exists": False}}, {"player_id": None}, {"player_id": ""}],
        }),
        "dry_run": not args.apply,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if not args.apply:
        client.close()
        return
    if args.confirm != "ACCEPT-PLAYER-INSCRIPTIONS":
        raise SystemExit("Para aplicar use --confirm ACCEPT-PLAYER-INSCRIPTIONS")

    timestamp = now_iso()
    result = database.inscriptions.update_many(
        pending_query,
        {"$set": {"estado": "aceptada", "updated_at": timestamp}},
    )
    database.inscription_status_audit.insert_one({
        "action": "accept_linked_player_inscriptions",
        "season": args.season,
        "at": timestamp,
        "matched": result.matched_count,
        "modified": result.modified_count,
        "previous_statuses_excluded": ["aceptada"],
    })
    print(json.dumps({"applied": True, "modified": result.modified_count}, ensure_ascii=False))
    client.close()


if __name__ == "__main__":
    main()
