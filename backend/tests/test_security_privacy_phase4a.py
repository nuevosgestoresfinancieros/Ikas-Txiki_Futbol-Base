import asyncio
import os
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from starlette.requests import Request

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27039")
os.environ.setdefault("DB_NAME", "ikastxiki_security_phase4a_test")
os.environ.setdefault("JWT_SECRET", "phase4a-fictitious-jwt-secret-at-least-32-characters")
os.environ.setdefault("ADMIN_USER", "phase4a_admin")
os.environ.setdefault("ADMIN_PASSWORD", "phase4a-fictitious-admin-password")

import server
from communication_recipient_service import (
    communication_consent, communication_record_active, consented_contacts, usable_account,
)


class Cursor:
    def __init__(self, rows):
        self.rows = list(rows)
        self.position = 0

    async def to_list(self, _limit):
        return list(self.rows)

    def __aiter__(self):
        self.position = 0
        return self

    async def __anext__(self):
        if self.position >= len(self.rows):
            raise StopAsyncIteration
        row = self.rows[self.position]
        self.position += 1
        return row


class Collection:
    def __init__(self, rows=None):
        self.rows = list(rows or [])
        self.insert_one = AsyncMock()

    def find(self, query=None, projection=None):
        rows = self.rows
        identifiers = (((query or {}).get("id") or {}).get("$in"))
        if identifiers is not None:
            rows = [row for row in rows if row.get("id") in identifiers]
        team_ids = (((query or {}).get("equipo_id") or {}).get("$in"))
        if team_ids is not None:
            rows = [row for row in rows if row.get("equipo_id") in team_ids]
        return Cursor(rows)

    async def find_one(self, query=None, projection=None):
        identifier = (query or {}).get("id")
        return next((row for row in self.rows if row.get("id") == identifier), None)

    async def distinct(self, field, query=None):
        if field == "id" and (query or {}).get("equipo_id"):
            team_filter = query["equipo_id"]
            team_ids = set(team_filter.get("$in", [])) if isinstance(team_filter, dict) else {team_filter}
            return [row["id"] for row in self.rows if row.get("equipo_id") in team_ids]
        if field == "id" and (query or {}).get("categoria"):
            return [row["id"] for row in self.rows if row.get("categoria") == query["categoria"]]
        identifiers = set(((query or {}).get("id") or {}).get("$in", []))
        return sorted({row.get(field) for row in self.rows if not identifiers or row.get("id") in identifiers if row.get(field)})


def communication_db():
    return SimpleNamespace(
        teams=Collection([{"id": "team-own", "nombre": "Equipo permitido", "categoria": "Alevín"},
                          {"id": "team-other", "nombre": "Equipo ajeno", "categoria": "Cadete"}]),
        players=Collection([{
            "id": "player-own", "equipo_id": "team-own", "familia_id": "family-own",
            "email_formulario": "allowed@example.test",
            "communication_consents": {"email": "yes"},
        }, {
            "id": "player-other", "equipo_id": "team-other", "familia_id": "family-other",
            "email_formulario": "outside@example.test",
            "communication_consents": {"email": "yes"},
        }]),
        families=Collection([{"id": "family-own", "communication_consents": {"email": "yes"}}]),
        users=Collection([]),
        internal_events=Collection([]),
    )


def coach():
    return {"id": "coach-fixture", "username": "coach", "role": "coach", "active": True,
            "account_status": "active", "assigned_team_ids": ["team-own"]}


def run_with_user(user, awaitable):
    token = server.current_user_context.set(user)
    try:
        return asyncio.run(awaitable)
    finally:
        server.current_user_context.reset(token)


@pytest.mark.parametrize("target_type,target_id", [("equipo", "team-own"), ("categoria", "Alevín")])
def test_preview_accepts_in_scope_targets_and_counts_only_consented_contacts(monkeypatch, target_type, target_id):
    monkeypatch.setattr(server, "db", communication_db())
    result = run_with_user(coach(), server.preview_communication_recipients(server.Communication(
        destinatario_tipo=target_type, destinatario_id=target_id, canal="email",
    )))
    assert result["resolved_name"]
    assert result["summary"]["available_emails"] == 1
    assert "outside" not in str(result)


@pytest.mark.parametrize("target_type,target_id", [
    ("equipo", "team-other"),
    ("individual", "player-other"),
    ("individual", "family-other"),
    ("categoria", "Cadete"),
])
def test_direct_preview_rejects_every_out_of_scope_identifier_without_disclosure(monkeypatch, target_type, target_id):
    database = communication_db()
    monkeypatch.setattr(server, "db", database)
    with pytest.raises(Exception) as error:
        run_with_user(coach(), server.preview_communication_recipients(server.Communication(
            destinatario_tipo=target_type, destinatario_id=target_id, canal="email",
        )))
    assert error.value.status_code == 403
    assert error.value.detail == "No tienes permiso para consultar estos destinatarios"
    assert "Equipo ajeno" not in error.value.detail
    event = database.internal_events.insert_one.await_args.args[0]
    assert event["reason"] == "outside_scope"
    assert target_id not in str(event)


def test_user_without_links_cannot_preview_any_target(monkeypatch):
    monkeypatch.setattr(server, "db", communication_db())
    unlinked = {**coach(), "assigned_team_ids": []}
    with pytest.raises(Exception) as error:
        run_with_user(unlinked, server.preview_communication_recipients(server.Communication(
            destinatario_tipo="equipo", destinatario_id="team-own",
        )))
    assert error.value.status_code == 403


@pytest.mark.parametrize("role", ["family", "player"])
def test_family_and_player_cannot_use_preview_even_with_a_manipulated_request(role):
    with pytest.raises(Exception) as error:
        server.enforce_permission({"role": role, "active": True}, "communications", "create")
    assert error.value.status_code == 403


@pytest.mark.parametrize("value", [True, "yes", "Sí", "granted", 1])
def test_explicit_channel_consent_is_accepted(value):
    assert communication_consent({"communication_consents": {"email": value}}, "email") == "granted"


@pytest.mark.parametrize("document,expected", [
    ({"communication_consents": {"email": "no"}}, "revoked"),
    ({"communication_consents": {"email": "perhaps"}}, "missing"),
    ({"historical": {"consents": {"notifications": "unanswered"}}}, "missing"),
    ({}, "missing"),
])
def test_revoked_ambiguous_and_missing_consent_are_never_authorized(document, expected):
    assert communication_consent(document, "email") == expected


def test_consent_is_channel_specific_and_conflicting_duplicates_are_excluded():
    candidates = [
        {"value": "duplicate@example.test", "communication_consents": {"email": "yes", "sms": "no"}},
        {"value": "duplicate@example.test", "communication_consents": {"email": "no"}},
        {"value": "allowed@example.test", "communication_consents": {"email": "yes"}},
    ]
    allowed, excluded = consented_contacts(candidates, "email")
    assert allowed == ["allowed@example.test"]
    assert excluded == {"consent_revoked": 1}
    assert communication_consent(candidates[0], "sms") == "revoked"


def test_locked_accounts_are_not_eligible_recipients():
    locked = {**coach(), "locked_until": (server.utcnow() + timedelta(minutes=5)).isoformat()}
    assert usable_account(locked) == (False, "locked")


@pytest.mark.parametrize("record", [
    {"active": False}, {"estado": "archivado"}, {"account_status": "suspended"},
])
def test_explicitly_inactive_recipient_records_are_excluded(record):
    assert communication_record_active(record) is False
    assert communication_record_active({}) is True


def test_a_jwt_stops_working_immediately_after_the_account_is_locked(monkeypatch):
    user = {**coach(), "session_version": 0,
            "locked_until": (server.utcnow() + timedelta(minutes=5)).isoformat()}
    monkeypatch.setattr(server, "load_user", AsyncMock(return_value=user))
    monkeypatch.setattr(server, "record_security_event", AsyncMock())
    token = server.create_access_token({"sub": user["username"], "ver": 0})
    request = Request({"type": "http", "method": "GET", "path": "/api/dashboard",
                       "headers": [(b"cookie", f"ikastxiki_session={token}".encode())]})
    with pytest.raises(Exception) as error:
        asyncio.run(server.get_current_user(request))
    assert error.value.status_code == 403
    assert "bloque" not in error.value.detail.casefold()
    assert server.record_security_event.await_args.args[3] == "account_locked"


def test_security_audit_contains_only_normalized_aggregate_data(monkeypatch):
    database = communication_db()
    monkeypatch.setattr(server, "db", database)
    asyncio.run(server.record_security_event(
        "security.communication_consent.filtered", coach(), "communication_delivery",
        "consent_not_granted", aggregate={"consent_missing": 2},
    ))
    event = database.internal_events.insert_one.await_args.args[0]
    assert event["aggregate"] == {"consent_missing": 2}
    assert "example.test" not in str(event)
    assert not ({"token", "email", "phone", "message"} & set(event))


def test_delivery_revalidates_consent_and_never_reuses_an_earlier_resolution(monkeypatch):
    user = {"id": "admin-fixture", "username": "admin", "role": "admin", "active": True}
    monkeypatch.setattr(server, "communication_target_context", AsyncMock(return_value={
        "resolved_name": "Equipo ficticio", "summary": {},
    }))
    targets = AsyncMock(side_effect=[
        ([], ["allowed-before-change@example.test"], {}),
        ([], [], {"consent_revoked": 1}),
    ])
    monkeypatch.setattr(server, "communication_targets", targets)
    monkeypatch.setattr(server, "insert_doc", AsyncMock(return_value={"id": "communication-fixture"}))
    monkeypatch.setattr(server, "enqueue_notifications", AsyncMock(return_value=0))
    monkeypatch.setattr(server, "record_security_event", AsyncMock())
    monkeypatch.setattr(server, "get_doc", AsyncMock(return_value={
        "id": "communication-fixture", "estado_envio": "pending", "enviado": False,
    }))
    dispatch = MagicMock()
    monkeypatch.setattr(server, "dispatch_email", dispatch)
    database = SimpleNamespace(
        delivery_logs=SimpleNamespace(insert_many=AsyncMock()),
        communications=SimpleNamespace(update_one=AsyncMock()),
    )
    monkeypatch.setattr(server, "db", database)
    result = run_with_user(user, server.create_communication(server.Communication(
        destinatario_tipo="equipo", destinatario_id="team-fixture", canal="email",
        asunto="Aviso ficticio", mensaje="Contenido ficticio",
    )))
    assert result["estado_envio"] == "pending"
    assert targets.await_count == 2
    dispatch.assert_not_called()
    assert server.record_security_event.await_args.kwargs["aggregate"] == {"consent_revoked": 1}
