"""Motor puro y seguro para vistas previas y exportaciones profesionales."""
from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from math import ceil
from typing import Any, Callable, Iterable, Mapping

from attendance_service import attendance_summary, attendance_trend, player_percentages
from callup_service import normalize_status
from modality_service import ModalityDefinition, normalize_modality


ALL_REPORT_ROLES = frozenset({"admin", "coordinator", "coach", "family", "player"})
STAFF_ROLES = frozenset({"admin", "coordinator", "coach"})
ADMIN_COORDINATOR_ROLES = frozenset({"admin", "coordinator"})
FAMILY_CONTACT_ROLES = frozenset({"admin", "coordinator"})
FINANCIAL_ROLES = frozenset({"admin", "coordinator", "family"})
AUTHORIZATION_ROLES = frozenset({"admin", "coordinator", "family", "player"})
MAX_PAGE_SIZE = 100
MAX_EXPORT_ROWS = 5000
EXPORTS = ["pdf", "xlsx"]


def _report(report_id: str, area: str, es: str, eu: str, roles: frozenset[str],
            filters: list[str], columns: list[str], legacy: list[str] | None = None) -> dict:
    return {
        "id": report_id, "area": area, "name": {"es": es, "eu": eu}, "roles": roles,
        "filters": filters, "columns": columns, "exports": EXPORTS,
        "legacy_equivalents": legacy or [],
    }


REPORTS = {
    "roster": _report("roster", "sport", "Plantilla por equipo y categoría",
                      "Talde eta kategoriaren araberako plantilla", ALL_REPORT_ROLES,
                      ["season", "category", "team_id", "modality", "status", "search"],
                      ["name", "surname", "team", "category", "modality", "number", "status"],
                      ["playersList"]),
    "player_profile": _report("player_profile", "sport", "Ficha deportiva segura del jugador",
                              "Jokalariaren kirol-fitxa segurua", ALL_REPORT_ROLES,
                              ["season", "category", "team_id", "player_id", "status", "search"],
                              ["name", "surname", "birth_date", "team", "category", "modality",
                               "number", "position", "license", "status", "joined_at"]),
    "training_sessions": _report("training_sessions", "sport", "Entrenamientos realizados",
                                 "Egindako entrenamenduak", ALL_REPORT_ROLES,
                                 ["date_from", "date_to", "category", "team_id"],
                                 ["date", "time", "team", "location", "attendees", "present",
                                  "justified", "unjustified", "injury"]),
    "attendance": _report("attendance", "sport", "Asistencia individual y por equipo",
                          "Banakako eta taldekako asistentzia", ALL_REPORT_ROLES,
                          ["date_from", "date_to", "category", "team_id", "player_id", "period", "group_by"],
                          ["name", "team", "sessions", "present", "justified", "unjustified", "injury", "percentage"]),
    "attendance_evolution": _report("attendance_evolution", "sport", "Evolución semanal y mensual",
                                    "Asteko eta hileko bilakaera", ALL_REPORT_ROLES,
                                    ["date_from", "date_to", "category", "team_id", "player_id", "period"],
                                    ["period_label", "sessions", "present", "justified",
                                     "unjustified", "injury", "percentage"]),
    "match_results": _report("match_results", "sport", "Partidos y resultados",
                             "Partidak eta emaitzak", ALL_REPORT_ROLES,
                             ["season", "date_from", "date_to", "category", "team_id", "status"],
                             ["date", "time", "team", "opponent", "condition", "competition",
                              "status", "score"]),
    "callup_responses": _report("callup_responses", "sport", "Convocatorias y respuestas",
                                "Deialdiak eta erantzunak", ALL_REPORT_ROLES,
                                ["season", "date_from", "date_to", "category", "team_id", "player_id", "status"],
                                ["date", "team", "opponent", "name", "response", "responded_at", "late"]),
    "callup_attendance": _report("callup_attendance", "sport", "Comparación convocatoria–asistencia",
                                 "Deialdiaren eta asistentziaren alderaketa", ALL_REPORT_ROLES,
                                 ["season", "date_from", "date_to", "category", "team_id", "player_id"],
                                 ["date", "team", "name", "response", "attendance_status", "consistent"]),
    "modality_distribution": _report("modality_distribution", "sport", "Distribución por F7 y F11",
                                     "F7 eta F11 modalitateen banaketa", STAFF_ROLES,
                                     ["season", "category", "team_id", "modality"],
                                     ["modality", "teams", "players", "capacity", "occupancy"]),
    "inscriptions": _report("inscriptions", "administration", "Inscripciones por estado",
                            "Izen-emateak egoeraren arabera", ADMIN_COORDINATOR_ROLES,
                            ["season", "category", "team_id", "modality", "status", "type", "search"],
                            ["date", "name", "surname", "type", "season", "team", "category",
                             "modality", "status"]),
    "player_movements": _report("player_movements", "administration", "Altas y bajas",
                                "Altak eta bajak", ADMIN_COORDINATOR_ROLES,
                                ["date_from", "date_to", "category", "team_id", "status", "movement"],
                                ["name", "surname", "team", "category", "movement", "date", "status"]),
    "documentation": _report("documentation", "administration", "Documentación pendiente",
                             "Dokumentazioa zain", ADMIN_COORDINATOR_ROLES,
                             ["category", "team_id", "status", "search"],
                             ["name", "surname", "team", "category", "document_status",
                              "missing_documents"]),
    "authorizations": _report("authorizations", "administration", "Autorizaciones",
                              "Baimenak", AUTHORIZATION_ROLES,
                              ["category", "team_id", "player_id", "status", "type"],
                              ["name", "team", "authorization_type", "status", "signed_at", "expires_at"],
                              ["pendingAuthsReport"]),
    "incomplete_data": _report("incomplete_data", "administration", "Datos incompletos",
                               "Osatu gabeko datuak", ADMIN_COORDINATOR_ROLES,
                               ["category", "team_id", "status", "search"],
                               ["name", "surname", "team", "category", "missing_count", "missing_fields"]),
    "equipment": _report("equipment", "administration", "Equipamiento",
                         "Ekipamendua", STAFF_ROLES,
                         ["category", "team_id", "status", "delivery", "search"],
                         ["name", "surname", "team", "category", "equipment_item", "shirt_size",
                          "shorts_size", "tracksuit_size", "delivered", "delivery_date"]),
    "family_contacts": _report("family_contacts", "administration", "Contactos familiares autorizados",
                               "Baimendutako familia-kontaktuak", FAMILY_CONTACT_ROLES,
                               ["category", "team_id", "contact_type", "search"],
                               ["name", "team", "contact_name", "phone", "email"],
                               ["familyPhones", "familyEmails"]),
    "player_stats": _report("player_stats", "sport", "Estadísticas por jugador",
                            "Jokalariaren estatistikak", ALL_REPORT_ROLES,
                            ["season", "category", "team_id", "player_id", "search"],
                            ["name", "team", "season", "matches_called", "matches_played", "minutes",
                             "goals", "assists", "yellow_cards", "red_cards", "rating"],
                            ["statsReport"]),
    "financial_summary": _report("financial_summary", "finance", "Cuotas, cobros y cantidades pendientes",
                                 "Kuotak, kobrantzak eta zain dauden zenbatekoak", FINANCIAL_ROLES,
                                 ["date_from", "date_to", "category", "team_id", "player_id",
                                  "status", "payment_method", "group_by"],
                                 ["name", "team", "concept", "expected", "paid", "pending",
                                  "payment_method", "payment_date", "status"],
                                 ["pendingPaymentsReport"]),
}

FILTER_ENUMS = {
    "period": {"weekly", "monthly"}, "group_by": {"player", "team"},
    "type": {"alta", "renovacion", "general", "imagen", "medica", "desplazamientos", "recogida", "proteccion_datos"},
    "movement": {"alta", "baja"}, "delivery": {"delivered", "pending"},
    "contact_type": {"phone", "email", "all"},
    "payment_method": {"domiciliacion", "transferencia", "efectivo", "bizum"},
}

SAFE_COLUMNS = frozenset(column for definition in REPORTS.values() for column in definition["columns"])


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
    for key, allowed in FILTER_ENUMS.items():
        if key in cleaned and cleaned[key] not in allowed:
            raise ReportValidationError(f"{key}: valor no válido")
    if cleaned.get("date_from") and cleaned.get("date_to") and cleaned["date_from"] > cleaned["date_to"]:
        raise ReportValidationError("El rango de fechas no es válido")
    return cleaned


def paginate(rows: list[dict], page: int, page_size: int) -> tuple[list[dict], dict]:
    page = max(1, int(page))
    page_size = min(MAX_PAGE_SIZE, max(1, int(page_size)))
    total = len(rows)
    pages = max(1, ceil(total / page_size))
    page = min(page, pages)
    start = (page - 1) * page_size
    return rows[start:start + page_size], {
        "page": page, "page_size": page_size, "total_rows": total, "total_pages": pages,
    }


def _modality(value: Any, catalog: Iterable[ModalityDefinition | Mapping[str, Any]]) -> str | None:
    result = normalize_modality(value, catalog)
    return result.code if result.status == "recognized" and result.active is not False else None


def _date(value: Any) -> str | None:
    return str(value)[:10] if value not in (None, "") else None


def _in_dates(value: Any, filters: Mapping[str, Any]) -> bool:
    value = _date(value)
    return not ((filters.get("date_from") and (not value or value < filters["date_from"]))
                or (filters.get("date_to") and (not value or value > filters["date_to"])))


def _name(document: Mapping[str, Any]) -> str:
    return f"{document.get('nombre') or ''} {document.get('apellidos') or ''}".strip()


def _maps(context: Mapping[str, Any]) -> tuple[dict, dict]:
    return ({item.get("id"): item for item in context.get("players", []) if item.get("id")},
            {item.get("id"): item for item in context.get("teams", []) if item.get("id")})


def _player_allowed(player: Mapping[str, Any], filters: Mapping[str, Any], team_map: Mapping[str, dict]) -> bool:
    team = team_map.get(player.get("equipo_id"), {})
    query = str(filters.get("search") or "").strip().casefold()
    return not (
        (filters.get("season") and team.get("temporada") != filters["season"])
        or (filters.get("category") and player.get("categoria") != filters["category"])
        or (filters.get("team_id") and player.get("equipo_id") != filters["team_id"])
        or (filters.get("player_id") and player.get("id") != filters["player_id"])
        or (filters.get("status") and player.get("estado") != filters["status"])
        or (query and query not in _name(player).casefold())
    )


def build_roster(players: Iterable[dict], teams: Iterable[dict], filters: Mapping[str, Any],
                 modality_catalog: Iterable[ModalityDefinition | Mapping[str, Any]]) -> tuple[list[dict], dict]:
    team_map = {team.get("id"): team for team in teams if team.get("id")}
    rows = []
    for player in players:
        if not _player_allowed(player, filters, team_map):
            continue
        team = team_map.get(player.get("equipo_id"), {})
        modality = _modality(team.get("modalidad") or player.get("modalidad"), modality_catalog)
        if filters.get("modality") and modality != filters["modality"]:
            continue
        rows.append({"name": player.get("nombre"), "surname": player.get("apellidos"),
                     "team": team.get("nombre"), "category": player.get("categoria"),
                     "modality": modality, "number": player.get("dorsal"), "status": player.get("estado")})
    rows.sort(key=lambda row: ((row.get("surname") or "").casefold(), (row.get("name") or "").casefold()))
    return rows, {"players": len(rows), "teams": len({row["team"] for row in rows if row.get("team")})}


def build_attendance(players: Iterable[dict], teams: Iterable[dict], trainings: Iterable[dict],
                     filters: Mapping[str, Any], role: str) -> tuple[list[dict], dict]:
    players, teams, trainings = list(players), list(teams), list(trainings)
    team_map = {team.get("id"): team for team in teams if team.get("id")}
    allowed = [player for player in players if _player_allowed(player, filters, team_map)]
    allowed_ids = {player.get("id") for player in allowed if player.get("id")}
    trainings = [item for item in trainings if _in_dates(item.get("fecha"), filters)
                 and (not filters.get("team_id") or item.get("equipo_id") == filters["team_id"])]
    group_by = filters.get("group_by") or ("player" if role in {"family", "player"} or filters.get("player_id") else "team")
    rows = []
    if group_by == "team":
        for team_id in sorted({p.get("equipo_id") for p in allowed if p.get("equipo_id")},
                              key=lambda value: (team_map.get(value, {}).get("nombre") or "").casefold()):
            player_ids = {p.get("id") for p in allowed if p.get("equipo_id") == team_id}
            stats = attendance_summary(trainings, player_ids, filters.get("date_from"), filters.get("date_to"))
            rows.append({"name": team_map.get(team_id, {}).get("nombre"), "team": team_map.get(team_id, {}).get("nombre"),
                         "sessions": stats["registros"], "present": stats["presente"], "justified": stats["justificada"],
                         "unjustified": stats["injustificada"], "injury": stats["lesion"],
                         "percentage": stats["porcentaje_presencia"]})
    else:
        percentages = player_percentages(trainings, allowed_ids, filters.get("date_from"), filters.get("date_to"))
        for player in allowed:
            stats = percentages.get(player.get("id"), {})
            rows.append({"name": _name(player), "team": team_map.get(player.get("equipo_id"), {}).get("nombre"),
                         "sessions": stats.get("registros", 0), "present": stats.get("presente", 0),
                         "justified": stats.get("justificada", 0), "unjustified": stats.get("injustificada", 0),
                         "injury": stats.get("lesion", 0), "percentage": stats.get("porcentaje_presencia", 0)})
        rows.sort(key=lambda row: (row.get("name") or "").casefold())
    total = attendance_summary(trainings, allowed_ids, filters.get("date_from"), filters.get("date_to"))
    return rows, {"groups": len(rows), "sessions": total["registros"], "present": total["presente"],
                  "justified": total["justificada"], "unjustified": total["injustificada"],
                  "injury": total["lesion"], "percentage": total["porcentaje_presencia"]}


def _simple_rows(report_id: str, context: Mapping[str, Any], filters: Mapping[str, Any], role: str) -> tuple[list[dict], dict]:
    players, teams = _maps(context)
    modalities = context.get("modalities", [])
    player_filters = dict(filters)
    if report_id in {"match_results", "callup_responses", "authorizations", "inscriptions",
                     "financial_summary"}:
        player_filters.pop("status", None)
    scoped_players = [p for p in players.values() if _player_allowed(p, player_filters, teams)]
    scoped_ids = {p["id"] for p in scoped_players}
    rows: list[dict] = []

    if report_id == "player_profile":
        for player in scoped_players:
            team = teams.get(player.get("equipo_id"), {})
            rows.append({"name": player.get("nombre"), "surname": player.get("apellidos"),
                         "birth_date": _date(player.get("fecha_nacimiento")), "team": team.get("nombre"),
                         "category": player.get("categoria"), "modality": _modality(team.get("modalidad") or player.get("modalidad"), modalities),
                         "number": player.get("dorsal"), "position": player.get("posicion"),
                         "license": player.get("numero_licencia"), "status": player.get("estado"),
                         "joined_at": _date(player.get("fecha_alta"))})
    elif report_id == "training_sessions":
        for item in context.get("trainings", []):
            team = teams.get(item.get("equipo_id"), {})
            if not _in_dates(item.get("fecha"), filters) or (filters.get("team_id") and item.get("equipo_id") != filters["team_id"]):
                continue
            if filters.get("category") and team.get("categoria") != filters["category"]:
                continue
            attendance = [row for row in item.get("asistencia", []) if row.get("player_id") in scoped_ids]
            counts = Counter(row.get("estado") for row in attendance)
            rows.append({"date": _date(item.get("fecha")), "time": item.get("hora"), "team": team.get("nombre"),
                         "location": item.get("campo"), "attendees": len(attendance), "present": counts["presente"],
                         "justified": counts["justificada"], "unjustified": counts["injustificada"], "injury": counts["lesion"]})
    elif report_id == "attendance_evolution":
        trend = attendance_trend(context.get("trainings", []), scoped_ids, filters.get("period") or "weekly",
                                 filters.get("date_from"), filters.get("date_to"))
        for item in trend:
            total = sum(item.get(key, 0) for key in ("presente", "justificada", "injustificada", "lesion"))
            rows.append({"period_label": item.get("periodo") or item.get("period"), "sessions": total,
                         "present": item.get("presente", 0), "justified": item.get("justificada", 0),
                         "unjustified": item.get("injustificada", 0), "injury": item.get("lesion", 0),
                         "percentage": round(item.get("presente", 0) * 100 / total, 1) if total else 0})
    elif report_id == "match_results":
        for match in context.get("matches", []):
            team = teams.get(match.get("equipo_id"), {})
            if not _in_dates(match.get("fecha"), filters) or (filters.get("team_id") and match.get("equipo_id") != filters["team_id"]):
                continue
            if filters.get("season") and match.get("temporada") != filters["season"]:
                continue
            if filters.get("category") and team.get("categoria") != filters["category"]:
                continue
            if filters.get("status") and match.get("estado") != filters["status"]:
                continue
            score = None if match.get("resultado_propio") is None or match.get("resultado_rival") is None else f"{match['resultado_propio']}-{match['resultado_rival']}"
            rows.append({"date": _date(match.get("fecha")), "time": match.get("hora"), "team": team.get("nombre"),
                         "opponent": match.get("rival"), "condition": match.get("condicion"),
                         "competition": match.get("tipo"), "status": match.get("estado"), "score": score})
    elif report_id in {"callup_responses", "callup_attendance"}:
        matches = {item.get("id"): item for item in context.get("matches", []) if item.get("id")}
        trainings_by_callup = {item.get("callup_id"): item for item in context.get("trainings", []) if item.get("callup_id")}
        for callup in context.get("callups", []):
            match = matches.get(callup.get("match_id"), {})
            team = teams.get(callup.get("equipo_id"), {})
            if not _in_dates(match.get("fecha"), filters) or (filters.get("team_id") and callup.get("equipo_id") != filters["team_id"]):
                continue
            if filters.get("season") and match.get("temporada") != filters["season"]:
                continue
            if filters.get("category") and team.get("categoria") != filters["category"]:
                continue
            attendance = {item.get("player_id"): item.get("estado") for item in trainings_by_callup.get(callup.get("id"), {}).get("asistencia", [])}
            for response in callup.get("convocados", []):
                player = players.get(response.get("player_id"))
                if not player or player.get("id") not in scoped_ids:
                    continue
                status = normalize_status(response.get("estado"))
                if filters.get("status") and status != filters["status"]:
                    continue
                base = {"date": _date(match.get("fecha")), "team": team.get("nombre"), "name": _name(player),
                        "response": status}
                if report_id == "callup_responses":
                    rows.append({**base, "opponent": match.get("rival"), "responded_at": response.get("responded_at"),
                                 "late": bool(response.get("late"))})
                else:
                    actual = attendance.get(player.get("id"))
                    expected = "presente" if status == "confirmed" else None
                    rows.append({**base, "attendance_status": actual,
                                 "consistent": actual == expected if expected else actual not in {"presente"}})
    elif report_id == "modality_distribution":
        grouped: dict[str, dict] = defaultdict(lambda: {"teams": set(), "players": 0, "capacity": 0})
        for player in scoped_players:
            team = teams.get(player.get("equipo_id"), {})
            code = _modality(team.get("modalidad") or player.get("modalidad"), modalities)
            if not code or (filters.get("modality") and code != filters["modality"]):
                continue
            grouped[code]["teams"].add(team.get("id"))
            grouped[code]["players"] += 1
        for code, item in grouped.items():
            item["capacity"] = sum(int(teams[team_id].get("limite_jugadores") or 0) for team_id in item["teams"] if team_id in teams)
            rows.append({"modality": code, "teams": len(item["teams"]), "players": item["players"],
                         "capacity": item["capacity"], "occupancy": round(item["players"] * 100 / item["capacity"], 1) if item["capacity"] else 0})
    elif report_id == "inscriptions":
        for item in context.get("inscriptions", []):
            team = teams.get(item.get("equipo_id"), {})
            if filters.get("season") and item.get("temporada") != filters["season"]:
                continue
            if filters.get("category") and item.get("categoria") != filters["category"]:
                continue
            if filters.get("team_id") and item.get("equipo_id") != filters["team_id"]:
                continue
            if filters.get("status") and item.get("estado") != filters["status"]:
                continue
            if filters.get("type") and item.get("tipo") != filters["type"]:
                continue
            query = str(filters.get("search") or "").casefold()
            if query and query not in _name(item).casefold():
                continue
            rows.append({"date": _date(item.get("created_at") or item.get("fecha_inscripcion")),
                         "name": item.get("nombre"), "surname": item.get("apellidos"), "type": item.get("tipo"),
                         "season": item.get("temporada"), "team": team.get("nombre"), "category": item.get("categoria"),
                         "modality": _modality(item.get("modalidad") or team.get("modalidad"), modalities),
                         "status": item.get("estado")})
    elif report_id == "player_movements":
        for player in scoped_players:
            events = [("alta", player.get("fecha_alta") or player.get("fecha_inscripcion"))]
            if player.get("fecha_baja") or player.get("estado") == "baja":
                events.append(("baja", player.get("fecha_baja")))
            for movement, event_date in events:
                if filters.get("movement") and movement != filters["movement"]:
                    continue
                if not _in_dates(event_date, filters):
                    continue
                team = teams.get(player.get("equipo_id"), {})
                rows.append({"name": player.get("nombre"), "surname": player.get("apellidos"),
                             "team": team.get("nombre"), "category": player.get("categoria"),
                             "movement": movement, "date": _date(event_date), "status": player.get("estado")})
    elif report_id == "documentation":
        document_fields = {
            "doc_dni_jugador": "DNI jugador", "doc_dni_tutor": "DNI tutor", "doc_foto": "Foto",
            "doc_autorizacion": "Autorización", "doc_justificante_pago": "Justificante de pago",
            "doc_ficha_federativa": "Ficha federativa",
        }
        for player in scoped_players:
            missing = [label for key, label in document_fields.items() if not player.get(key)]
            if not missing and not filters.get("status"):
                continue
            team = teams.get(player.get("equipo_id"), {})
            rows.append({"name": player.get("nombre"), "surname": player.get("apellidos"),
                         "team": team.get("nombre"), "category": player.get("categoria"),
                         "document_status": player.get("estado_documental"), "missing_documents": ", ".join(missing)})
    elif report_id == "authorizations":
        for item in context.get("authorizations", []):
            player = players.get(item.get("player_id"))
            if not player or player.get("id") not in scoped_ids:
                continue
            if filters.get("status") and item.get("estado") != filters["status"]:
                continue
            if filters.get("type") and item.get("tipo") != filters["type"]:
                continue
            rows.append({"name": _name(player), "team": teams.get(player.get("equipo_id"), {}).get("nombre"),
                         "authorization_type": item.get("tipo"), "status": item.get("estado"),
                         "signed_at": _date(item.get("fecha_firma")), "expires_at": _date(item.get("fecha_caducidad"))})
    elif report_id == "incomplete_data":
        required = {"fecha_nacimiento": "Fecha de nacimiento", "categoria": "Categoría",
                    "equipo_id": "Equipo", "dorsal": "Dorsal", "familia_id": "Familia"}
        for player in scoped_players:
            missing = [label for key, label in required.items() if player.get(key) in (None, "")]
            if not missing:
                continue
            rows.append({"name": player.get("nombre"), "surname": player.get("apellidos"),
                         "team": teams.get(player.get("equipo_id"), {}).get("nombre"),
                         "category": player.get("categoria"), "missing_count": len(missing),
                         "missing_fields": ", ".join(missing)})
    elif report_id == "equipment":
        for player in scoped_players:
            delivered = bool(player.get("equipacion_entregada"))
            if filters.get("delivery") == "delivered" and not delivered:
                continue
            if filters.get("delivery") == "pending" and delivered:
                continue
            items = player.get("equipamiento_items") or player.get("equipaciones") or ["Equipación"]
            if not isinstance(items, list):
                items = [items]
            for item in items:
                rows.append({"name": player.get("nombre"), "surname": player.get("apellidos"),
                             "team": teams.get(player.get("equipo_id"), {}).get("nombre"),
                             "category": player.get("categoria"), "equipment_item": item,
                             "shirt_size": player.get("talla_camiseta"), "shorts_size": player.get("talla_pantalon"),
                             "tracksuit_size": player.get("talla_chandal"), "delivered": delivered,
                             "delivery_date": _date(player.get("fecha_entrega_equipacion"))})
    elif report_id == "family_contacts":
        family_map = {item.get("id"): item for item in context.get("families", []) if item.get("id")}
        for player in scoped_players:
            family = family_map.get(player.get("familia_id"), {})
            contacts = [
                (family.get("progenitor1_nombre") or player.get("progenitor1_nombre"),
                 family.get("progenitor1_telefono") or player.get("progenitor1_telefono"),
                 family.get("progenitor1_email") or player.get("progenitor1_email")),
                (family.get("progenitor2_nombre") or player.get("progenitor2_nombre"),
                 family.get("progenitor2_telefono") or player.get("progenitor2_telefono"),
                 family.get("progenitor2_email") or player.get("progenitor2_email")),
            ]
            for contact_name, phone, email in contacts:
                contact_type = filters.get("contact_type")
                if contact_type == "phone" and not phone:
                    continue
                if contact_type == "email" and not email:
                    continue
                if not phone and not email:
                    continue
                rows.append({"name": _name(player), "team": teams.get(player.get("equipo_id"), {}).get("nombre"),
                             "contact_name": contact_name,
                             "phone": phone if contact_type != "email" else None,
                             "email": email if contact_type != "phone" else None})
    elif report_id == "player_stats":
        for item in context.get("stats", []):
            player = players.get(item.get("player_id"))
            if not player or player.get("id") not in scoped_ids:
                continue
            if filters.get("season") and item.get("temporada") != filters["season"]:
                continue
            rows.append({"name": _name(player), "team": teams.get(player.get("equipo_id"), {}).get("nombre"),
                         "season": item.get("temporada"), "matches_called": item.get("partidos_convocado"),
                         "matches_played": item.get("partidos_jugados"), "minutes": item.get("minutos"),
                         "goals": item.get("goles"), "assists": item.get("asistencias"),
                         "yellow_cards": item.get("amarillas"), "red_cards": item.get("rojas"),
                         "rating": item.get("valoracion")})
    elif report_id == "financial_summary":
        for item in context.get("payments", []):
            player = players.get(item.get("player_id"))
            if not player or player.get("id") not in scoped_ids:
                continue
            if filters.get("status") and item.get("estado") != filters["status"]:
                continue
            if filters.get("payment_method") and item.get("forma_pago") != filters["payment_method"]:
                continue
            if not _in_dates(item.get("fecha_pago") or item.get("created_at"), filters):
                continue
            expected = float(item.get("importe_final") or 0)
            status = item.get("estado")
            paid = expected if status == "pagado" else 0
            pending = expected - paid
            rows.append({"name": _name(player), "team": teams.get(player.get("equipo_id"), {}).get("nombre"),
                         "concept": item.get("concepto"), "expected": expected, "paid": paid, "pending": pending,
                         "payment_method": item.get("forma_pago"), "payment_date": _date(item.get("fecha_pago")),
                         "status": status})

    rows.sort(key=lambda row: tuple(str(row.get(key) or "").casefold() for key in ("date", "period_label", "team", "surname", "name")))
    totals: dict[str, Any] = {"rows": len(rows)}
    if report_id == "financial_summary":
        totals.update({"expected": round(sum(row["expected"] for row in rows), 2),
                       "paid": round(sum(row["paid"] for row in rows), 2),
                       "pending": round(sum(row["pending"] for row in rows), 2)})
    elif report_id == "modality_distribution":
        totals.update({"players": sum(row["players"] for row in rows), "teams": sum(row["teams"] for row in rows)})
    elif report_id == "equipment":
        totals.update({"players": len({(row["name"], row["team"]) for row in rows}), "items": len(rows),
                       "delivered": sum(bool(row["delivered"]) for row in rows)})
    return rows, totals


def safe_rows(rows: Iterable[Mapping[str, Any]]) -> list[dict]:
    return [{key: value for key, value in row.items() if key in SAFE_COLUMNS} for row in rows]


def build_report(report_id: str, context: Mapping[str, Any], filters: Mapping[str, Any],
                 role: str) -> tuple[dict, list[dict], dict]:
    """Único punto de cálculo para que vista previa y exportaciones coincidan."""
    definition = REPORTS.get(report_id)
    if not definition or role not in definition["roles"]:
        raise ReportValidationError("Informe no autorizado")
    if report_id == "roster":
        rows, totals = build_roster(context["players"], context["teams"], filters, context["modalities"])
    elif report_id == "attendance":
        rows, totals = build_attendance(context["players"], context["teams"], context["trainings"], filters, role)
    else:
        rows, totals = _simple_rows(report_id, context, filters, role)
    return {key: value for key, value in definition.items() if key != "roles"}, safe_rows(rows), totals


def enforce_export_limit(rows: Iterable[Mapping[str, Any]], maximum: int = MAX_EXPORT_ROWS) -> list[dict]:
    rows = list(rows)
    if len(rows) > maximum:
        raise ReportValidationError(f"La exportación supera el límite de {maximum} filas")
    return rows
