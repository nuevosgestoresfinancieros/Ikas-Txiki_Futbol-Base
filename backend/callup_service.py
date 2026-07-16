"""Reglas puras para convocatorias interactivas."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional


STATUS_ALIASES = {
    "pending": "pending", "pendiente": "pending",
    "confirmed": "confirmed", "confirmado": "confirmed",
    "declined": "declined", "no_puede": "declined",
}
VALID_STATUSES = frozenset({"pending", "confirmed", "declined"})


def normalize_status(value: Optional[str]) -> str:
    return STATUS_ALIASES.get((value or "pending").strip().lower(), "pending")


def normalize_item(item: dict) -> dict:
    return {**item, "estado": normalize_status(item.get("estado"))}


def normalize_callup(callup: dict) -> dict:
    return {**callup, "convocados": [normalize_item(i) for i in callup.get("convocados", [])]}


def response_counts(items: Iterable[dict]) -> dict:
    counts = {"pending": 0, "confirmed": 0, "declined": 0}
    for item in items:
        counts[normalize_status(item.get("estado"))] += 1
    return counts


def parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except (TypeError, ValueError):
        return None


def is_late(deadline: Optional[str], at: Optional[datetime] = None) -> bool:
    limit = parse_datetime(deadline)
    return bool(limit and (at or datetime.now(timezone.utc)) > limit)


def apply_response(item: dict, status: str, reason: Optional[str], actor: dict,
                   deadline: Optional[str], at: Optional[datetime] = None) -> tuple[dict, dict]:
    if status not in VALID_STATUSES - {"pending"}:
        raise ValueError("Estado de respuesta no válido")
    moment = at or datetime.now(timezone.utc)
    previous = normalize_status(item.get("estado"))
    relation = actor.get("role", "player")
    history = {
        "previous_status": previous, "new_status": status,
        "changed_at": moment.isoformat(), "changed_by_user_id": actor.get("id"),
        "changed_by_username": actor.get("username"), "relation": relation,
        "reason": reason if status == "declined" else None,
        "late": is_late(deadline, moment),
    }
    updated = {
        **item, "estado": status, "motivo": reason if status == "declined" else None,
        "responded_at": moment.isoformat(), "responded_by_user_id": actor.get("id"),
        "responded_by_username": actor.get("username"), "responded_by_role": relation,
        "late": history["late"], "history": [*(item.get("history") or []), history],
    }
    return updated, history
