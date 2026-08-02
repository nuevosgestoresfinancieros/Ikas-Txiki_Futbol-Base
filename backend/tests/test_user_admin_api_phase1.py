import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27039")
os.environ.setdefault("DB_NAME", "ikastxiki_users_phase1_test")
os.environ.setdefault("JWT_SECRET", "users-phase1-fictitious-jwt-secret-at-least-32-characters")
os.environ.setdefault("ADMIN_USER", "users_phase1_admin")
os.environ.setdefault("ADMIN_PASSWORD", "users-phase1-fictitious-admin-password")

import server


def fake_db():
    return SimpleNamespace(
        teams=SimpleNamespace(distinct=AsyncMock(return_value=[])),
        families=SimpleNamespace(find_one=AsyncMock(return_value=None)),
        players=SimpleNamespace(find_one=AsyncMock(return_value=None), distinct=AsyncMock(return_value=[])),
        users=SimpleNamespace(count_documents=AsyncMock(return_value=1)),
        internal_events=SimpleNamespace(insert_one=AsyncMock()),
    )


def test_system_administrator_is_visible_and_read_only():
    system = server.system_admin_public()
    assert system["id"] == "environment-admin"
    assert system["system_account"] is True and system["read_only"] is True
    assert system["system_label"] == "Configurado en el servidor"
    with pytest.raises(Exception) as error:
        asyncio.run(server.edit_user("environment-admin", server.UserUpdate(first_name="Cambio")))
    assert error.value.status_code == 403


def test_coach_and_coordinator_accept_only_existing_teams(monkeypatch):
    database = fake_db()
    database.teams.distinct.return_value = ["team-real"]
    monkeypatch.setattr(server, "db", database)
    coach = asyncio.run(server.validate_user_relationships({"role": "coach", "assigned_team_ids": ["team-real"]}))
    assert coach["assigned_team_ids"] == ["team-real"]
    with pytest.raises(Exception) as error:
        asyncio.run(server.validate_user_relationships({"role": "coordinator", "assigned_team_ids": ["team-manipulated"]}))
    assert error.value.status_code == 422


def test_family_links_only_real_family_and_derives_official_children(monkeypatch):
    database = fake_db()
    database.families.find_one.return_value = {"id": "family-real"}
    database.players.distinct.return_value = ["player-one", "player-two"]
    monkeypatch.setattr(server, "db", database)
    result = asyncio.run(server.validate_user_relationships({"role": "family", "family_id": "family-real"}))
    assert result["linked_player_ids"] == ["player-one", "player-two"]
    database.families.find_one.return_value = None
    with pytest.raises(Exception) as error:
        asyncio.run(server.validate_user_relationships({"role": "family", "family_id": "family-other"}))
    assert error.value.status_code == 422


def test_player_requires_exactly_one_existing_player(monkeypatch):
    database = fake_db()
    database.players.find_one.return_value = {"id": "player-real"}
    monkeypatch.setattr(server, "db", database)
    result = asyncio.run(server.validate_user_relationships({"role": "player", "player_id": "player-real"}))
    assert result["player_id"] == "player-real" and result["family_id"] is None
    database.players.find_one.return_value = None
    with pytest.raises(Exception) as error:
        asyncio.run(server.validate_user_relationships({"role": "player", "player_id": "player-other"}))
    assert error.value.status_code == 422


def test_no_aplica_is_never_an_authorized_scope(monkeypatch):
    monkeypatch.setattr(server, "db", fake_db())
    with pytest.raises(Exception) as error:
        asyncio.run(server.validate_user_relationships({"role": "coach", "assigned_team_ids": ["NO APLICA"]}))
    assert error.value.status_code == 422


def test_self_admin_and_last_persisted_admin_are_protected(monkeypatch):
    database = fake_db()
    database.users.count_documents.return_value = 0
    monkeypatch.setattr(server, "db", database)
    context = server.current_user_context.set({"id": "admin-one", "username": "admin.one", "role": "admin"})
    existing = {"id": "admin-one", "username": "admin.one", "role": "admin", "active": True}
    try:
        with pytest.raises(Exception) as error:
            asyncio.run(server.ensure_admin_protection(existing, {**existing, "role": "coach"}))
        assert error.value.status_code == 409
    finally:
        server.current_user_context.reset(context)


def test_user_audit_uses_internal_events_without_secret_values(monkeypatch):
    database = fake_db()
    monkeypatch.setattr(server, "db", database)
    context = server.current_user_context.set({"id": "admin-test", "role": "admin"})
    try:
        asyncio.run(server.record_user_audit("updated", {"id": "user-test"}, ["role", "password", "password_hash"]))
    finally:
        server.current_user_context.reset(context)
    event = database.internal_events.insert_one.await_args.args[0]
    assert event["type"] == "user.updated"
    assert event["detail"]["changed_fields"] == ["role"]
    assert "password" not in str(event)
