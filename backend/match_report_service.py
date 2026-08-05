"""Reglas puras del acta profesional y rendimiento objetivo en partidos.

La capa no conoce MongoDB ni usuarios. Recibe estructuras ya autorizadas y
devuelve validaciones deterministas para que API, pruebas e importadores usen
exactamente las mismas reglas deportivas.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from copy import deepcopy
from typing import Any, Iterable, Mapping, Optional


class MatchReportValidationError(ValueError):
    """Configuración o estructura deportiva no válida."""


DEFAULT_PERIOD_CONFIGURATIONS = {
    "F7": {
        "code": "F7",
        "periods": [
            {"id": "T1", "name_es": "Tiempo 1", "name_eu": "1. denbora", "planned_minutes": 20},
            {"id": "T2", "name_es": "Tiempo 2", "name_eu": "2. denbora", "planned_minutes": 20},
            {"id": "T3", "name_es": "Tiempo 3", "name_eu": "3. denbora", "planned_minutes": 20},
        ],
        "additional_minutes": 0,
        "rules": {"max_starters": 7},
    },
    "F11": {
        "code": "F11",
        "periods": [
            {"id": "P1", "name_es": "Primera parte", "name_eu": "Lehen zatia", "planned_minutes": 45},
            {"id": "P2", "name_es": "Segunda parte", "name_eu": "Bigarren zatia", "planned_minutes": 45},
        ],
        "additional_minutes": 0,
        "rules": {"max_starters": 11},
    },
}

PARTICIPATION_ROLES = frozenset({
    "starter", "substitute", "did_not_play", "absent", "late_withdrawal", "not_called",
})
CHANGE_KINDS = frozenset({"entry", "exit"})
GOAL_KINDS = frozenset({"player", "opponent_own_goal", "unidentified"})


def _non_negative_int(value: Any, field: str) -> int:
    if isinstance(value, bool):
        raise MatchReportValidationError(f"{field} debe ser un número entero")
    try:
        number = int(value or 0)
    except (TypeError, ValueError) as exc:
        raise MatchReportValidationError(f"{field} debe ser un número entero") from exc
    if number < 0:
        raise MatchReportValidationError(f"{field} no puede ser negativo")
    return number


def period_configuration(modality: Any, custom: Optional[Mapping[str, Any]] = None) -> dict:
    code = str(modality or "").strip().upper()
    if code not in DEFAULT_PERIOD_CONFIGURATIONS:
        raise MatchReportValidationError("La modalidad no tiene una configuración de periodos reconocida")
    config = deepcopy(DEFAULT_PERIOD_CONFIGURATIONS[code])
    if custom:
        allowed = {"code", "periods", "additional_minutes", "rules", "real_minutes", "total_minutes"}
        unknown = set(custom) - allowed
        if unknown:
            raise MatchReportValidationError(f"Configuración de periodos desconocida: {', '.join(sorted(unknown))}")
        custom_config = deepcopy(dict(custom))
        if "rules" in custom_config:
            custom_config["rules"] = {**config.get("rules", {}), **(custom_config.get("rules") or {})}
        config.update(custom_config)
        config["code"] = code
    periods = config.get("periods") or []
    if not periods:
        raise MatchReportValidationError("La modalidad debe contener al menos un periodo")
    seen: set[str] = set()
    normalized = []
    for raw in periods:
        identifier = str(raw.get("id") or "").strip()
        if not identifier or identifier in seen:
            raise MatchReportValidationError("Los periodos requieren identificadores únicos")
        planned = _non_negative_int(raw.get("planned_minutes"), "La duración prevista")
        if planned <= 0:
            raise MatchReportValidationError("La duración prevista debe ser mayor que cero")
        real = raw.get("real_minutes")
        normalized.append({
            "id": identifier,
            "name_es": str(raw.get("name_es") or identifier).strip(),
            "name_eu": str(raw.get("name_eu") or identifier).strip(),
            "planned_minutes": planned,
            "real_minutes": _non_negative_int(real, "La duración real") if real is not None else None,
            "additional_minutes": _non_negative_int(raw.get("additional_minutes"), "El tiempo adicional"),
        })
        seen.add(identifier)
    config["periods"] = normalized
    config["additional_minutes"] = _non_negative_int(config.get("additional_minutes"), "El tiempo adicional")
    rules = dict(config.get("rules") or {})
    max_starters = _non_negative_int(rules.get("max_starters"), "El máximo de titulares")
    if max_starters <= 0:
        raise MatchReportValidationError("El máximo de titulares debe ser mayor que cero")
    rules["max_starters"] = max_starters
    config["rules"] = rules
    config["total_minutes"] = sum(
        (row["real_minutes"] if row["real_minutes"] is not None else row["planned_minutes"])
        + row["additional_minutes"]
        for row in normalized
    ) + config["additional_minutes"]
    return config


def normalize_participant(raw: Mapping[str, Any]) -> dict:
    player_id = str(raw.get("player_id") or "").strip()
    if not player_id:
        raise MatchReportValidationError("Cada participante requiere un jugador")
    role = str(raw.get("role") or "did_not_play").strip()
    if role not in PARTICIPATION_ROLES:
        raise MatchReportValidationError("El estado de participación no es válido")
    changes = []
    for change in raw.get("changes") or []:
        kind = str(change.get("kind") or "").strip()
        if kind not in CHANGE_KINDS:
            raise MatchReportValidationError("El cambio debe ser una entrada o una salida")
        changes.append({
            "kind": kind,
            "period_id": str(change.get("period_id") or "").strip(),
            "minute": _non_negative_int(change.get("minute"), "El minuto del cambio"),
        })
    return {
        "player_id": player_id,
        "player_name": str(raw.get("player_name") or "").strip() or None,
        "called_up": bool(raw.get("called_up", role != "not_called")),
        "callup_response": raw.get("callup_response"),
        "callup_response_original": raw.get("callup_response_original", raw.get("callup_response")),
        "role": role,
        "played": bool(raw.get("played", role in {"starter", "substitute"})),
        "shirt_number": str(raw.get("shirt_number") or "").strip() or None,
        "initial_position": str(raw.get("initial_position") or "").strip() or None,
        "minutes": _non_negative_int(raw.get("minutes"), "Los minutos"),
        "initial_period": str(raw.get("initial_period") or "").strip() or None,
        "final_period": str(raw.get("final_period") or "").strip() or None,
        "period_ids": list(dict.fromkeys(str(value).strip() for value in (raw.get("period_ids") or []) if str(value).strip())),
        "entries": _non_negative_int(raw.get("entries"), "Las entradas"),
        "exits": _non_negative_int(raw.get("exits"), "Las salidas"),
        "changes": changes,
        "goals": _non_negative_int(raw.get("goals"), "Los goles"),
        "own_goals": _non_negative_int(raw.get("own_goals"), "Los goles en propia puerta"),
        "incidents": [str(value).strip() for value in (raw.get("incidents") or []) if str(value).strip()],
        "non_participation_reason": str(raw.get("non_participation_reason") or "").strip() or None,
        "exceptional_reason": str(raw.get("exceptional_reason") or "").strip() or None,
        "availability_override_reason": str(raw.get("availability_override_reason") or "").strip() or None,
        "minutes_override_reason": str(raw.get("minutes_override_reason") or "").strip() or None,
        "internal_notes": str(raw.get("internal_notes") or "").strip() or None,
        "origin": str(raw.get("origin") or "manual").strip(),
        "original_value": raw.get("original_value"),
        "warning_confirmed": bool(raw.get("warning_confirmed", False)),
    }


def validate_participants(
    participants: Iterable[Mapping[str, Any]],
    period_config: Mapping[str, Any],
    *,
    official_own_goals: Optional[int] = None,
    strict: bool = False,
) -> dict:
    normalized = []
    errors: list[str] = []
    warnings: list[str] = []
    for raw in participants:
        try:
            normalized.append(normalize_participant(raw))
        except MatchReportValidationError as exc:
            errors.append(str(exc))
    duplicate_ids = sorted(player_id for player_id, count in Counter(row["player_id"] for row in normalized).items() if count > 1)
    if duplicate_ids:
        errors.append(f"Jugador duplicado en el acta: {', '.join(duplicate_ids)}")
    period_ids = {row["id"] for row in period_config.get("periods") or []}
    total_minutes = _non_negative_int(period_config.get("total_minutes"), "La duración del partido")
    max_starters = _non_negative_int((period_config.get("rules") or {}).get("max_starters"), "El máximo de titulares")
    starters = [row["player_id"] for row in normalized if row["role"] == "starter"]
    if len(starters) > max_starters:
        errors.append(
            f"La alineación contiene {len(starters)} titulares y la modalidad permite {max_starters}"
        )
    for row in normalized:
        label = row["player_id"]
        selected_periods = set(row["period_ids"])
        if not selected_periods.issubset(period_ids):
            errors.append(f"El jugador {label} contiene un periodo no configurado")
        if row["initial_period"] and row["initial_period"] not in period_ids:
            errors.append(f"El periodo inicial del jugador {label} no es válido")
        if row["final_period"] and row["final_period"] not in period_ids:
            errors.append(f"El periodo final del jugador {label} no es válido")
        if row["initial_period"] and selected_periods and row["initial_period"] not in selected_periods:
            errors.append(f"El periodo inicial del jugador {label} no figura entre sus periodos disputados")
        if row["final_period"] and selected_periods and row["final_period"] not in selected_periods:
            errors.append(f"El periodo final del jugador {label} no figura entre sus periodos disputados")
        if row["minutes"] > total_minutes:
            if row["minutes_override_reason"] and row["warning_confirmed"]:
                warnings.append(
                    f"Los minutos del jugador {label} superan la duración y utilizan una corrección administrativa"
                )
            else:
                errors.append(f"Los minutos del jugador {label} superan la duración configurada")
        if not row["played"] and (row["minutes"] or selected_periods or row["entries"] or row["exits"]):
            errors.append(f"El jugador {label} figura como no participa pero contiene minutos, periodos o cambios")
        if not row["played"] and row["goals"]:
            errors.append(f"El jugador {label} figura como no participante pero tiene goles atribuidos")
        if row["played"] and strict and row["minutes"] <= 0:
            errors.append(f"El jugador {label} figura como participante sin minutos")
        if row["played"] and strict and not selected_periods:
            errors.append(f"El jugador {label} figura como participante sin periodos disputados")
        if row["role"] == "starter" and not row["played"]:
            errors.append(f"El titular {label} debe figurar como participante real")
        if row["role"] in {"did_not_play", "absent", "late_withdrawal", "not_called"} and row["played"]:
            errors.append(f"El estado del jugador {label} no es coherente con su participación")
        if row["role"] in {"did_not_play", "absent", "late_withdrawal"} and not row["non_participation_reason"]:
            warnings.append(f"El jugador {label} no participa y no tiene motivo registrado")
        if row["role"] == "not_called" and row["called_up"]:
            errors.append(f"El jugador {label} figura simultáneamente como convocado y no convocado")
        if row["entries"] > row["exits"] + 1:
            errors.append(f"Las entradas y salidas del jugador {label} no son coherentes")
        counted_entries = sum(change["kind"] == "entry" for change in row["changes"])
        counted_exits = sum(change["kind"] == "exit" for change in row["changes"])
        if row["changes"] and (counted_entries != row["entries"] or counted_exits != row["exits"]):
            errors.append(f"Los cambios del jugador {label} no coinciden con sus entradas y salidas")
        for change in row["changes"]:
            if change["period_id"] not in period_ids:
                errors.append(f"El cambio del jugador {label} contiene un periodo no configurado")
            if change["minute"] > total_minutes:
                errors.append(f"El cambio del jugador {label} supera la duración configurada")
        response = str(row.get("callup_response") or "").strip().lower()
        if response in {"declined", "rechazada", "rechazado", "no_puede"} and row["played"]:
            if not row["availability_override_reason"] or not row["warning_confirmed"]:
                errors.append(
                    f"El jugador {label} rechazó la convocatoria y requiere confirmación y motivo para participar"
                )
            else:
                warnings.append(f"El jugador {label} participó tras rechazar la convocatoria")
        if not row["called_up"] and row["role"] != "not_called":
            if not row["exceptional_reason"] or not row["warning_confirmed"]:
                errors.append(
                    f"El jugador {label} no estaba convocado y requiere confirmación y motivo de incorporación"
                )
            else:
                warnings.append(f"El jugador {label} se incorporó excepcionalmente sin convocatoria")
    if official_own_goals is not None:
        registered = sum(row["goals"] for row in normalized)
        if registered != int(official_own_goals):
            warnings.append(
                f"Los goleadores registrados ({registered}) no coinciden con el marcador oficial ({official_own_goals})"
            )
    return {"participants": normalized, "errors": errors, "warnings": warnings, "strict": strict}


def normalize_substitution(raw: Mapping[str, Any]) -> dict:
    incoming = str(raw.get("incoming_player_id") or "").strip()
    outgoing = str(raw.get("outgoing_player_id") or "").strip()
    if not incoming or not outgoing:
        raise MatchReportValidationError("Cada sustitución requiere jugador entrante y saliente")
    if incoming == outgoing:
        raise MatchReportValidationError("El jugador entrante y saliente no pueden ser la misma persona")
    return {
        "id": str(raw.get("id") or "").strip() or None,
        "incoming_player_id": incoming,
        "outgoing_player_id": outgoing,
        "period_id": str(raw.get("period_id") or "").strip(),
        "minute": _non_negative_int(raw.get("minute"), "El minuto de la sustitución"),
        "notes": str(raw.get("notes") or "").strip() or None,
        "created_at": raw.get("created_at"),
        "created_by": raw.get("created_by"),
        "updated_at": raw.get("updated_at"),
        "updated_by": raw.get("updated_by"),
    }


def _minute_matches_period(minute: int, period_id: str, period_config: Mapping[str, Any]) -> bool:
    elapsed = 0
    for period in period_config.get("periods") or []:
        duration = (
            period.get("real_minutes") if period.get("real_minutes") is not None
            else period.get("planned_minutes")
        ) or 0
        duration += period.get("additional_minutes") or 0
        start, end = elapsed, elapsed + int(duration)
        if period.get("id") == period_id:
            return start <= minute <= end
        elapsed = end
    return False


def validate_substitutions(
    participants: Iterable[Mapping[str, Any]],
    substitutions: Iterable[Mapping[str, Any]],
    period_config: Mapping[str, Any],
) -> dict:
    rows = [normalize_participant(row) for row in participants]
    participant_ids = {row["player_id"] for row in rows}
    period_order = {row["id"]: index for index, row in enumerate(period_config.get("periods") or [])}
    total_minutes = _non_negative_int(period_config.get("total_minutes"), "La duración del partido")
    max_active = _non_negative_int((period_config.get("rules") or {}).get("max_starters"), "El máximo de titulares")
    errors: list[str] = []
    normalized = []
    for raw in substitutions:
        try:
            row = normalize_substitution(raw)
            normalized.append(row)
        except MatchReportValidationError as exc:
            errors.append(str(exc))
    active = {row["player_id"] for row in rows if row["role"] == "starter"}
    if len(active) > max_active:
        errors.append(f"La alineación inicial supera el límite de {max_active} jugadores")
    ordered = sorted(
        normalized,
        key=lambda row: (period_order.get(row["period_id"], 10_000), row["minute"], row.get("id") or ""),
    )
    for row in ordered:
        incoming = row["incoming_player_id"]
        outgoing = row["outgoing_player_id"]
        if incoming not in participant_ids or outgoing not in participant_ids:
            errors.append("La sustitución contiene un jugador ajeno al acta")
            continue
        if row["period_id"] not in period_order:
            errors.append("La sustitución contiene un periodo no configurado")
        if row["minute"] > total_minutes:
            errors.append("La sustitución supera la duración configurada")
        elif row["period_id"] in period_order and not _minute_matches_period(row["minute"], row["period_id"], period_config):
            errors.append("El minuto de la sustitución no pertenece al periodo indicado")
        if outgoing not in active:
            errors.append(f"El jugador {outgoing} no estaba activo al producirse la sustitución")
        if incoming in active:
            errors.append(f"El jugador {incoming} ya estaba activo al producirse la sustitución")
        if outgoing in active and incoming not in active:
            active.remove(outgoing)
            active.add(incoming)
        if len(active) > max_active:
            errors.append(f"La sustitución supera el límite simultáneo de {max_active} jugadores")
    return {"substitutions": normalized, "errors": errors}


def normalize_goal_event(raw: Mapping[str, Any]) -> dict:
    kind = str(raw.get("kind") or "player").strip()
    if kind not in GOAL_KINDS:
        raise MatchReportValidationError("El tipo de gol no es válido")
    scorer_id = str(raw.get("scorer_player_id") or "").strip() or None
    if kind == "player" and not scorer_id:
        raise MatchReportValidationError("El gol de jugador requiere un goleador")
    if kind != "player":
        # El selector puede conservar un valor anterior al cambiar el tipo de
        # gol. Los eventos sin autor no deben guardar ni mostrar un goleador
        # residual, aunque el cliente lo envíe por error.
        scorer_id = None
    return {
        "id": str(raw.get("id") or "").strip() or None,
        "kind": kind,
        "scorer_player_id": scorer_id,
        "period_id": str(raw.get("period_id") or "").strip(),
        "minute": _non_negative_int(raw.get("minute"), "El minuto del gol"),
        "notes": str(raw.get("notes") or "").strip() or None,
        "created_at": raw.get("created_at"),
        "created_by": raw.get("created_by"),
        "updated_at": raw.get("updated_at"),
        "updated_by": raw.get("updated_by"),
    }


def validate_goal_events(
    participants: Iterable[Mapping[str, Any]],
    goal_events: Iterable[Mapping[str, Any]],
    period_config: Mapping[str, Any],
    *,
    official_own_goals: Optional[int],
    strict: bool,
    discrepancy_confirmed: bool = False,
    discrepancy_reason: Optional[str] = None,
) -> dict:
    normalized_participants = [normalize_participant(row) for row in participants]
    participant_ids = {row["player_id"] for row in normalized_participants}
    played_ids = {row["player_id"] for row in normalized_participants if row["played"]}
    period_ids = {row["id"] for row in period_config.get("periods") or []}
    total_minutes = _non_negative_int(period_config.get("total_minutes"), "La duración del partido")
    errors: list[str] = []
    warnings: list[str] = []
    normalized = []
    for raw in goal_events:
        try:
            row = normalize_goal_event(raw)
            normalized.append(row)
        except MatchReportValidationError as exc:
            errors.append(str(exc))
    for row in normalized:
        if row["kind"] == "player" and row["scorer_player_id"] not in participant_ids:
            errors.append("El goleador no pertenece al acta")
        elif row["kind"] == "player" and row["scorer_player_id"] not in played_ids:
            errors.append("El goleador no figura como participante real")
        if row["period_id"] not in period_ids:
            errors.append("El gol contiene un periodo no configurado")
        if row["minute"] > total_minutes:
            errors.append("El gol supera la duración configurada")
        elif row["period_id"] in period_ids and not _minute_matches_period(row["minute"], row["period_id"], period_config):
            errors.append("El minuto del gol no pertenece al periodo indicado")
    if official_own_goals is not None and len(normalized) != int(official_own_goals):
        message = (
            f"Los goles registrados ({len(normalized)}) no coinciden con el marcador oficial "
            f"({int(official_own_goals)})"
        )
        if strict and not (discrepancy_confirmed and str(discrepancy_reason or "").strip()):
            errors.append(message)
        else:
            warnings.append(message)
    return {"goal_events": normalized, "errors": errors, "warnings": warnings}


def build_objective_statistics(reports: Iterable[Mapping[str, Any]], filters: Optional[Mapping[str, Any]] = None) -> dict:
    filters = dict(filters or {})
    totals = defaultdict(int)
    by_player: dict[str, dict] = {}
    player_names: dict[str, str] = {}
    period_counts = defaultdict(int)
    by_team: dict[str, dict] = {}
    accepted = 0
    for report in reports:
        if report.get("status") != "closed":
            continue
        if any(filters.get(field) and report.get(field) != filters[field]
               for field in ("temporada", "categoria", "equipo_id", "modalidad", "competicion")):
            continue
        match_date = str(report.get("fecha") or "")
        if filters.get("desde") and match_date < str(filters["desde"]):
            continue
        if filters.get("hasta") and match_date > str(filters["hasta"]):
            continue
        team_id = str(report.get("equipo_id") or "").strip() or "unknown"
        team_target = by_team.setdefault(team_id, defaultdict(int))
        team_target["matches"] += 1
        team_target["goals"] += len(report.get("goal_events") or [])
        used_players: set[str] = set()
        configured_minutes = _non_negative_int(
            (report.get("period_configuration") or {}).get("total_minutes"),
            "La duración del partido",
        )
        for raw in report.get("participants") or []:
            try:
                row = normalize_participant(raw)
            except MatchReportValidationError:
                continue
            if filters.get("player_id") and row["player_id"] != filters["player_id"]:
                continue
            accepted += 1
            target = by_player.setdefault(row["player_id"], defaultdict(int))
            if row.get("player_name"):
                player_names.setdefault(row["player_id"], row["player_name"])
            metrics = {
                "called_matches": int(row["called_up"]),
                "available_matches": int(
                    row["called_up"] and str(row.get("callup_response") or "").lower()
                    not in {"declined", "rechazada", "rechazado", "no_puede"}
                ),
                "starts": int(row["role"] == "starter"),
                "substitute_matches": int(row["role"] == "substitute"),
                "played_matches": int(row["played"]),
                "did_not_play": int(row["role"] == "did_not_play" or (row["called_up"] and not row["played"])),
                "minutes": row["minutes"],
                "entries": row["entries"],
                "exits": row["exits"],
                "goals": row["goals"],
                "own_goals": row["own_goals"],
                "incidents": len(row["incidents"]),
            }
            for key, value in metrics.items():
                totals[key] += value
                target[key] += value
                if key in {"starts", "played_matches", "minutes", "goals"}:
                    team_target[key] += value
            target["possible_minutes"] += configured_minutes
            if row["played"]:
                used_players.add(row["player_id"])
            for period_id in row["period_ids"]:
                period_counts[period_id] += 1
        team_target["players_used"] += len(used_players)
    metric_keys = (
        "called_matches", "available_matches", "starts", "substitute_matches", "played_matches", "did_not_play",
        "minutes", "entries", "exits", "goals", "own_goals", "incidents",
    )
    player_rows = []
    for player_id, values in sorted(by_player.items()):
        played_matches = values["played_matches"]
        possible_minutes = values["possible_minutes"]
        player_rows.append({
            "player_id": player_id,
            "player_name": player_names.get(player_id),
            **{key: values[key] for key in metric_keys},
            "minutes_percentage": round(values["minutes"] * 100 / possible_minutes, 2) if possible_minutes else 0,
            "average_minutes": round(values["minutes"] / played_matches, 2) if played_matches else 0,
        })
    return {
        "totals": {key: totals[key] for key in metric_keys},
        "players": player_rows,
        "teams": [{"team_id": team_id, **dict(values)} for team_id, values in sorted(by_team.items())],
        "periods": dict(sorted(period_counts.items())),
        "rows": accepted,
        "filters": filters,
    }


def dry_run_historical_rows(
    rows: Iterable[Mapping[str, Any]],
    *,
    known_match_ids: set[str],
    known_player_ids: set[str],
    closed_match_ids: Optional[set[str]] = None,
    match_contexts: Optional[Mapping[str, Mapping[str, Any]]] = None,
    player_contexts: Optional[Mapping[str, Mapping[str, Any]]] = None,
) -> dict:
    source = [dict(row) for row in rows]
    closed = set(closed_match_ids or set())
    matches = dict(match_contexts or {})
    players = dict(player_contexts or {})
    seen: set[tuple[str, str]] = set()
    output = []
    summary = {"rows": len(source), "valid": 0, "warnings": 0, "errors": 0, "duplicates": 0}
    for index, row in enumerate(source, start=1):
        match_id = str(row.get("match_id") or "").strip()
        player_id = str(row.get("player_id") or "").strip()
        errors = []
        warnings = []
        key = (match_id, player_id)
        if not match_id or match_id not in known_match_ids:
            errors.append("El partido no existe o es ambiguo")
        if not player_id or player_id not in known_player_ids:
            errors.append("El jugador no existe o es ambiguo")
        if key in seen:
            errors.append("Fila duplicada para el mismo partido y jugador")
            summary["duplicates"] += 1
        if match_id in closed:
            errors.append("El acta está cerrada y no puede sobrescribirse")
        match_context = matches.get(match_id) or {}
        player_context = players.get(player_id) or {}
        match_team_id = str(match_context.get("team_id") or "").strip()
        player_team_id = str(player_context.get("team_id") or "").strip()
        if match_team_id and player_team_id and match_team_id != player_team_id:
            errors.append("El jugador no pertenece al equipo del partido")
        modality = str(row.get("modality") or row.get("modalidad") or match_context.get("modality") or "").upper()
        try:
            config = period_configuration(modality)
        except MatchReportValidationError as exc:
            errors.append(str(exc))
            config = None
        candidate = {
            **row,
            "player_id": player_id,
            "role": row.get("role") or "did_not_play",
            "played": bool(row.get("played", bool(row.get("minutes")))),
            "period_ids": row.get("period_ids") or row.get("periods") or [],
            "goals": row.get("goals", 0),
            "own_goals": row.get("own_goals", 0),
        }
        for field, label in (
            ("minutes", "Los minutos"), ("entries", "Las entradas"), ("exits", "Las salidas"),
            ("goals", "Los goles"), ("own_goals", "Los goles en propia puerta"),
        ):
            try:
                candidate[field] = _non_negative_int(candidate.get(field), label)
            except MatchReportValidationError as exc:
                errors.append(str(exc))
                candidate[field] = 0
        if row.get("incidents") is not None and not isinstance(row.get("incidents"), list):
            errors.append("Las incidencias deben ser una lista")
            candidate["incidents"] = []
        try:
            normalized = normalize_participant(candidate)
            if config:
                row_validation = validate_participants([normalized], config, strict=False)
                errors.extend(row_validation["errors"])
                warnings.extend(row_validation["warnings"])
        except MatchReportValidationError as exc:
            errors.append(str(exc))
        seen.add(key)
        if errors:
            status = "error"
            summary["errors"] += 1
        elif warnings:
            status = "warning"
            summary["warnings"] += 1
        else:
            status = "valid"
            summary["valid"] += 1
        output.append({"row": index, "status": status, "errors": errors, "warnings": warnings, "original": row})
    return {"dry_run": True, "can_import": summary["errors"] == 0, "summary": summary, "rows": output}
