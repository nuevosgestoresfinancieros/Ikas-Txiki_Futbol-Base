"""Proyección segura de los datos existentes para familia y jugador."""
from __future__ import annotations

from datetime import date
from typing import Iterable

from attendance_service import attendance_summary
from callup_service import normalize_callup, response_counts


PLAYER_FIELDS = (
    "id", "nombre", "apellidos", "foto", "fecha_nacimiento", "categoria",
    "equipo_id", "dorsal", "posicion", "estado", "numero_licencia",
    "estado_documental",
)
DOCUMENT_FIELDS = (
    "doc_dni_jugador", "doc_dni_tutor", "doc_foto", "doc_autorizacion",
    "doc_justificante_pago", "doc_ficha_federativa",
)
PAYMENT_FIELDS = (
    "id", "player_id", "concepto", "importe_base", "descuento_hermano",
    "importe_final", "forma_pago", "estado", "fecha_pago", "recibo_generado",
)


def safe_player(player: dict) -> dict:
    """Expone solo datos personales y deportivos apropiados para el portal."""
    return {field: player.get(field) for field in PLAYER_FIELDS}


def safe_payment(payment: dict) -> dict:
    """Nunca expone IBAN, observaciones internas ni datos administrativos."""
    return {field: payment.get(field) for field in PAYMENT_FIELDS}


def document_status(players: Iterable[dict]) -> list[dict]:
    return [{
        "player_id": player.get("id"),
        "status": player.get("estado_documental") or "pendiente",
        "items": {field: bool(player.get(field)) for field in DOCUMENT_FIELDS},
    } for player in players]


def portal_attendance(trainings: Iterable[dict], player_ids: set[str]) -> dict:
    scoped_trainings = []
    recent = []
    for training in trainings:
        rows = [row for row in training.get("asistencia", []) if row.get("player_id") in player_ids]
        if not rows:
            continue
        scoped_trainings.append({**training, "asistencia": rows})
        for row in rows:
            recent.append({
                "training_id": training.get("id"), "player_id": row.get("player_id"),
                "date": training.get("fecha"), "status": row.get("estado"),
                "reason": row.get("motivo"), "team_id": training.get("equipo_id"),
            })
    recent.sort(key=lambda row: row.get("date") or "", reverse=True)
    return {"summary": attendance_summary(scoped_trainings, player_ids), "recent": recent[:20]}


def portal_callups(callups: Iterable[dict], player_ids: set[str]) -> list[dict]:
    result = []
    for raw in callups:
        callup = normalize_callup(raw)
        own = [row for row in callup.get("convocados", []) if row.get("player_id") in player_ids]
        if not own:
            continue
        result.append({
            "id": callup.get("id"), "match_id": callup.get("match_id"),
            "equipo_id": callup.get("equipo_id"), "instrucciones": callup.get("instrucciones"),
            "response_deadline": callup.get("response_deadline"),
            "player_self_response_allowed": bool(callup.get("player_self_response_allowed")),
            "responses": own, "response_counts": response_counts(own),
        })
    return result


def upcoming(items: Iterable[dict], limit: int = 12) -> list[dict]:
    today = date.today().isoformat()
    rows = [item for item in items if str(item.get("fecha") or "")[:10] >= today]
    return sorted(rows, key=lambda item: (item.get("fecha") or "", item.get("hora") or "00:00"))[:limit]
