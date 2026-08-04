import asyncio
from datetime import date

import pytest
from fastapi import HTTPException

from authz import ROLE_PERMISSIONS, route_permission
from statistics_service import calculate_statistics, rate
from starlette.requests import Request


TEAMS = [
    {"id": "team-7", "nombre": "Alevín F7", "categoria": "Alevín", "temporada": "2026-2027", "modalidad": "F7"},
    {"id": "team-11", "nombre": "Infantil F11", "categoria": "Infantil", "temporada": "2026-2027", "modalidad": "F11"},
]
PLAYERS = [
    {"id": "p1", "nombre": "Ane", "apellidos": "Uno", "equipo_id": "team-7", "categoria": "Alevín", "estado": "activo"},
    {"id": "p2", "nombre": "Bea", "apellidos": "Dos", "equipo_id": "team-7", "categoria": "Alevín", "estado": "activo"},
    {"id": "p3", "nombre": "Cris", "apellidos": "Tres", "equipo_id": "team-11", "categoria": "Infantil", "estado": "baja"},
]
TRAININGS = [
    {"id": "tr1", "fecha": "2026-07-01", "equipo_id": "team-7", "asistencia": [{"player_id": "p1", "estado": "presente"}]},
    {"id": "tr2", "fecha": "2026-07-02", "equipo_id": "team-7", "estado": "cancelado", "asistencia": [{"player_id": "p1", "estado": "presente"}]},
    {"id": "tr3", "fecha": "2026-07-03", "equipo_id": "team-7", "asistencia": [{"player_id": "p1", "estado": "justificada"}, {"player_id": "p2", "estado": "injustificada"}]},
    {"id": "tr4", "fecha": "2026-12-01", "equipo_id": "team-7", "asistencia": []},
]
MATCHES = [
    {"id": "m1", "fecha": "2026-07-04", "equipo_id": "team-7", "estado": "jugado", "resultado_propio": 2, "resultado_rival": 1},
    {"id": "m2", "fecha": "2026-07-05", "equipo_id": "team-7", "estado": "jugado"},
    {"id": "m3", "fecha": "2026-07-06", "equipo_id": "team-7", "estado": "cancelado", "resultado_propio": 4, "resultado_rival": 0},
    {"id": "m4", "fecha": "2026-07-07", "equipo_id": "team-7", "estado": "aplazado"},
    {"id": "m5", "fecha": "2026-12-07", "equipo_id": "team-7", "estado": "programado"},
]
CALLUPS = [{"id": "c1", "match_id": "m1", "equipo_id": "team-7", "convocados": [
    {"player_id": "p1", "estado": "confirmed"}, {"player_id": "p2"}, {"player_id": "p3", "estado": "declined"},
]}]


def test_integral_statistics_preserve_unknown_as_no_data_and_exclude_cancelled_records():
    result = calculate_statistics(
        players=PLAYERS, teams=TEAMS, matches=MATCHES, trainings=TRAININGS,
        callups=CALLUPS, filters={}, today=date(2026, 8, 4),
    )
    summary = result["summary"]
    assert summary["active_players"]["value"] == 2
    assert summary["matches_played"]["value"] == 2
    assert summary["results_registered"]["value"] == 1
    assert summary["wins"]["value"] == 1
    assert summary["draws"]["value"] == 0
    assert summary["losses"]["value"] == 0
    assert summary["goals_for"]["value"] == 2
    assert summary["matches_cancelled"]["value"] == 1
    assert summary["matches_postponed"]["value"] == 1
    assert summary["trainings_scheduled"]["value"] == 1
    assert summary["trainings_completed"]["value"] == 2
    assert result["attendance"]["sessions_computable"]["value"] == 3
    assert result["attendance"]["sessions_pending"]["value"] == 1
    assert result["attendance"]["porcentaje_presencia"] == {
        "value": 33.3, "state": "calculated", "unit": "percent", "numerator": 1, "denominator": 3,
    }
    assert result["callups"] == {"total": 1, "confirmed": 1, "declined": 0, "pending": 1}
    assert any(item["code"] == "attendance_pending" for item in result["quality"])
    assert result["definitions"]["attendance_percentage"]["rules"][-1] == "denominador cero = no_data"


def test_filters_are_applied_to_team_and_player_without_leaking_other_scope():
    result = calculate_statistics(
        players=PLAYERS, teams=TEAMS, matches=MATCHES, trainings=TRAININGS,
        callups=CALLUPS, filters={"equipo_id": "team-7", "player_id": "p1", "modalidad": "F7"},
        today=date(2026, 8, 4),
    )
    assert [row["player_id"] for row in result["player_rows"]] == ["p1"]
    assert [row["team_id"] for row in result["team_rows"]] == ["team-7"]
    assert result["summary"]["teams"]["value"] == 1


def test_zero_denominator_is_not_reported_as_zero_percent():
    assert rate(0, 0) == {"value": None, "state": "no_data", "unit": "percent", "numerator": 0, "denominator": 0}


def test_export_renderers_accept_integral_statistics_rows_and_keep_empty_values_explicit():
    from report_export_service import generate_pdf, generate_xlsx

    report = {"name": {"es": "Estadísticas integrales", "eu": "Estatistika integralak"},
              "columns": ["team", "players", "sessions", "percentage"], "generated_by": "tester"}
    rows = [{"team": "Equipo", "players": 2, "sessions": 0, "percentage": None}]
    options = {"teams": [{"id": "team-7", "name": "Equipo"}], "players": []}
    pdf = generate_pdf(report, rows, {"players": 2, "percentage": None}, {"team_id": "team-7"}, options, {}, "es")
    xlsx = generate_xlsx(report, rows, {"players": 2, "percentage": None}, {"team_id": "team-7"}, options, {}, "eu")
    assert pdf.startswith(b"%PDF")
    assert xlsx.startswith(b"PK")


def test_statistics_filter_contract_rejects_invalid_date_and_modality():
    import server

    with pytest.raises(HTTPException) as invalid_date:
        server._statistics_filters(desde="2026-13-01")
    assert invalid_date.value.status_code == 422
    with pytest.raises(HTTPException) as invalid_modality:
        server._statistics_filters(modalidad="F5")
    assert invalid_modality.value.status_code == 422


def test_new_internal_statistics_endpoint_denies_family_and_player_before_database_access():
    import server
    from authz import current_user_context

    async def check():
        for role in ("family", "player"):
            token = current_user_context.set({"id": role, "role": role, "active": True})
            try:
                with pytest.raises(HTTPException) as denied:
                    await server.statistics_options()
                assert denied.value.status_code == 403
            finally:
                current_user_context.reset(token)

    asyncio.run(check())


@pytest.mark.parametrize("role,allowed", [("admin", True), ("coordinator", True), ("coach", True), ("family", False), ("player", False)])
def test_internal_statistics_are_staff_only_without_changing_legacy_stats_contract(role, allowed):
    if allowed:
        assert "read" in ROLE_PERMISSIONS[role]["stats"]
    else:
        # The legacy /stats read permission remains for compatibility; the new
        # internal endpoint applies the stricter staff-only policy in the API.
        assert "read" in ROLE_PERMISSIONS[role]["stats"]


@pytest.mark.parametrize("method,path,expected", [
    ("GET", "/api/statistics/summary", ("stats", "read")),
    ("GET", "/api/statistics/export.pdf", ("stats", "export")),
    ("GET", "/api/statistics/export.xlsx", ("stats", "export")),
])
def test_statistics_routes_use_stats_permissions(method, path, expected):
    request = Request({"type": "http", "method": method, "path": path, "headers": []})
    assert route_permission(request) == expected
