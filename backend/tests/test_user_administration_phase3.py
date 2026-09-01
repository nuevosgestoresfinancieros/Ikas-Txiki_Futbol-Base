import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

import server
from communication_recipient_service import recipient_summary
from user_admin_service import link_is_complete, security_state, user_search_text, user_view


def test_phase3_search_security_and_link_helpers_are_backward_compatible():
    assert user_view({"account_status": "pending_activation"}) == "active"
    assert user_view({"account_status": "suspended"}) == "archived"
    assert "ane prueba" in user_search_text({"first_name": "  Ane ", "last_name": "Prueba"})
    assert link_is_complete({"role": "admin"})
    assert not link_is_complete({"role": "coach", "assigned_team_ids": []})
    assert link_is_complete({"role": "family", "family_id": "f1", "linked_player_ids": ["p1"]})
    assert security_state({"active": True}) == "verified"
    assert security_state({"must_change_password": True}) == "password_change_required"
    future = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    assert security_state({"locked_until": future}) == "locked"


def test_recipient_preview_deduplicates_and_aggregates_exclusion_reasons():
    summary = recipient_summary([
        {"id": "u1", "role": "coach", "assigned_team_ids": ["t1"], "active": True},
        {"id": "u1", "role": "coach", "assigned_team_ids": ["t1"], "active": True},
        {"id": "u2", "role": "family", "account_status": "pending_activation", "family_id": "f1"},
        {"id": "u3", "role": "player", "active": True},
    ], 1, team_count=1, player_count=2)
    assert summary["unique_recipients"] == 1
    assert summary["duplicate_accounts"] == 1
    assert summary["pending_accounts"] == 1
    assert summary["incomplete_links"] == 1


def test_user_create_supports_existing_access_methods_without_sending(monkeypatch):
    model = server.UserCreate(
        username="fictitious_user", first_name="Fictitious", last_name="User",
        role="admin", access_method="invitation",
    )
    assert model.password is None and model.access_method == "invitation"
    with pytest.raises(Exception):
        server.UserCreate(username="fictitious_user", first_name="Fictitious", last_name="User", role="admin")


def test_administration_profile_for_environment_admin_is_read_only():
    result = asyncio.run(server.get_user_administration_profile("environment-admin"))
    assert result["read_only"] is True
    assert result["user"]["system_account"] is True
    assert result["activity"] == []


def test_incomplete_pending_account_is_safe_but_active_account_is_rejected(monkeypatch):
    database = SimpleNamespace(
        teams=SimpleNamespace(distinct=AsyncMock(return_value=[])),
        families=SimpleNamespace(find_one=AsyncMock(return_value=None)),
        players=SimpleNamespace(find_one=AsyncMock(return_value=None), distinct=AsyncMock(return_value=[])),
    )
    monkeypatch.setattr(server, "db", database)
    pending = asyncio.run(server.validate_user_relationships({
        "role": "coach", "account_status": "pending_activation", "assigned_team_ids": [],
    }))
    assert pending["account_status"] == "incomplete_link" and pending["active"] is False
    with pytest.raises(Exception) as error:
        asyncio.run(server.validate_user_relationships({
            "role": "coach", "account_status": "active", "assigned_team_ids": [],
        }))
    assert error.value.status_code == 422


def test_options_exclude_no_aplica_and_archived_teams(monkeypatch):
    teams_cursor = MagicMock()
    teams_cursor.to_list = AsyncMock(return_value=[
        {"id": "t1", "nombre": "Cadete A", "estado": "activo"},
        {"id": "t2", "nombre": "NO APLICA"},
        {"id": "t3", "nombre": "Cadete viejo", "estado": "archivado"},
    ])
    empty_cursor = MagicMock(); empty_cursor.to_list = AsyncMock(return_value=[])
    database = SimpleNamespace(
        teams=SimpleNamespace(find=MagicMock(return_value=teams_cursor)),
        players=SimpleNamespace(find=MagicMock(return_value=empty_cursor)),
        families=SimpleNamespace(find=MagicMock(return_value=empty_cursor)),
    )
    monkeypatch.setattr(server, "db", database)
    result = asyncio.run(server.get_user_administration_options())
    assert [team["id"] for team in result["teams"]] == ["t1"]
