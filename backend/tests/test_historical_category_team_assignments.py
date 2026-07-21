import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import server
from authz import current_user_context


def run(coro):
    return asyncio.run(coro)


def draft(category="", team="", team_id=None):
    return {
        "id": "historical-draft", "season": "2026-2027", "status": "draft",
        "source_format": "historical_bbdd_v1", "simulation": {"official_writes": 0},
        "records": [{
            "id": "record-1", "active": True, "categoria": category,
            "equipo": team, "equipo_id": team_id, "modalidad": "",
        }],
        "duplicates": [], "incidents": [], "fuzzy_matches": [], "family_candidates": [],
    }


def fake_database(update=None, team=None):
    return SimpleNamespace(
        teams=SimpleNamespace(find_one=AsyncMock(return_value=team)),
        import_staging=SimpleNamespace(update_one=update or AsyncMock()),
    )


def request(field, value, confirmed=True):
    return server.StagingBulkUpdate(
        record_ids=["record-1"], field=field, value=value,
        confirm_suggestion=confirmed,
    )


@pytest.mark.parametrize("value", ["Inventada", "ALEVIN", "", "Alevín<script>"])
def test_historical_category_rejects_unknown_or_manipulated_values(monkeypatch, value):
    update = AsyncMock()
    monkeypatch.setattr(server, "_staging_doc", AsyncMock(return_value=draft()))
    monkeypatch.setattr(server, "db", fake_database(update=update))

    with pytest.raises(HTTPException) as error:
        run(server.bulk_update_staging("historical-draft", request("categoria", value)))
    assert error.value.status_code == 422
    update.assert_not_awaited()


def test_historical_category_requires_confirmation_and_audits_selected_record(monkeypatch):
    before, after = draft(), draft(category="Alevín")
    update = AsyncMock()
    staging_doc = AsyncMock(return_value=before)
    monkeypatch.setattr(server, "_staging_doc", staging_doc)
    monkeypatch.setattr(server, "db", fake_database(update=update))

    with pytest.raises(HTTPException) as error:
        run(server.bulk_update_staging("historical-draft", request("categoria", "Alevín", False)))
    assert error.value.status_code == 422
    staging_doc.side_effect = [before, after]

    token = current_user_context.set({"id": "admin-safe", "role": "admin", "active": True})
    try:
        result = run(server.bulk_update_staging(
            "historical-draft", request("categoria", "Alevín"),
        ))
    finally:
        current_user_context.reset(token)

    assert result["summary"]["missing_category"] == 0
    assert result["simulation"]["official_writes"] == 0
    operation = update.await_args.args[1]
    assert operation["$set"]["records.$[row].categoria"] == "Alevín"
    assert update.await_args.kwargs["array_filters"][0] == {"row.id": {"$in": ["record-1"]}}
    event = operation["$push"]["audit"]
    assert event["actor_user_id"] == "admin-safe" and event["at"] is not None
    assert event["detail"]["changes"] == [{
        "record_id": "record-1", "previous_value": None, "new_value": "Alevín",
    }]


@pytest.mark.parametrize("team", [None, {"id": "team-a", "nombre": "A", "categoria": "Alevín", "estado": "inactivo"}])
def test_historical_team_rejects_missing_or_inactive_identifier(monkeypatch, team):
    update = AsyncMock()
    monkeypatch.setattr(server, "_staging_doc", AsyncMock(return_value=draft(category="Alevín")))
    monkeypatch.setattr(server, "db", fake_database(update=update, team=team))

    with pytest.raises(HTTPException) as error:
        run(server.bulk_update_staging("historical-draft", request("equipo", "team-a")))
    assert error.value.status_code == 422
    update.assert_not_awaited()


def test_historical_team_rejects_incompatible_category(monkeypatch):
    team = {"id": "team-a", "nombre": "Equipo A", "categoria": "Alevín", "estado": "activo"}
    update = AsyncMock()
    monkeypatch.setattr(server, "_staging_doc", AsyncMock(return_value=draft(category="Infantil")))
    monkeypatch.setattr(server, "db", fake_database(update=update, team=team))

    with pytest.raises(HTTPException) as error:
        run(server.bulk_update_staging("historical-draft", request("equipo", "team-a")))
    assert error.value.status_code == 422
    update.assert_not_awaited()


def test_historical_team_resolves_real_id_updates_counter_and_audits(monkeypatch):
    team = {"id": "team-a", "nombre": "Equipo A", "categoria": "ALEVIN", "temporada": "2025-2026", "estado": "activo"}
    before = draft(category="Alevín")
    after = draft(category="Alevín", team="Equipo A", team_id="team-a")
    update = AsyncMock()
    monkeypatch.setattr(server, "_staging_doc", AsyncMock(side_effect=[before, after]))
    monkeypatch.setattr(server, "db", fake_database(update=update, team=team))
    token = current_user_context.set({"id": "admin-safe", "role": "admin", "active": True})
    try:
        result = run(server.bulk_update_staging(
            "historical-draft", request("equipo", "team-a"),
        ))
    finally:
        current_user_context.reset(token)

    assert result["summary"]["missing_team"] == 0
    assert result["simulation"]["official_writes"] == 0
    operation = update.await_args.args[1]
    assert operation["$set"]["records.$[row].equipo"] == "Equipo A"
    assert operation["$set"]["records.$[row].equipo_id"] == "team-a"
    assert operation["$push"]["audit"]["detail"]["changes"] == [{
        "record_id": "record-1", "previous_value": None, "new_value": "Equipo A",
        "previous_id": None, "new_id": "team-a",
    }]


@pytest.mark.parametrize("team_category", ["BENJAMIN", "BENJAMIN FEM.", "BENJAMIN D"])
def test_legacy_team_categories_match_the_official_category_without_rewriting(monkeypatch, team_category):
    team = {"id": "legacy-team", "nombre": "Equipo heredado", "categoria": team_category,
            "temporada": "2025-2026", "estado": "activo"}
    before = draft(category="Benjamín")
    after = draft(category="Benjamín", team="Equipo heredado", team_id="legacy-team")
    update = AsyncMock()
    monkeypatch.setattr(server, "_staging_doc", AsyncMock(side_effect=[before, after]))
    monkeypatch.setattr(server, "db", fake_database(update=update, team=team))

    result = run(server.bulk_update_staging(
        "historical-draft", request("equipo", "legacy-team"),
    ))

    assert result["simulation"]["official_writes"] == 0
    assert update.await_args.args[1]["$set"]["records.$[row].equipo_id"] == "legacy-team"
    assert team["categoria"] == team_category


def test_legacy_team_without_status_is_usable_but_explicit_pending_is_not(monkeypatch):
    usable = {"id": "legacy-team", "nombre": "Equipo heredado", "categoria": "INFANTIL"}
    monkeypatch.setattr(server, "db", fake_database(team=usable))
    assert run(server._active_staging_team("legacy-team")) == usable

    monkeypatch.setattr(server, "db", fake_database(team={**usable, "estado": "pendiente"}))
    assert run(server._active_staging_team("legacy-team")) is None


def test_individual_catalog_assignment_cannot_bypass_confirmation(monkeypatch):
    update = AsyncMock()
    monkeypatch.setattr(server, "_staging_doc", AsyncMock(return_value=draft()))
    monkeypatch.setattr(server, "db", fake_database(update=update))

    with pytest.raises(HTTPException) as error:
        run(server.update_staging_record(
            "historical-draft", "record-1",
            server.StagingRecordUpdate(field="categoria", value="Alevín"),
        ))
    assert error.value.status_code == 422
    update.assert_not_awaited()
