import asyncio

import pytest
from fastapi import HTTPException

import server
from modality_service import DEFAULT_MODALITIES


@pytest.fixture
def store(monkeypatch):
    rows = {"team-1": {"id": "team-1", "nombre": "Kañometa", "temporada": "2026-2027", "modalidad": "F11"}}

    async def fake_insert(collection, data):
        rows["new"] = dict(data, id="new")
        return rows["new"]

    async def fake_update(collection, _id, data):
        rows[_id] = {**rows[_id], **data}
        return rows[_id]

    async def fake_catalog():
        return list(DEFAULT_MODALITIES)

    class Memberships:
        async def update_many(self, *args, **kwargs):
            return None

    monkeypatch.setattr(server, "insert_doc", fake_insert)
    monkeypatch.setattr(server, "update_doc", fake_update)
    monkeypatch.setattr(server, "_load_modality_catalog", fake_catalog)
    monkeypatch.setattr(server, "db", {server.TEAM_MEMBERSHIPS_COLLECTION: Memberships()})
    return rows


def test_create_team_normalizes_modality(store):
    result = asyncio.run(server.create_team(server.Team(nombre="Alevín A", modalidad="Fútbol 7")))
    assert result["modalidad"] == "F7"


def test_unknown_modality_is_rejected(store):
    with pytest.raises(HTTPException) as error:
        asyncio.run(server.create_team(server.Team(nombre="Equipo", modalidad="F5")))
    assert error.value.status_code == 422


def test_editing_without_modality_keeps_existing(store):
    asyncio.run(server.edit_team("team-1", server.Team(nombre="Kañometa", temporada="2026-2027")))
    assert store["team-1"]["modalidad"] == "F11"


def test_editing_can_change_or_clear_modality(store):
    asyncio.run(server.edit_team("team-1", server.Team(nombre="Kañometa", modalidad="F7")))
    assert store["team-1"]["modalidad"] == "F7"
    asyncio.run(server.edit_team("team-1", server.Team(nombre="Kañometa", modalidad="")))
    assert store["team-1"]["modalidad"] is None


def test_migration_012_plan_only_fills_missing_modality():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "migrations" / "012_team_modality_from_category.py"
    spec = importlib.util.spec_from_file_location("migration_012", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.plan_team({"categoria": "Alevín"}) == ("assign", "F7")
    assert module.plan_team({"categoria": "Cadete"}) == ("assign", "F11")
    assert module.plan_team({"categoria": "Infantil", "modalidad": "F7"}) == ("keep", "F7")
    assert module.plan_team({"categoria": "Veteranos"}) == ("review", None)
    assert module.plan_team({"nombre": "NO APLICA", "categoria": "JUVENIL"}) == ("skip", None)
