import asyncio

import server
from authz import current_user_context


def run(awaitable):
    return asyncio.run(awaitable)


def test_global_search_returns_only_safe_grouped_entity_types(monkeypatch):
    records = {
        "teams": [{"id": "team-1", "nombre": "Aurrera", "categoria": "Infantil", "temporada": "2026-2027", "entrenador": "Private coach"}],
        "players": [{"id": "player-1", "nombre": "Ane", "apellidos": "Ficticia", "categoria": "Infantil", "equipo_id": "team-1", "numero_licencia": "SECRET-LICENSE", "progenitor1_telefono": "600000000", "iban": "ES00"}],
        "families": [{"id": "family-1", "progenitor1_nombre": "Ane Family", "progenitor1_telefono": "600000000", "progenitor1_email": "private@example.test", "domicilio": "Private street"}],
    }
    async def fake_list_docs(collection, query=None):
        return records.get(collection, [])
    monkeypatch.setattr(server, "list_docs", fake_list_docs)
    token = current_user_context.set({"id": "admin", "role": "admin", "active": True})
    try:
        result = run(server.global_search("ane"))
    finally:
        current_user_context.reset(token)
    assert {row["type"] for row in result} == {"player", "family"}
    assert result[0]["route"].startswith("/jugadores?ficha=")
    serialized = str(result)
    assert not any(value in serialized for value in ("600000000", "private@example.test", "Private street", "SECRET-LICENSE", "ES00"))


def test_global_search_does_not_query_or_return_unsupported_types(monkeypatch):
    calls = []
    async def fake_list_docs(collection, query=None):
        calls.append(collection)
        return []
    monkeypatch.setattr(server, "list_docs", fake_list_docs)
    token = current_user_context.set({"id": "admin", "role": "admin", "active": True})
    try:
        assert run(server.global_search("x")) == []
    finally:
        current_user_context.reset(token)
    assert set(calls) == {"teams", "players", "families"}


def test_global_search_respects_entity_permissions(monkeypatch):
    records = {
        "teams": [{"id": "team-1", "nombre": "Aurrera", "categoria": "Infantil"}],
        "players": [{"id": "player-1", "nombre": "Ane", "apellidos": "Ficticia", "equipo_id": "team-1"}],
        "families": [{"id": "family-1", "progenitor1_nombre": "Ane Family"}],
    }
    async def fake_list_docs(collection, query=None):
        return records.get(collection, [])
    monkeypatch.setattr(server, "list_docs", fake_list_docs)
    token = current_user_context.set({"id": "coach", "role": "coach", "active": True, "assigned_team_ids": ["team-1"]})
    try:
        result = run(server.global_search("ane"))
    finally:
        current_user_context.reset(token)
    assert {row["type"] for row in result} == {"player"}
