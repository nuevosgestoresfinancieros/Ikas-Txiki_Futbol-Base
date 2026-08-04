"""Cálculos puros para la vista de estadísticas integrales.

Los indicadores se derivan en memoria a partir de los documentos operativos. No
se persisten totales, porcentajes ni series calculadas, de modo que los cambios
en partidos, convocatorias o entrenamientos se reflejan siempre al consultar.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date
from typing import Any, Iterable, Mapping, Optional


ATTENDANCE_STATES = ("presente", "justificada", "injustificada", "lesion")
MATCH_CANCELLED = {"cancelado", "cancelled", "suspendido", "suspended"}
MATCH_POSTPONED = {"aplazado", "postponed"}
MATCH_PLAYED = {"jugado", "played"}
TRAINING_CANCELLED = MATCH_CANCELLED
INACTIVE_PLAYER_STATES = {"baja", "inactivo", "inactive", "lesionado"}
RESPONSE_CONFIRMED = {"confirmed", "confirmado", "aceptada", "accepted"}
RESPONSE_DECLINED = {"declined", "rechazado", "rechazada", "rejected", "no_puede"}

INDICATOR_DEFINITIONS = {
    "attendance_percentage": {
        "source": "training.asistencia",
        "formula": "presencias / registros de asistencia válidos × 100",
        "rules": ["Una asistencia no registrada no equivale a ausencia", "denominador cero = no_data"],
    },
    "training_sessions": {
        "source": "trainings",
        "formula": "sesiones con fecha válida y estado distinto de cancelado",
        "rules": ["cancelado no entra en el denominador", "sesión sin asistencia = pendiente"],
    },
    "match_results": {
        "source": "matches.resultado_propio/resultados_rival",
        "formula": "victoria, empate o derrota solo con estado jugado y resultado completo",
        "rules": ["aplazado/cancelado no se disputa", "sin resultado no clasifica"],
    },
    "callup_responses": {
        "source": "callups.convocados.estado",
        "formula": "confirmed, declined y pending normalizados",
        "rules": ["sin respuesta = pending", "no se interpreta como rechazo"],
    },
}


def parse_date(value: Any) -> Optional[date]:
    try:
        return date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


def norm(value: Any) -> str:
    return str(value or "").strip().casefold()


def modality_code(value: Any) -> Optional[str]:
    text = norm(value).replace("ú", "u").replace(" ", "").replace("-", "")
    if text in {"f7", "futbol7", "futbol7f7", "7", "fútbol7"}:
        return "F7"
    if text in {"f11", "futbol11", "futbol11f11", "11", "fútbol11"}:
        return "F11"
    return str(value).strip() if value not in (None, "") else None


def in_period(value: Any, date_from: Optional[str], date_to: Optional[str]) -> bool:
    current = parse_date(value)
    if not current:
        return False
    start, end = parse_date(date_from), parse_date(date_to)
    return (not start or current >= start) and (not end or current <= end)


def metric(value: Any, *, numerator: Any = None, denominator: Any = None,
           state: str = "calculated", unit: str = "count") -> dict:
    return {
        "value": value,
        "state": state,
        "unit": unit,
        "numerator": numerator,
        "denominator": denominator,
    }


def rate(numerator: int, denominator: int) -> dict:
    if not denominator:
        return metric(None, numerator=numerator, denominator=denominator, state="no_data", unit="percent")
    return metric(round(100 * numerator / denominator, 1), numerator=numerator,
                  denominator=denominator, unit="percent")


def _active_player(player: Mapping[str, Any]) -> bool:
    if player.get("active") is False:
        return False
    state = norm(player.get("estado"))
    return state not in INACTIVE_PLAYER_STATES


def _team_matches(team: Mapping[str, Any], filters: Mapping[str, Any]) -> bool:
    if filters.get("temporada") and team.get("temporada") != filters["temporada"]:
        return False
    if filters.get("categoria") and team.get("categoria") != filters["categoria"]:
        return False
    if filters.get("equipo_id") and team.get("id") != filters["equipo_id"]:
        return False
    if filters.get("modalidad") and modality_code(team.get("modalidad")) != filters["modalidad"]:
        return False
    return True


def _player_matches(player: Mapping[str, Any], team: Mapping[str, Any], filters: Mapping[str, Any]) -> bool:
    if filters.get("player_id") and player.get("id") != filters["player_id"]:
        return False
    if filters.get("estado") == "activo" and not _active_player(player):
        return False
    if filters.get("estado") == "inactivo" and _active_player(player):
        return False
    if filters.get("categoria") and player.get("categoria") != filters["categoria"] and team.get("categoria") != filters["categoria"]:
        return False
    if filters.get("equipo_id") and player.get("equipo_id") != filters["equipo_id"]:
        return False
    return True


def _document_matches(document: Mapping[str, Any], team: Mapping[str, Any], filters: Mapping[str, Any],
                      status_key: str = "estado") -> bool:
    if not _team_matches(team, filters):
        return False
    if not in_period(document.get("fecha"), filters.get("desde"), filters.get("hasta")):
        # A missing date is never silently included when a period is selected.
        if filters.get("desde") or filters.get("hasta"):
            return False
    requested = filters.get(status_key)
    return not requested or norm(document.get("estado")) == norm(requested)


def _status(value: Any, default: str = "pending") -> str:
    value = norm(value)
    if value in RESPONSE_CONFIRMED:
        return "confirmed"
    if value in RESPONSE_DECLINED:
        return "declined"
    return default


def _score(match: Mapping[str, Any]) -> tuple[Optional[int], Optional[int]]:
    own, rival = match.get("resultado_propio"), match.get("resultado_rival")
    return (own, rival) if isinstance(own, int) and isinstance(rival, int) and own >= 0 and rival >= 0 else (None, None)


def _attendance_for(trainings: Iterable[Mapping[str, Any]], player_ids: set[str],
                    filters: Mapping[str, Any]) -> tuple[list[dict], list[dict], int, int]:
    rows: list[dict] = []
    sessions: list[dict] = []
    pending_sessions = 0
    for training in trainings:
        if not in_period(training.get("fecha"), filters.get("desde"), filters.get("hasta")):
            if filters.get("desde") or filters.get("hasta"):
                continue
        state = norm(training.get("estado"))
        if state in TRAINING_CANCELLED:
            continue
        sessions.append(dict(training))
        raw = [item for item in training.get("asistencia") or [] if item.get("player_id") in player_ids]
        valid = [item for item in raw if item.get("estado", "presente") in ATTENDANCE_STATES]
        if not valid:
            pending_sessions += 1
        for item in valid:
            rows.append({"training_id": training.get("id"), "fecha": training.get("fecha"),
                         "equipo_id": training.get("equipo_id"), **item})
    return rows, sessions, pending_sessions, len(sessions)


def _attendance_summary(rows: Iterable[Mapping[str, Any]]) -> dict:
    totals = Counter(row.get("estado", "presente") for row in rows)
    recorded = sum(totals[state] for state in ATTENDANCE_STATES)
    return {
        "presente": totals["presente"], "justificada": totals["justificada"],
        "injustificada": totals["injustificada"], "lesion": totals["lesion"],
        "registros": recorded, "porcentaje_presencia": rate(totals["presente"], recorded),
    }


def _trend(rows: Iterable[Mapping[str, Any]], period: str) -> list[dict]:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        current = parse_date(row.get("fecha"))
        if not current:
            continue
        key = current.strftime("%Y-%m") if period == "monthly" else f"{current.isocalendar().year}-W{current.isocalendar().week:02d}"
        grouped[key].append(dict(row))
    return [{"periodo": key, **_attendance_summary(items)} for key, items in sorted(grouped.items())]


def calculate_statistics(*, players: Iterable[Mapping[str, Any]], teams: Iterable[Mapping[str, Any]],
                         matches: Iterable[Mapping[str, Any]], trainings: Iterable[Mapping[str, Any]],
                         callups: Iterable[Mapping[str, Any]], manual_stats: Iterable[Mapping[str, Any]] = (),
                         filters: Optional[Mapping[str, Any]] = None, today: Optional[date] = None) -> dict:
    """Calcula estadísticas sin escribir datos ni convertir ausencias desconocidas en ceros."""
    filters = {key: value for key, value in (filters or {}).items() if value not in (None, "", "all")}
    today = today or date.today()
    team_list = [dict(team) for team in teams if _team_matches(team, filters)]
    team_map = {team.get("id"): team for team in team_list if team.get("id")}
    player_list = [dict(player) for player in players if _player_matches(player, team_map.get(player.get("equipo_id"), {}), filters)]
    player_ids = {str(player.get("id")) for player in player_list if player.get("id")}
    active_players = sum(_active_player(player) for player in player_list)
    match_list = []
    for match in matches:
        team = team_map.get(match.get("equipo_id"))
        if team and _document_matches(match, team, filters, "estado_partido"):
            match_list.append(dict(match))
    match_status = Counter(norm(match.get("estado")) for match in match_list)
    played = [match for match in match_list if norm(match.get("estado")) in MATCH_PLAYED]
    result_matches = [match for match in played if _score(match)[0] is not None]
    wins = draws = losses = goals_for = goals_against = 0
    for match in result_matches:
        own, rival = _score(match)
        goals_for += own or 0
        goals_against += rival or 0
        if own > rival:
            wins += 1
        elif own == rival:
            draws += 1
        else:
            losses += 1

    training_list = []
    for training in trainings:
        team = team_map.get(training.get("equipo_id"))
        if team and _document_matches(training, team, filters, "estado_entrenamiento"):
            training_list.append(dict(training))
    attendance_rows, sessions, pending_sessions, sessions_count = _attendance_for(training_list, player_ids, filters)
    attendance = _attendance_summary(attendance_rows)
    trend = _trend(attendance_rows, filters.get("period", "weekly"))

    match_map = {match.get("id"): match for match in match_list}
    callup_list = []
    response_counts = Counter()
    for callup in callups:
        match = match_map.get(callup.get("match_id"))
        team = team_map.get(callup.get("equipo_id") or (match or {}).get("equipo_id"))
        if not team:
            continue
        if not in_period((match or callup).get("fecha"), filters.get("desde"), filters.get("hasta")) and (filters.get("desde") or filters.get("hasta")):
            continue
        if filters.get("estado_convocatoria") and norm(callup.get("estado")) != norm(filters["estado_convocatoria"]):
            continue
        eligible_callup_player_ids = {
            str(player.get("id")) for player in player_list if player.get("equipo_id") == team.get("id")
        }
        rows = [row for row in callup.get("convocados") or [] if row.get("player_id") in eligible_callup_player_ids]
        normalized = {**callup, "equipo_id": team.get("id"), "convocados": rows}
        callup_list.append(normalized)
        response_counts.update(_status(row.get("estado")) for row in rows)

    by_team: list[dict] = []
    for team in team_list:
        team_id = team.get("id")
        team_players = {str(player.get("id")) for player in player_list if player.get("equipo_id") == team_id}
        team_rows = [row for row in attendance_rows if row.get("equipo_id") == team_id]
        team_attendance = _attendance_summary(team_rows)
        by_team.append({
            "team_id": team_id, "team": team.get("nombre") or "—", "category": team.get("categoria") or "—",
            "modality": modality_code(team.get("modalidad")) or "—", "players": len(team_players),
            "sessions": sum(1 for session in sessions if session.get("equipo_id") == team_id),
            "present": team_attendance["presente"], "justified": team_attendance["justificada"],
            "unjustified": team_attendance["injustificada"], "injury": team_attendance["lesion"],
            "percentage": team_attendance["porcentaje_presencia"].get("value"),
            "percentage_state": team_attendance["porcentaje_presencia"].get("state"),
        })

    player_rows = []
    for player in player_list:
        rows = [row for row in attendance_rows if row.get("player_id") == player.get("id")]
        summary = _attendance_summary(rows)
        team = team_map.get(player.get("equipo_id"), {})
        player_rows.append({
            "player_id": player.get("id"), "name": f"{player.get('nombre') or ''} {player.get('apellidos') or ''}".strip(),
            "team": team.get("nombre") or "—", "category": player.get("categoria") or team.get("categoria") or "—",
            "modality": modality_code(team.get("modalidad") or player.get("modalidad")) or "—",
            "status": player.get("estado") or ("activo" if _active_player(player) else "inactivo"),
            "sessions": len({row.get("training_id") for row in rows}), "present": summary["presente"],
            "justified": summary["justificada"], "unjustified": summary["injustificada"], "injury": summary["lesion"],
            "percentage": summary["porcentaje_presencia"].get("value"),
            "percentage_state": summary["porcentaje_presencia"].get("state"),
        })

    scheduled = sum(norm(match.get("estado")) == "programado" for match in match_list)
    scheduled_training = sum(bool(parse_date(item.get("fecha")) and parse_date(item.get("fecha")) > today) for item in sessions)
    completed_training = max(0, sessions_count - scheduled_training)
    quality = []
    if not sessions_count:
        quality.append({"code": "no_training_data", "severity": "info"})
    if pending_sessions:
        quality.append({"code": "attendance_pending", "severity": "warning", "count": pending_sessions})
    if not result_matches and played:
        quality.append({"code": "match_results_missing", "severity": "warning", "count": len(played)})
    if not callup_list:
        quality.append({"code": "no_callup_data", "severity": "info"})

    return {
        "filters": filters,
        "definitions": INDICATOR_DEFINITIONS,
        "summary": {
            "active_players": metric(active_players), "teams": metric(len(team_list)),
            "matches_scheduled": metric(scheduled), "matches_played": metric(len(played)),
            "matches_postponed": metric(match_status["aplazado"]), "matches_cancelled": metric(match_status["cancelado"] + match_status["suspendido"]),
            "results_registered": metric(len(result_matches)), "wins": metric(wins), "draws": metric(draws), "losses": metric(losses),
            "goals_for": metric(goals_for, state="calculated" if result_matches else "no_data"),
            "goals_against": metric(goals_against, state="calculated" if result_matches else "no_data"),
            "trainings_scheduled": metric(scheduled_training), "trainings_completed": metric(completed_training),
            "training_sessions": metric(sessions_count), "attendance_records": metric(len(attendance_rows)),
            "callups": metric(len(callup_list)), "callup_confirmed": metric(response_counts["confirmed"]),
            "callup_declined": metric(response_counts["declined"]), "callup_pending": metric(response_counts["pending"]),
        },
        "attendance": {
            **attendance, "sessions_computable": metric(sessions_count),
            "sessions_pending": metric(pending_sessions, state="pending" if pending_sessions else "calculated"),
            "trend": trend, "by_team": by_team, "players": player_rows,
        },
        "matches": {"scheduled": scheduled, "played": len(played), "postponed": match_status["aplazado"],
                     "cancelled": match_status["cancelado"] + match_status["suspendido"], "results_registered": len(result_matches),
                     "wins": wins, "draws": draws, "losses": losses, "goals_for": goals_for if result_matches else None,
                     "goals_against": goals_against if result_matches else None},
        "callups": {"total": len(callup_list), "confirmed": response_counts["confirmed"],
                    "declined": response_counts["declined"], "pending": response_counts["pending"]},
        "manual": {"count": sum(1 for _ in manual_stats), "records": [dict(row) for row in manual_stats]},
        "quality": quality,
        "player_rows": player_rows,
        "team_rows": by_team,
        "pagination": {"page": 1, "page_size": len(player_rows) or 1, "total": len(player_rows)},
    }


def paginate_player_rows(result: dict, page: int, page_size: int) -> dict:
    page = max(1, int(page or 1))
    page_size = min(100, max(1, int(page_size or 25)))
    rows = result.get("player_rows", [])
    total = len(rows)
    pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, pages)
    start = (page - 1) * page_size
    result["player_rows"] = rows[start:start + page_size]
    result["pagination"] = {"page": page, "page_size": page_size, "total": total, "pages": pages}
    return result
