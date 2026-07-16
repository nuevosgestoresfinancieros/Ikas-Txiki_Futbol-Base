from datetime import datetime, timedelta, timezone

import pytest
from starlette.requests import Request

from authz import ROLE_PERMISSIONS, route_permission
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


def test_family_and_player_only_receive_respond_permission():
    for role in ("family", "player"):
        assert "respond" in ROLE_PERMISSIONS[role]["callups"]
        assert "edit" not in ROLE_PERMISSIONS[role]["callups"]
        assert "delete" not in ROLE_PERMISSIONS[role]["callups"]


def test_respond_route_uses_specific_permission():
    request = Request({
        "type": "http", "method": "PATCH", "scheme": "https",
        "server": ("test", 443), "client": ("test", 1),
        "path": "/api/callups/id/respond", "query_string": b"", "headers": [],
    })
    assert route_permission(request) == ("callups", "respond")
