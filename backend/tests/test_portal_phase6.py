import asyncio
import inspect

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import server
from authz import ROLE_PERMISSIONS, current_user_context, route_permission
from portal_service import document_status, portal_attendance, portal_callups, safe_payment, safe_player


def test_safe_projections_remove_sensitive_fields_and_physical_paths():
    player = safe_player({"id": "p1", "nombre": "A", "alergias": "private", "domicilio": "private", "password": "bad"})
    payment = safe_payment({
        "id": "pay", "player_id": "p1", "importe_final": 10,
        "iban": "private", "observaciones": "internal",
    })
    assert player == {**player, "id": "p1", "nombre": "A"}
    assert not ({"alergias", "domicilio", "password"} & player.keys())
    assert "iban" not in payment and "observaciones" not in payment


def test_documents_are_status_flags_not_upload_paths():
    result = document_status([{
        "id": "p1", "estado_documental": "completo", "doc_foto": True,
        "archivo": "/uploads/private",
    }])[0]
    assert result["player_id"] == "p1" and result["items"]["doc_foto"] is True
    assert "archivo" not in result


def test_attendance_and_callups_only_include_associated_players():
    attendance = portal_attendance([{"id": "t", "fecha": "2026-07-10", "asistencia": [
        {"player_id": "own", "estado": "presente"}, {"player_id": "other", "estado": "injustificada"},
    ]}], {"own"})
    callups = portal_callups([{"id": "c", "convocados": [
        {"player_id": "own", "estado": "confirmed"}, {"player_id": "other", "estado": "declined"},
    ]}], {"own"})
    assert attendance["summary"]["registros"] == 1
    assert {row["player_id"] for row in attendance["recent"]} == {"own"}
    assert [row["player_id"] for row in callups[0]["responses"]] == ["own"]


@pytest.mark.parametrize("role,allowed", [
    ("family", True), ("player", True), ("coordinator", False), ("coach", False),
])
def test_portal_permission_matrix(role, allowed):
    assert ("read" in ROLE_PERMISSIONS[role].get("portal", set())) is allowed


def test_portal_route_is_read_only_resource():
    request = Request({"type": "http", "method": "GET", "scheme": "https", "server": ("test", 443),
                       "client": ("test", 1), "path": "/api/portal", "query_string": b"", "headers": []})
    assert route_permission(request) == ("portal", "read")
    assert list(inspect.signature(server.get_portal).parameters) == []


def test_staff_cannot_open_family_player_portal():
    token = current_user_context.set({"id": "coach", "role": "coach", "active": True})
    try:
        with pytest.raises(HTTPException) as error:
            asyncio.run(server.get_portal())
        assert error.value.status_code == 403
    finally:
        current_user_context.reset(token)


def test_player_portal_never_returns_payments_or_other_players(monkeypatch):
    rows = {
        "players": [{"id": "own", "nombre": "Own", "equipo_id": "team"}],
        "teams": [{"id": "team", "nombre": "Team"}], "matches": [], "trainings": [],
        "club_events": [], "callups": [], "authorizations": [], "communications": [],
    }

    async def fake_list_docs(collection, query=None):
        if collection == "payments":
            raise AssertionError("El portal del jugador no debe consultar pagos")
        return rows.get(collection, [])

    monkeypatch.setattr(server, "list_docs", fake_list_docs)
    token = current_user_context.set({"id": "u", "role": "player", "active": True, "player_id": "own"})
    try:
        result = asyncio.run(server.get_portal())
    finally:
        current_user_context.reset(token)
    assert [player["id"] for player in result["players"]] == ["own"]
    assert result["payments"] == []


def test_family_portal_supports_multiple_children_and_sanitizes_payments(monkeypatch):
    rows = {
        "players": [
            {"id": "one", "nombre": "One", "equipo_id": "team", "familia_id": "family"},
            {"id": "two", "nombre": "Two", "equipo_id": "team", "familia_id": "family"},
        ],
        "teams": [{"id": "team", "nombre": "Team"}], "matches": [], "trainings": [],
        "club_events": [], "callups": [], "authorizations": [], "communications": [],
        "payments": [{"id": "pay", "player_id": "one", "importe_final": 25, "iban": "never-return"}],
    }

    async def fake_list_docs(collection, query=None):
        return rows.get(collection, [])

    monkeypatch.setattr(server, "list_docs", fake_list_docs)
    token = current_user_context.set({"id": "u", "role": "family", "active": True, "family_id": "family"})
    try:
        result = asyncio.run(server.get_portal())
    finally:
        current_user_context.reset(token)
    assert {player["id"] for player in result["players"]} == {"one", "two"}
    assert result["payments"][0]["importe_final"] == 25
    assert "iban" not in result["payments"][0]


def test_unassociated_player_gets_empty_safe_portal(monkeypatch):
    async def fake_list_docs(collection, query=None):
        return []

    monkeypatch.setattr(server, "list_docs", fake_list_docs)
    token = current_user_context.set({"id": "u", "role": "player", "active": True, "player_id": None})
    try:
        result = asyncio.run(server.get_portal())
    finally:
        current_user_context.reset(token)
    assert result["players"] == [] and result["next_activity"] is None
