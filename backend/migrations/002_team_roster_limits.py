"""Ajusta límites de equipos que hayan quedado por debajo de su plantilla.

La migración es conservadora e idempotente: nunca reduce límites ni modifica
asignaciones. Por defecto solo informa; use ``--apply`` para escribir cambios.
"""
from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient


def required_limit(current_limit: object, player_count: int) -> int | None:
    """Return the roster size only when the configured limit is insufficient."""
    try:
        configured = int(current_limit or 0)
    except (TypeError, ValueError):
        configured = 0
    return player_count if player_count > configured else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Aplicar la migración")
    args = parser.parse_args()

    backend_dir = Path(__file__).resolve().parents[1]
    load_dotenv(backend_dir / ".env")
    client = MongoClient(os.environ["MONGO_URL"])
    database = client[os.environ["DB_NAME"]]
    teams = database["teams"]
    players = database["players"]
    now = datetime.now(timezone.utc).isoformat()

    changes = []
    for team in teams.find({}, {"id": 1, "nombre": 1, "limite_jugadores": 1}):
        player_count = players.count_documents({"equipo_id": team.get("id")})
        new_limit = required_limit(team.get("limite_jugadores"), player_count)
        if new_limit is not None:
            changes.append((team, new_limit))
            print(
                f"team={team.get('nombre', '—')!r} "
                f"players={player_count} old_limit={team.get('limite_jugadores')} "
                f"new_limit={new_limit}"
            )

    print(f"teams_to_update={len(changes)}")
    if not args.apply:
        print("dry_run=true")
        client.close()
        return

    for team, new_limit in changes:
        teams.update_one(
            {"_id": team["_id"]},
            {"$set": {"limite_jugadores": new_limit, "updated_at": now}},
        )
    print("applied=true")
    client.close()


if __name__ == "__main__":
    main()
