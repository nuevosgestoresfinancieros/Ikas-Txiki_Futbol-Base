"""Funciones puras de asistencia para entrenamientos y paneles autorizados."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

ATTENDANCE_STATES = ("presente", "justificada", "injustificada", "lesion")


def parse_date(value: object) -> Optional[date]:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def in_period(value: object, desde: Optional[str] = None, hasta: Optional[str] = None) -> bool:
    current = parse_date(value)
    if not current:
        return False
    start, end = parse_date(desde), parse_date(hasta)
    return (not start or current >= start) and (not end or current <= end)


def attendance_rows(trainings: Iterable[dict], player_ids: Optional[set[str]] = None,
                    desde: Optional[str] = None, hasta: Optional[str] = None) -> list[dict]:
    rows = []
    for training in trainings:
        if not in_period(training.get("fecha"), desde, hasta):
            continue
        for item in training.get("asistencia", []):
            if player_ids is not None and item.get("player_id") not in player_ids:
                continue
            status = item.get("estado", "presente")
            if status in ATTENDANCE_STATES:
                rows.append({"training_id": training.get("id"), "fecha": training.get("fecha"),
                             "equipo_id": training.get("equipo_id"), **item})
    return rows


def attendance_summary(trainings: Iterable[dict], player_ids: Optional[set[str]] = None,
                       desde: Optional[str] = None, hasta: Optional[str] = None) -> dict:
    rows = attendance_rows(trainings, player_ids, desde, hasta)
    totals = Counter(row["estado"] for row in rows)
    recorded = len(rows)
    return {
        **{state: totals[state] for state in ATTENDANCE_STATES},
        "registros": recorded,
        "porcentaje_presencia": round(100 * totals["presente"] / recorded, 1) if recorded else 0,
        "desde": desde, "hasta": hasta,
    }


def attendance_trend(trainings: Iterable[dict], player_ids: Optional[set[str]] = None,
                     period: str = "weekly", desde: Optional[str] = None, hasta: Optional[str] = None) -> list[dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in attendance_rows(trainings, player_ids, desde, hasta):
        parsed = parse_date(row.get("fecha"))
        if not parsed:
            continue
        key = parsed.strftime("%Y-%m") if period == "monthly" else f"{parsed.isocalendar().year}-W{parsed.isocalendar().week:02d}"
        grouped[key].append(row)
    return [{"periodo": key, **attendance_summary([{"fecha": row["fecha"], "asistencia": [row]} for row in rows])}
            for key, rows in sorted(grouped.items())]


def player_percentages(trainings: Iterable[dict], player_ids: Optional[set[str]] = None,
                       desde: Optional[str] = None, hasta: Optional[str] = None) -> dict[str, dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in attendance_rows(trainings, player_ids, desde, hasta):
        grouped[row["player_id"]].append(row)
    return {player_id: attendance_summary([{"fecha": row["fecha"], "asistencia": [row]} for row in rows])
            for player_id, rows in grouped.items()}


def repeated_absence_alerts(trainings: Iterable[dict], threshold: int = 3,
                            player_ids: Optional[set[str]] = None, desde: Optional[str] = None,
                            hasta: Optional[str] = None) -> list[dict]:
    threshold = max(1, int(threshold or 3))
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in attendance_rows(trainings, player_ids, desde, hasta):
        if row["estado"] in {"injustificada", "lesion"}:
            grouped[row["player_id"]].append(row)
    return [{"player_id": player_id, "ausencias": len(rows), "lesiones": sum(r["estado"] == "lesion" for r in rows),
             "injustificadas": sum(r["estado"] == "injustificada" for r in rows)}
            for player_id, rows in grouped.items() if len(rows) >= threshold]


def callup_attendance_comparison(trainings: Iterable[dict], callups: Iterable[dict],
                                 player_ids: Optional[set[str]] = None) -> dict:
    """Relaciona un entrenamiento con su convocatoria opcional sin duplicar asistentes."""
    by_id = {callup.get("id"): callup for callup in callups}
    result = Counter()
    for training in trainings:
        callup = by_id.get(training.get("callup_id"))
        if not callup:
            continue
        responses = {row.get("player_id"): row.get("estado") for row in callup.get("convocados", [])}
        for row in training.get("asistencia", []):
            if player_ids is not None and row.get("player_id") not in player_ids:
                continue
            response = responses.get(row.get("player_id"))
            if response:
                result[f"convocatoria_{response}"] += 1
                result[f"asistencia_{row.get('estado')}"] += 1
    return dict(result)


def attendance_history(previous: list[dict], current: list[dict], actor: dict, reason: Optional[str] = None,
                       at: Optional[datetime] = None) -> list[dict]:
    before = {row.get("player_id"): row for row in previous}
    history = []
    for row in current:
        old = before.get(row.get("player_id"), {})
        old_status, new_status = old.get("estado"), row.get("estado")
        if old_status != new_status:
            history.append({"player_id": row.get("player_id"), "previous_status": old_status,
                            "new_status": new_status, "at": (at or datetime.utcnow()).isoformat(),
                            "actor_id": actor.get("id"), "actor_role": actor.get("role"),
                            "reason": row.get("motivo") or reason})
    return history
