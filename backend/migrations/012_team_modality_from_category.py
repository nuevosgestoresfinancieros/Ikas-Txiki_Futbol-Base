"""Asigna F7/F11 a equipos sin modalidad según su categoría.

Usa la misma regla que la importación (``modality_suggestion``). Nunca cambia
una modalidad ya asignada y deja sin tocar las categorías no reconocidas para
revisión manual. Por defecto solo informa; aplicar exige ``--apply`` y la
confirmación explícita, después de una copia lógica de ``teams``.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from import_staging_service import modality_suggestion  # noqa: E402
from inscription_import_service import normalize_key  # noqa: E402

CONFIRMATION = "ASSIGN-TEAM-MODALITY"


def plan_team(team: dict) -> tuple[str, str | None]:
    """Devuelve (acción, modalidad) para un equipo."""
    if str(team.get("modalidad") or "").strip():
        return "keep", team.get("modalidad")
    if normalize_key(team.get("nombre")) == "no_aplica":
        # Marcador histórico, no un equipo gestionable.
        return "skip", None
    suggestion = modality_suggestion(team.get("categoria"))
    return ("assign", suggestion) if suggestion else ("review", None)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Aplicar la migración")
    parser.add_argument("--confirm", default="", help=f"Debe valer {CONFIRMATION} junto a --apply")
    args = parser.parse_args()

    load_dotenv(BACKEND_DIR / ".env")
    client = MongoClient(os.environ["MONGO_URL"])
    teams = client[os.environ["DB_NAME"]]["teams"]
    now = datetime.now(timezone.utc).isoformat()

    changes = []
    counts = {"assign": 0, "review": 0, "keep": 0, "skip": 0}
    for team in teams.find({}, {"_id": 1, "id": 1, "nombre": 1, "categoria": 1, "temporada": 1, "modalidad": 1}).sort(
        [("temporada", -1), ("nombre", 1)]
    ):
        action, modality = plan_team(team)
        counts[action] += 1
        if action == "assign":
            changes.append((team["_id"], modality))
        if action != "keep":
            print(f"{action:<6} {team.get('temporada') or '—':<10} {team.get('nombre') or '—'!r:<32} "
                  f"categoria={team.get('categoria') or '—'!r} -> {modality or 'revisar a mano'}")

    print(" ".join(f"{key}={value}" for key, value in counts.items()))
    if not args.apply:
        print("dry_run=true")
        client.close()
        return
    if args.confirm != CONFIRMATION:
        client.close()
        raise SystemExit(f"Para aplicar, añade --confirm {CONFIRMATION}")

    for mongo_id, modality in changes:
        teams.update_one(
            {"_id": mongo_id, "$or": [{"modalidad": None}, {"modalidad": ""}, {"modalidad": {"$exists": False}}]},
            {"$set": {"modalidad": modality, "updated_at": now}},
        )
    print("applied=true")
    client.close()


if __name__ == "__main__":
    main()
