"""Agregaciones puras para el dashboard contextual, sin acceso directo a MongoDB."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Iterable, Optional


ATTENDANCE_STATES = ("presente", "justificada", "injustificada", "lesion")


def event_datetime(item: dict, now: Optional[datetime] = None) -> Optional[datetime]:
    value = item.get("fecha")
    if not value:
        return None
    try:
        parsed_date = date.fromisoformat(str(value)[:10])
        parsed_time = time.fromisoformat(str(item.get("hora") or "00:00")[:5])
        tz = (now or datetime.now(timezone.utc)).tzinfo or timezone.utc
        return datetime.combine(parsed_date, parsed_time, tzinfo=tz)
    except (TypeError, ValueError):
        return None


def next_activity(matches: Iterable[dict], trainings: Iterable[dict], now: Optional[datetime] = None) -> Optional[dict]:
    now = now or datetime.now(timezone.utc)
    candidates = []
    for activity_type, items in (("partido", matches), ("entrenamiento", trainings)):
        for item in items:
            moment = event_datetime(item, now)
            if moment and moment >= now:
                candidates.append((moment, activity_type, item))
    if not candidates:
        return None
    moment, activity_type, item = min(candidates, key=lambda value: value[0])
    return {"tipo": activity_type, "fecha_hora": moment.isoformat(), **item}


def weekly_attendance(trainings: Iterable[dict], player_ids: Optional[set[str]] = None, today: Optional[date] = None) -> dict:
    today = today or date.today()
    start = today - timedelta(days=today.weekday())
    totals = {state: 0 for state in ATTENDANCE_STATES}
    sessions = 0
    for training in trainings:
        try:
            training_date = date.fromisoformat(str(training.get("fecha"))[:10])
        except (TypeError, ValueError):
            continue
        if not start <= training_date <= today:
            continue
        sessions += 1
        for item in training.get("asistencia", []):
            if player_ids is not None and item.get("player_id") not in player_ids:
                continue
            state = item.get("estado")
            if state in totals:
                totals[state] += 1
    recorded = sum(totals.values())
    totals.update({
        "sesiones": sessions,
        "registros": recorded,
        "porcentaje_presencia": round((totals["presente"] / recorded) * 100, 1) if recorded else 0,
        "desde": start.isoformat(),
        "hasta": today.isoformat(),
    })
    return totals


def pending_callups(callups: Iterable[dict], player_ids: Optional[set[str]] = None) -> dict:
    rows = []
    total = 0
    for callup in callups:
        pending = [
            item for item in callup.get("convocados", [])
            if item.get("estado", "pendiente") == "pendiente"
            and (player_ids is None or item.get("player_id") in player_ids)
        ]
        if pending:
            rows.append({
                "id": callup.get("id"), "match_id": callup.get("match_id"),
                "equipo_id": callup.get("equipo_id"), "pendientes": len(pending),
            })
            total += len(pending)
    return {"total": total, "convocatorias": rows[:5]}


def player_callup_status(callups: Iterable[dict], player_ids: set[str]) -> list[dict]:
    result = []
    for callup in callups:
        for item in callup.get("convocados", []):
            if item.get("player_id") in player_ids:
                result.append({
                    "callup_id": callup.get("id"), "match_id": callup.get("match_id"),
                    "player_id": item.get("player_id"), "estado": item.get("estado", "pendiente"),
                })
    return result


def prioritized_alerts(items: Iterable[dict]) -> list[dict]:
    priorities = {"error_comunicacion": 1, "convocatoria": 2, "pago": 3, "doc": 4, "auth": 5, "inscripcion": 6}
    return sorted(items, key=lambda item: priorities.get(item.get("tipo"), 99))
