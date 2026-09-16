import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import server
from authz import ROLE_PERMISSIONS
from callup_service import (
    apply_response, is_late, normalize_callup, normalize_status, response_counts,
)


@pytest.mark.parametrize("legacy,normalized", [
    ("pendiente", "pending"), ("confirmado", "confirmed"),
    ("no_puede", "declined"), ("pending", "pending"),
    ("confirmed", "confirmed"), ("declined", "declined"),
])
def test_status_compatibility(legacy, normalized):
    assert normalize_status(legacy) == normalized


def test_normalize_callup_does_not_mutate_original():
    original = {"convocados": [{"player_id": "p1", "estado": "confirmado"}]}
    normalized = normalize_callup(original)
    assert normalized["convocados"][0]["estado"] == "confirmed"
    assert original["convocados"][0]["estado"] == "confirmado"


def test_counts_mix_legacy_and_new_statuses():
    assert response_counts([{"estado": "pendiente"}, {"estado": "confirmed"}, {"estado": "no_puede"}]) == {
        "pending": 1, "confirmed": 1, "declined": 1,
    }


def test_response_records_actor_relation_and_history():
    at = datetime(2026, 7, 17, 10, tzinfo=timezone.utc)
    actor = {"id": "family-user", "username": "ama", "role": "family"}
    updated, history = apply_response(
        {"player_id": "child", "estado": "pendiente"}, "declined", "Viaje",
        actor, "2026-07-18T10:00:00+00:00", at,
    )
    assert updated["estado"] == "declined"
    assert updated["motivo"] == "Viaje"
    assert updated["responded_by_user_id"] == "family-user"
    assert history == updated["history"][0]
    assert history["previous_status"] == "pending"
    assert history["new_status"] == "declined"
    assert history["relation"] == "family"
    assert history["late"] is False


def test_changed_response_appends_history():
    actor = {"id": "player-user", "username": "ane", "role": "player"}
    first, _ = apply_response({"player_id": "p", "estado": "pending"}, "confirmed", None, actor, None)
    second, _ = apply_response(first, "declined", "Lesión", actor, None)
    assert [row["new_status"] for row in second["history"]] == ["confirmed", "declined"]


def test_deadline_before_after_and_invalid():
    now = datetime.now(timezone.utc)
    assert is_late((now - timedelta(minutes=1)).isoformat(), now)
    assert not is_late((now + timedelta(minutes=1)).isoformat(), now)
    assert not is_late("not-a-date", now)


def test_invalid_response_status_rejected():
    with pytest.raises(ValueError):
        apply_response({}, "pending", None, {"role": "family"}, None)


def test_bulk_response_model_rejects_pending_status():
    with pytest.raises(ValueError):
        server.CallupBulkResponse(status="pending")


def test_family_and_player_only_receive_respond_permission():
    for role in ("family", "player"):
        assert "respond" in ROLE_PERMISSIONS[role]["callups"]
        assert "edit" not in ROLE_PERMISSIONS[role]["callups"]
        assert "delete" not in ROLE_PERMISSIONS[role]["callups"]


@pytest.mark.parametrize("path", ["/api/callups/id/respond", "/api/callups/id/respond-bulk"])
def test_respond_routes_use_specific_permission(path):
    request = Request({
        "type": "http", "method": "PATCH", "scheme": "https",
        "server": ("test", 443), "client": ("test", 1),
        "path": path, "query_string": b"", "headers": [],
    })
    assert server.route_permission(request) == ("callups", "respond")


def test_bulk_response_updates_only_pending_players_in_user_scope(monkeypatch):
    callup = {
        "id": "callup-1", "equipo_id": "team-1", "response_deadline": None,
        "convocados": [
            {"player_id": "player-1", "estado": "pending"},
            {"player_id": "player-2", "estado": "pendiente"},
            {"player_id": "player-3", "estado": "confirmed"},
        ],
    }
    updates = []

    async def update_one(query, update):
        updates.append((query, update))
        return SimpleNamespace(modified_count=1)

    internal_events = SimpleNamespace(
        update_one=AsyncMock(), insert_many=AsyncMock(),
    )
    monkeypatch.setattr(server, "db", SimpleNamespace(
        callups=SimpleNamespace(update_one=update_one),
        internal_events=internal_events,
    ))
    monkeypatch.setattr(server, "get_doc", AsyncMock(return_value=callup))
    monkeypatch.setattr(server, "user_player_ids", AsyncMock(return_value=["player-1", "player-2"]))
    monkeypatch.setattr(server, "scope_for_collection", AsyncMock(return_value={
        "convocados.player_id": {"$in": ["player-1", "player-2"]},
    }))
    monkeypatch.setattr(server, "notification_users", AsyncMock(return_value=[{"id": "coach-1"}]))
    monkeypatch.setattr(server, "enqueue_notifications", AsyncMock())

    token = server.current_user_context.set({"id": "family-1", "role": "family", "active": True})
    try:
        result = asyncio.run(server.respond_callup_bulk(
            "callup-1", server.CallupBulkResponse(status="declined", reason="Viaje"),
        ))
    finally:
        server.current_user_context.reset(token)

    assert result == {"updated_count": 2}
    assert len(updates) == 2
    assert all("$in" in str(query) for query, _update in updates)
    assert all("convocados.2" not in str(query) for query, _update in updates)
    updated_items = [update["$set"][key] for _query, update in updates for key in update["$set"] if key.startswith("convocados.")]
    assert {item["player_id"] for item in updated_items} == {"player-1", "player-2"}
    assert all(item["estado"] == "declined" and item["motivo"] == "Viaje" for item in updated_items)
    internal_events.insert_many.assert_awaited_once()


def test_bulk_response_reuses_deadline_validation(monkeypatch):
    callups = SimpleNamespace(update_one=AsyncMock())
    internal_events = SimpleNamespace(update_one=AsyncMock(), insert_many=AsyncMock())
    monkeypatch.setattr(server, "db", SimpleNamespace(callups=callups, internal_events=internal_events))
    monkeypatch.setattr(server, "get_doc", AsyncMock(return_value={
        "id": "callup-1", "response_deadline": "2020-01-01T00:00:00+00:00",
        "convocados": [{"player_id": "player-1", "estado": "pending"}],
    }))
    monkeypatch.setattr(server, "user_player_ids", AsyncMock(return_value=["player-1"]))

    token = server.current_user_context.set({"id": "family-1", "role": "family", "active": True})
    try:
        with pytest.raises(HTTPException) as error:
            asyncio.run(server.respond_callup_bulk(
                "callup-1", server.CallupBulkResponse(status="confirmed"),
            ))
    finally:
        server.current_user_context.reset(token)

    assert error.value.status_code == 409
    callups.update_one.assert_not_awaited()
    internal_events.update_one.assert_awaited_once()
