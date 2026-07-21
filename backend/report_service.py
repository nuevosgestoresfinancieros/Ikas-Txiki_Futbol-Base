"""Motor puro y seguro para las vistas previas de informes profesionales."""
from __future__ import annotations

from math import ceil
from typing import Any, Iterable, Mapping

from attendance_service import attendance_summary, player_percentages
from modality_service import ModalityDefinition, normalize_modality


REPORT_ROLES = frozenset({"admin", "coordinator", "coach", "family", "player"})
MAX_PAGE_SIZE = 100

REPORTS = {
    "roster": {
        "id": "roster", "area": "sport",
        "name": {"es": "Plantilla por equipo y categoría", "eu": "Talde eta kategoriaren araberako plantilla"},
        "roles": REPORT_ROLES,
        "filters": ["season", "category", "team_id", "modality", "status", "search"],
        "columns": ["name", "surname", "team", "category", "modality", "number", "status"],
    },
    "attendance": {
        "id": "attendance", "area": "sport",
        "name": {"es": "Asistencia individual y por equipo", "eu": "Banakako eta taldekako asistentzia"},
        "roles": REPORT_ROLES,
        "filters": ["date_from", "date_to", "category", "team_id", "player_id", "period", "group_by"],
        "columns": ["name", "team", "sessions", "present", "justified", "unjustified", "injury", "percentage"],
    },
}

SAFE_COLUMNS = frozenset({
    "name", "surname", "team", "category", "modality", "number", "status",
    "sessions", "present", "justified", "unjustified", "injury", "percentage",
})


class ReportValidationError(ValueError):
    pass


def catalog_for_role(role: str) -> list[dict]:
    return [{key: value for key, value in definition.items() if key != "roles"}
            for definition in REPORTS.values() if role in definition["roles"]]


def validate_report_filters(report_id: str, filters: Mapping[str, Any]) -> dict:
    definition = REPORTS.get(report_id)
    if not definition:
        raise ReportValidationError("Informe desconocido")
    unknown = set(filters) - set(definition["filters"])
    if unknown:
        raise ReportValidationError(f"Filtros no admitidos: {', '.join(sorted(unknown))}")
    cleaned = {key: value for key, value in filters.items() if value not in (None, "", "all")}
    if cleaned.get("period") not in (None, "weekly", "monthly"):
        raise ReportValidationError("Periodo no válido")
    if cleaned.get("group_by") not in (None, "player", "team"):
        raise ReportValidationError("Agrupación no válida")
    if cleaned.get("date_from") and cleaned.get("date_to") and cleaned["date_from"] > cleaned["date_to"]:
        raise ReportValidationError("El rango de fechas no es válido")
    return cleaned


def paginate(rows: list[dict], page: int, page_size: int) -> tuple[list[dict], dict]:
    page = max(1, int(page))
    page_size = min(MAX_PAGE_SIZE, max(1, int(page_size)))
    total = len(rows)
    pages = max(1, ceil(total / page_size))
    if page > pages:
        page = pages
    start = (page - 1) * page_size
    return rows[start:start + page_size], {"page": page, "page_size": page_size, "total_rows": total, "total_pages": pages}


def _modality(value: Any, catalog: Iterable[ModalityDefinition | Mapping[str, Any]]) -> str | None:
    result = normalize_modality(value, catalog)
    return result.code if result.status == "recognized" and result.active is not False else None


def build_roster(players: Iterable[dict], teams: Iterable[dict], filters: Mapping[str, Any],
                 modality_catalog: Iterable[ModalityDefinition | Mapping[str, Any]]) -> tuple[list[dict], dict]:
    team_map = {team.get("id"): team for team in teams if team.get("id")}
    query = str(filters.get("search") or "").strip().casefold()
    rows = []
    for player in players:
        team = team_map.get(player.get("equipo_id"), {})
        modality = _modality(team.get("modalidad") or player.get("modalidad"), modality_catalog)
        if filters.get("season") and team.get("temporada") != filters["season"]:
            continue
        if filters.get("category") and player.get("categoria") != filters["category"]:
            continue
        if filters.get("team_id") and player.get("equipo_id") != filters["team_id"]:
            continue
        if filters.get("modality") and modality != filters["modality"]:
            continue
        if filters.get("status") and player.get("estado") != filters["status"]:
            continue
        full_name = f"{player.get('nombre') or ''} {player.get('apellidos') or ''}".strip()
        if query and query not in full_name.casefold():
            continue
        rows.append({
            "name": player.get("nombre"), "surname": player.get("apellidos"),
            "team": team.get("nombre"), "category": player.get("categoria"),
            "modality": modality, "number": player.get("dorsal"), "status": player.get("estado"),
        })
    rows.sort(key=lambda row: ((row.get("surname") or "").casefold(), (row.get("name") or "").casefold(), row.get("number") or ""))
    return rows, {"players": len(rows), "teams": len({row["team"] for row in rows if row.get("team")})}


def build_attendance(players: Iterable[dict], teams: Iterable[dict], trainings: Iterable[dict],
                     filters: Mapping[str, Any], role: str) -> tuple[list[dict], dict]:
    players = list(players); teams = list(teams); trainings = list(trainings)
    team_map = {team.get("id"): team for team in teams if team.get("id")}
    allowed = []
    for player in players:
        team = team_map.get(player.get("equipo_id"), {})
        if filters.get("category") and player.get("categoria") != filters["category"]:
            continue
        if filters.get("team_id") and player.get("equipo_id") != filters["team_id"]:
            continue
        if filters.get("player_id") and player.get("id") != filters["player_id"]:
            continue
        allowed.append(player)
    allowed_ids = {player.get("id") for player in allowed if player.get("id")}
    if filters.get("team_id"):
        trainings = [item for item in trainings if item.get("equipo_id") == filters["team_id"]]
    date_from, date_to = filters.get("date_from"), filters.get("date_to")
    group_by = filters.get("group_by") or ("player" if role in {"family", "player"} or filters.get("player_id") else "team")
    rows = []
    if group_by == "team":
        for team_id in sorted({player.get("equipo_id") for player in allowed if player.get("equipo_id")}, key=lambda value: (team_map.get(value, {}).get("nombre") or "").casefold()):
            team_player_ids = {player.get("id") for player in allowed if player.get("equipo_id") == team_id}
            stats = attendance_summary(trainings, team_player_ids, date_from, date_to)
            rows.append({"name": team_map.get(team_id, {}).get("nombre"), "team": team_map.get(team_id, {}).get("nombre"),
                         "sessions": stats["registros"], "present": stats["presente"], "justified": stats["justificada"],
                         "unjustified": stats["injustificada"], "injury": stats["lesion"], "percentage": stats["porcentaje_presencia"]})
    else:
        percentages = player_percentages(trainings, allowed_ids, date_from, date_to)
        for player in allowed:
            stats = percentages.get(player.get("id"), {"registros": 0, "presente": 0, "justificada": 0, "injustificada": 0, "lesion": 0, "porcentaje_presencia": 0})
            rows.append({"name": f"{player.get('nombre') or ''} {player.get('apellidos') or ''}".strip(),
                         "team": team_map.get(player.get("equipo_id"), {}).get("nombre"), "sessions": stats["registros"],
                         "present": stats["presente"], "justified": stats["justificada"], "unjustified": stats["injustificada"],
                         "injury": stats["lesion"], "percentage": stats["porcentaje_presencia"]})
        rows.sort(key=lambda row: (row.get("name") or "").casefold())
    total = attendance_summary(trainings, allowed_ids, date_from, date_to)
    return rows, {"groups": len(rows), "sessions": total["registros"], "present": total["presente"],
                  "justified": total["justificada"], "unjustified": total["injustificada"],
                  "injury": total["lesion"], "percentage": total["porcentaje_presencia"]}


def safe_rows(rows: Iterable[Mapping[str, Any]]) -> list[dict]:
    return [{key: value for key, value in row.items() if key in SAFE_COLUMNS} for row in rows]
