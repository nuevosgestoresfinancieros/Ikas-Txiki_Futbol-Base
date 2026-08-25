"""Promueve la equipación actual importada al conjunto principal.

Las importaciones históricas anteriores guardaron ``equipment_current`` en el
campo ``segunda_equipacion``. Esta herramienta corrige únicamente esos
registros importados: lleva nombre, dorsal y tallas al conjunto principal,
vacía la segunda equipación mal clasificada y conserva una copia de reversión
en ``equipment_primary_promotion_audit``. Por defecto solo muestra el plan.
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


def text(value: object) -> str:
    return str(value or "").strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Aplicar el cambio")
    parser.add_argument("--confirm", default="", help="Debe ser PROMOTE-PRIMARY-EQUIPMENT")
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=5000)
    database = client[os.environ["DB_NAME"]]

    query = {
        "historical_import_job_id": {"$exists": True, "$nin": [None, ""]},
        "segunda_equipacion": {"$type": "object"},
    }
    candidates = list(database.players.find(query, {
        "_id": 0, "id": 1, "nombre": 1, "apellidos": 1, "dorsal": 1,
        "nombre_camiseta": 1, "talla_camiseta": 1, "talla_medias": 1,
        "segunda_equipacion": 1,
    }))
    planned, conflicts = [], []
    for player in candidates:
        second = player.get("segunda_equipacion") or {}
        if not isinstance(second, dict) or not any(text(second.get(key)) for key in ("shirt_name", "number", "shirt_size", "socks_size")):
            continue
        # Existing principal values may be manually entered and must never be
        # overwritten by this historical correction.
        if text(player.get("dorsal")) or text(player.get("nombre_camiseta")):
            conflicts.append({"id": player.get("id"), "name": f"{player.get('nombre', '')} {player.get('apellidos', '')}".strip()})
            continue
        planned.append(player)

    report = {
        "historical_candidates": len(candidates),
        "players_to_promote": len(planned),
        "conflicts_not_touched": conflicts,
        "second_equipment_cleared": len(planned),
        "dry_run": not args.apply,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if not args.apply:
        client.close()
        return
    if args.confirm != "PROMOTE-PRIMARY-EQUIPMENT":
        raise SystemExit("Para aplicar use --confirm PROMOTE-PRIMARY-EQUIPMENT")
    if conflicts:
        raise SystemExit("No se aplica un lote parcial: revise conflicts_not_touched")

    timestamp = now_iso()
    audit_rows = []
    for player in planned:
        second = player["segunda_equipacion"]
        before = {
            key: player.get(key)
            for key in ("dorsal", "nombre_camiseta", "talla_camiseta", "talla_medias", "segunda_equipacion")
        }
        update = {
            "nombre_camiseta": text(second.get("shirt_name")) or None,
            "dorsal": text(second.get("number")) or None,
            "talla_camiseta": text(second.get("shirt_size")) or player.get("talla_camiseta"),
            "talla_medias": text(second.get("socks_size")) or player.get("talla_medias"),
            "segunda_equipacion": {},
            "updated_at": timestamp,
        }
        database.players.update_one({"id": player["id"]}, {"$set": update})
        audit_rows.append({"player_id": player["id"], "before": before, "after": update})

    database.equipment_primary_promotion_audit.insert_one({
        "action": "promote_historical_current_kit_to_primary", "at": timestamp,
        "players_changed": len(planned), "rows": audit_rows,
    })
    print(json.dumps({"applied": True, "players_changed": len(planned)}, ensure_ascii=False))
    client.close()


if __name__ == "__main__":
    main()
