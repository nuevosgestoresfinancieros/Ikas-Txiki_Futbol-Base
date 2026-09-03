"""Shared helpers for family authorization onboarding."""
from __future__ import annotations

from typing import Any, Mapping

from pymongo.errors import BulkWriteError


AUTHORIZATION_TYPES = (
    "general",
    "imagen",
    "medica",
    "desplazamientos",
    "recogida",
    "proteccion_datos",
)


async def ensure_family_authorizations(
    db: Any,
    family_id: str,
    *,
    player_ids: list[str] | None = None,
) -> dict[str, int]:
    """Create the missing authorization rows for a family without duplicates.

    This helper is intentionally idempotent.  The unique MongoDB index created
    by migration 010 protects the same invariant under concurrent requests;
    the read-before-insert path keeps the application compatible with existing
    deployments until that migration is applied.
    """
    family_key = str(family_id or "").strip()
    if not family_key:
        return {"players": 0, "created": 0, "types": len(AUTHORIZATION_TYPES)}
    family_player_ids = {
        str(value) for value in await db.players.distinct("id", {"familia_id": family_key}) if value
    }
    requested_player_ids = {str(value) for value in (player_ids or []) if value}
    resolved_players = sorted(requested_player_ids.intersection(family_player_ids)) if requested_player_ids else sorted(family_player_ids)
    if not resolved_players:
        return {"players": 0, "created": 0, "types": len(AUTHORIZATION_TYPES)}

    existing = await db.authorizations.find(
        {"player_id": {"$in": resolved_players}, "tipo": {"$in": list(AUTHORIZATION_TYPES)}},
        {"_id": 0, "player_id": 1, "tipo": 1},
    ).to_list(len(resolved_players) * len(AUTHORIZATION_TYPES))
    existing_keys = {(str(row.get("player_id")), row.get("tipo")) for row in existing}
    now = _now_iso()
    documents = []
    for player_id in resolved_players:
        for authorization_type in AUTHORIZATION_TYPES:
            if (player_id, authorization_type) in existing_keys:
                continue
            documents.append({
                "id": _new_id(),
                "player_id": player_id,
                "tipo": authorization_type,
                "persona_autorizada": None,
                "dni_autorizada": None,
                "firmante": None,
                "fecha_firma": None,
                "fecha_caducidad": None,
                "estado": "pendiente",
                "archivo_firmado": None,
                "archivo_firmado_mime": None,
                "archivo_firmado_size": None,
                "archivo_firmado_sha256": None,
                "archivo_firmado_subido_at": None,
                "archivo_firmado_subido_por": None,
                "firma_modalidad": None,
                "firma_electronica": None,
                "observaciones": None,
                "created_at": now,
                "updated_at": now,
            })
    if documents:
        try:
            await db.authorizations.insert_many(documents, ordered=False)
        except BulkWriteError:
            # A concurrent request may have inserted one or more of the same
            # rows after the compatibility read.  The unique index is the
            # authoritative guard; surface unrelated database failures.
            pass
    return {"players": len(resolved_players), "created": len(documents), "types": len(AUTHORIZATION_TYPES)}


def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    from uuid import uuid4
    return str(uuid4())


def signer_name(user: Mapping[str, Any] | None) -> str | None:
    user = user or {}
    value = " ".join(str(user.get(key) or "").strip() for key in ("first_name", "last_name")).strip()
    return value or str(user.get("username") or "").strip() or None
