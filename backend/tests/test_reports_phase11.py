import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException, Request

import server
from authz import current_user_context, route_permission
from modality_service import catalog_from_settings
from report_service import (
    ReportValidationError, build_attendance, build_roster, catalog_for_role,
    paginate, safe_rows, validate_report_filters,
)


TEAMS = [
    {"id": "team-a", "nombre": "A", "categoria": "Alevín", "modalidad": "7", "temporada": "2026-2027"},
    {"id": "team-b", "nombre": "B", "categoria": "Infantil", "modalidad": "F11", "temporada": "2026-2027"},
]
PLAYERS = [
    {"id": "player-a", "nombre": "Ane", "apellidos": "Ficticia", "equipo_id": "team-a", "categoria": "Alevín", "dorsal": "7", "estado": "activo", "telefono": "never", "iban": "never"},
    {"id": "player-b", "nombre": "Unai", "apellidos": "Ficticio", "equipo_id": "team-b", "categoria": "Infantil", "estado": "activo", "alergias": "never"},
]
TRAININGS = [
    {"id": "training-a", "fecha": "2026-09-01", "equipo_id": "team-a", "asistencia": [{"player_id": "player-a", "estado": "presente"}]},
    {"id": "training-b", "fecha": "2026-09-02", "equipo_id": "team-b", "asistencia": [{"player_id": "player-b", "estado": "injustificada"}]},
]


def run(awaitable):
    return asyncio.run(awaitable)


@pytest.mark.parametrize("role", ["admin", "coordinator", "coach", "family", "player"])
def test_catalog_is_available_for_every_authorized_role(role):
    ids = [item["id"] for item in catalog_for_role(role)]
    assert {"roster", "attendance"}.issubset(ids)
    assert len(ids) > 2
    assert catalog_for_role("unknown") == []


def test_report_preview_post_uses_read_permission():
    request = Request({"type": "http", "method": "POST", "path": "/api/reports/preview",
                       "query_string": b"", "headers": [], "client": ("test", 1)})
    assert route_permission(request) == ("reports", "read")


def test_roster_filters_modality_category_team_and_projects_safe_fields():
    rows, totals = build_roster(PLAYERS, TEAMS, {"category": "Alevín", "modality": "F7", "team_id": "team-a"}, catalog_from_settings())
    assert totals == {"players": 1, "teams": 1}
    assert rows == [{"name": "Ane", "surname": "Ficticia", "team": "A", "category": "Alevín",
                     "modality": "F7", "number": "7", "status": "activo"}]
    assert not ({"telefono", "iban", "alergias"} & set(rows[0]))


def test_attendance_reuses_existing_calculations_for_player_and_team():
    player_rows, totals = build_attendance(PLAYERS, TEAMS, TRAININGS, {"player_id": "player-a", "group_by": "player"}, "family")
    assert player_rows[0]["sessions"] == 1 and player_rows[0]["percentage"] == 100
    assert totals["present"] == 1 and totals["unjustified"] == 0
    team_rows, totals = build_attendance(PLAYERS, TEAMS, TRAININGS, {"group_by": "team"}, "admin")
    assert len(team_rows) == 2 and totals["sessions"] == 2 and totals["percentage"] == 50


def test_invalid_filters_dates_and_page_limits_are_rejected_or_bounded():
    with pytest.raises(ReportValidationError):
        validate_report_filters("roster", {"player_id": "x"})
    with pytest.raises(ReportValidationError):
        validate_report_filters("attendance", {"date_from": "2026-10-01", "date_to": "2026-09-01"})
    page, meta = paginate([{"name": str(index)} for index in range(205)], 2, 500)
    assert len(page) == 100 and meta == {"page": 2, "page_size": 100, "total_rows": 205, "total_pages": 3}


def test_rows_are_stably_sorted_and_safe_projection_is_allowlist_only():
    rows, _ = build_roster([PLAYERS[1], PLAYERS[0]], TEAMS, {}, catalog_from_settings())
    assert [row["name"] for row in rows] == ["Ane", "Unai"]
    assert safe_rows([{**rows[0], "iban": "forbidden", "token": "forbidden"}]) == [rows[0]]


@pytest.mark.parametrize("role,scoped_players,scoped_teams", [
    ("coach", [PLAYERS[0]], [TEAMS[0]]),
    ("coordinator", [PLAYERS[0]], [TEAMS[0]]),
    ("family", [PLAYERS[0]], [TEAMS[0]]),
    ("player", [PLAYERS[0]], [TEAMS[0]]),
])
def test_preview_never_accepts_cross_scope_team_or_player(monkeypatch, role, scoped_players, scoped_teams):
    monkeypatch.setattr(server, "report_context", AsyncMock(return_value={
        "players": scoped_players, "teams": scoped_teams, "trainings": [TRAININGS[0]], "modalities": catalog_from_settings(),
    }))
    token = current_user_context.set({"id": role, "role": role, "active": True, "assigned_team_ids": ["team-a"], "player_id": "player-a", "family_id": "family-a"})
    try:
        with pytest.raises(HTTPException) as team_error:
            run(server.preview_report(server.ReportPreviewRequest(report_id="roster", filters={"team_id": "team-b"})))
        assert team_error.value.status_code == 403
        with pytest.raises(HTTPException) as player_error:
            run(server.preview_report(server.ReportPreviewRequest(report_id="attendance", filters={"player_id": "player-b"})))
        assert player_error.value.status_code == 403
    finally:
        current_user_context.reset(token)


def test_family_preview_contains_only_child_and_filter_options_share_scope(monkeypatch):
    monkeypatch.setattr(server, "report_context", AsyncMock(return_value={
        "players": [PLAYERS[0]], "teams": [TEAMS[0]], "trainings": [TRAININGS[0]], "modalities": catalog_from_settings(),
    }))
    token = current_user_context.set({"id": "family", "role": "family", "active": True, "family_id": "family-a"})
    try:
        result = run(server.preview_report(server.ReportPreviewRequest(report_id="roster", filters={}, page=1, page_size=25)))
    finally:
        current_user_context.reset(token)
    assert result["pagination"]["total_rows"] == 1
    assert result["filter_options"]["players"] == [{"id": "player-a", "name": "Ane Ficticia", "team_id": "team-a", "category": "Alevín"}]
    serialized = str(result).lower()
    assert not any(field in serialized for field in ("iban", "telefono", "alergias", "token", "domicilio"))


def test_empty_preview_has_consistent_totals_and_pagination(monkeypatch):
    monkeypatch.setattr(server, "report_context", AsyncMock(return_value={
        "players": [], "teams": [], "trainings": [], "modalities": catalog_from_settings(),
    }))
    token = current_user_context.set({"id": "admin", "role": "admin", "active": True})
    try:
        result = run(server.preview_report(server.ReportPreviewRequest(report_id="roster", filters={})))
    finally:
        current_user_context.reset(token)
    assert result["rows"] == [] and result["totals"] == {"players": 0, "teams": 0}
    assert result["pagination"] == {"page": 1, "page_size": 25, "total_rows": 0, "total_pages": 1}
