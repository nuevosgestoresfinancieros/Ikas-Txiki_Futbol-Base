import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27039")
os.environ.setdefault("DB_NAME", "ikastxiki_users_phase2_test")
os.environ.setdefault("JWT_SECRET", "users-phase2-fictitious-jwt-secret-at-least-32-characters")
os.environ.setdefault("ADMIN_USER", "users_phase2_admin")
os.environ.setdefault("ADMIN_PASSWORD", "users-phase2-fictitious-admin-password")

import server


def database(user):
    return SimpleNamespace(
        users=SimpleNamespace(
            find_one=AsyncMock(return_value=user),
            update_one=AsyncMock(return_value=SimpleNamespace(modified_count=1)),
            count_documents=AsyncMock(return_value=1),
        ),
        delivery_logs=SimpleNamespace(insert_one=AsyncMock()),
    )


def run_as_admin(call):
    token = server.current_user_context.set({"id": "admin-fixture", "role": "admin"})
    try:
        return asyncio.run(call)
    finally:
        server.current_user_context.reset(token)


@pytest.mark.parametrize("action", [
    server.generate_user_temporary_password, server.generate_user_invitation,
    server.cancel_user_invitation, server.revoke_user_sessions,
    server.lock_user_access, server.unlock_user_access,
])
def test_system_account_rejects_every_mutating_security_action(action):
    with pytest.raises(Exception) as error:
        asyncio.run(action("environment-admin"))
    assert error.value.status_code == 403


def test_temporary_password_is_returned_once_but_only_hash_is_persisted(monkeypatch):
    user = {"id": "user-fixture", "username": "fixture", "role": "coach", "session_version": 0}
    db = database(user)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    result = run_as_admin(server.generate_user_temporary_password(user["id"]))
    update = db.users.update_one.await_args.args[1]["$set"]
    assert result["show_once"] and result["temporary_password"] not in str(update)
    assert update["must_change_password"]
    assert db.users.update_one.await_args.args[1]["$inc"]["session_version"] == 1


def test_invitation_is_emailed_and_keeps_recent_pending_links_usable(monkeypatch):
    user = {"id": "user-fixture", "username": "fixture", "role": "family", "session_version": 0,
            "email": "family@example.invalid",
            "invitation": {"digest": "old", "expires_at": "2099-01-01T00:00:00+00:00"}}
    db = database(user)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    monkeypatch.setenv("PUBLIC_APP_URL", "https://example.invalid")
    sent = {}
    def dispatch(*args, **kwargs):
        sent["args"], sent["kwargs"] = args, kwargs
        return {"status": "sent", "error": None, "recipient": "family@example.invalid"}
    monkeypatch.setattr(server, "dispatch_email", dispatch)
    result = run_as_admin(server.generate_user_invitation(user["id"]))
    update = db.users.update_one.await_args.args[1]["$set"]
    assert result["delivery"] == "sent" and "invitation_token" not in result
    assert "token" not in str(update)
    assert update["invitation_history"] == [user["invitation"]]
    delivery = db.delivery_logs.insert_one.await_args.args[0]
    assert delivery["type"] == "user_access_invitation" and delivery["status"] == "sent"
    assert "Tu usuario de Ikastxiki es: fixture" in sent["args"][2]
    assert "token" not in sent["args"][2].lower()
    assert sent["kwargs"]["template"] == "account_activation"
    assert sent["kwargs"]["action_label"] == "fixture"


def test_recently_resent_invitation_can_still_activate(monkeypatch):
    plain, original = server.issue_token(server.JWT_SECRET, ttl_minutes=0, ttl_hours=48)
    _new_plain, latest = server.issue_token(server.JWT_SECRET, ttl_minutes=0, ttl_hours=48)
    user = {
        "id": "user-fixture", "username": "family", "role": "family",
        "active": False, "account_status": "pending_activation", "session_version": 0,
        "invitation": latest, "invitation_history": [original],
    }
    db = database(user)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    request = server.TokenPasswordRequest(
        token=plain, password="New-Secure-Password-2026!",
        password_confirmation="New-Secure-Password-2026!",
    )
    assert asyncio.run(server.activate_invitation(request)) == {"ok": True, "username": "family"}
    update = db.users.update_one.await_args.args[1]["$set"]
    assert update["active"] is True
    assert update["invitation_history"] == []


def test_activation_link_strips_legacy_cors_origin_brackets(monkeypatch):
    monkeypatch.delenv("PUBLIC_APP_URL", raising=False)
    monkeypatch.setenv("CORS_ORIGINS", "[https://ikasfutbase.cibermedida.es]")
    assert server._activation_link("token_value") == (
        "https://ikasfutbase.cibermedida.es/activar?token=token_value"
    )


def test_activation_link_normalizes_markdown_formatted_public_url(monkeypatch):
    monkeypatch.setenv(
        "PUBLIC_APP_URL",
        "[https://ikasfutbase.cibermedida.es](https://ikasfutbase.cibermedida.es)",
    )
    assert server._activation_link("token_value") == (
        "https://ikasfutbase.cibermedida.es/activar?token=token_value"
    )


def test_player_family_references_do_not_match_by_name_only():
    player = {
        "progenitor1_nombre": "Familia Ejemplo",
        "progenitor1_email": "tutor@example.invalid",
        "progenitor1_telefono": "600 000 000",
    }
    same_name_other_contact = {
        "progenitor1_nombre": "Familia Ejemplo",
        "progenitor1_email": "otra@example.invalid",
        "progenitor1_telefono": "611 111 111",
    }
    assert server._family_reference_values(server._family_details_from_player(player)) == {
        "tutor@example.invalid", "600000000",
    }
    assert not server._family_reference_values(server._family_details_from_player(player)).intersection(
        server._family_reference_values(same_name_other_contact)
    )


def test_invitation_delivery_failure_is_logged_without_disclosing_the_token(monkeypatch):
    user = {"id": "user-fixture", "role": "family", "session_version": 0,
            "email": "family@example.invalid"}
    db = database(user)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    monkeypatch.setenv("PUBLIC_APP_URL", "https://example.invalid")
    monkeypatch.setattr(server, "dispatch_email", lambda *_args, **_kwargs: {
        "status": "failed", "error": "SMTPException", "recipient": "family@example.invalid",
    })
    with pytest.raises(Exception) as error:
        run_as_admin(server.generate_user_invitation(user["id"]))
    assert error.value.status_code == 502
    assert "token" not in str(error.value.detail).lower()
    assert db.delivery_logs.insert_one.await_args.args[0]["status"] == "failed"


def test_session_revocation_rejects_self_and_increments_other_user(monkeypatch):
    user = {"id": "user-fixture", "role": "coach", "session_version": 4}
    db = database(user)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    run_as_admin(server.revoke_user_sessions(user["id"]))
    assert db.users.update_one.await_args.args[1]["$inc"]["session_version"] == 1
    user["id"] = "admin-fixture"
    with pytest.raises(Exception) as error:
        run_as_admin(server.revoke_user_sessions(user["id"]))
    assert error.value.status_code == 409


def test_deactivation_closes_sessions_and_rejects_self(monkeypatch):
    user = {"id": "user-fixture", "role": "coach", "session_version": 4, "active": True,
            "account_status": "active"}
    db = database(user)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    run_as_admin(server.deactivate_user(user["id"]))
    update = db.users.update_one.await_args.args[1]
    assert update["$set"]["account_status"] == "deactivated"
    assert update["$set"]["active"] is False
    assert update["$set"]["sessions_revoked_at"]
    assert update["$inc"]["session_version"] == 1
    user["id"] = "admin-fixture"
    with pytest.raises(Exception) as error:
        run_as_admin(server.deactivate_user(user["id"]))
    assert error.value.status_code == 409


def test_user_routes_remain_administer_only():
    request = SimpleNamespace(url=SimpleNamespace(path="/api/users/u/security/revoke-sessions"), method="POST")
    assert server.route_permission(request) == ("users", "administer")
    for role in ("coordinator", "coach", "family", "player"):
        with pytest.raises(Exception) as error:
            server.enforce_permission({"role": role, "active": True}, "users", "administer")
        assert error.value.status_code == 403


def test_recovery_response_does_not_enumerate_accounts(monkeypatch):
    monkeypatch.delenv("SECURITY_TEST_MODE", raising=False)
    missing_db = database(None)
    monkeypatch.setattr(server, "db", missing_db)
    missing = asyncio.run(server.request_recovery(server.RecoveryRequest(identifier="missing@example.invalid")))
    user = {"id": "user-fixture", "username": "fixture", "role": "player", "active": True,
            "account_status": "active", "session_version": 0}
    existing_db = database(user)
    monkeypatch.setattr(server, "db", existing_db)
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    existing = asyncio.run(server.request_recovery(server.RecoveryRequest(identifier="fixture")))
    assert missing == existing == {"ok": True, "message": "Si la cuenta existe, recibirá instrucciones"}
    assert "test_token" not in existing
    stored = existing_db.users.update_one.await_args.args[1]["$set"]["recovery"]
    assert "digest" in stored and "token" not in stored


def test_recovery_token_is_single_use_and_revokes_sessions(monkeypatch):
    plain, record = server.issue_token(server.JWT_SECRET)
    user = {"id": "user-fixture", "username": "fixture", "role": "player", "active": True,
            "account_status": "active", "session_version": 2, "recovery": record}
    db = database(user)
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    monkeypatch.setattr(server, "load_user", AsyncMock(return_value=user))
    request = server.TokenPasswordRequest(token=plain, password="New-Secure-Password-2026!",
                                          password_confirmation="New-Secure-Password-2026!")
    response = server.Response()
    result = asyncio.run(server.reset_recovery_password(request, response))
    assert result["ok"] and result["user"]["username"] == "fixture"
    cookie = response.headers["set-cookie"]
    assert "ikastxiki_session=" in cookie and "HttpOnly" in cookie and "Secure" in cookie and "SameSite=strict" in cookie
    session_token = cookie.split("ikastxiki_session=", 1)[1].split(";", 1)[0]
    assert server.jwt.decode(session_token, server.JWT_SECRET, algorithms=[server.JWT_ALGORITHM])["ver"] == 3
    update = db.users.update_one.await_args.args[1]["$set"]
    assert update["recovery.used_at"]
    assert db.users.update_one.await_args.args[1]["$inc"]["session_version"] == 1
    assert plain not in str(update) and "New-Secure-Password-2026!" not in str(update)


def test_expired_account_lock_is_not_reported_as_active():
    from datetime import timedelta
    expired = (server.utcnow() - timedelta(seconds=1)).isoformat()
    assert server.security_public({"locked_until": expired})["locked"] is False


def test_second_simultaneous_token_consumer_is_rejected(monkeypatch):
    plain, record = server.issue_token(server.JWT_SECRET)
    user = {"id": "user-fixture", "username": "fixture", "role": "player", "session_version": 0, "recovery": record}
    db = database(user)
    db.users.update_one.side_effect = [SimpleNamespace(modified_count=1), SimpleNamespace(modified_count=0)]
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "record_user_audit", AsyncMock())
    monkeypatch.setattr(server, "load_user", AsyncMock(return_value=user))
    request = server.TokenPasswordRequest(token=plain, password="New-Secure-Password-2026!",
                                          password_confirmation="New-Secure-Password-2026!")
    assert asyncio.run(server.reset_recovery_password(request, server.Response()))["ok"]
    with pytest.raises(Exception) as error:
        asyncio.run(server.reset_recovery_password(request, server.Response()))
    assert error.value.status_code == 400


def test_permanent_deletion_is_disabled_without_transaction_support_and_never_writes(monkeypatch):
    database = SimpleNamespace(command=AsyncMock(return_value={
        "logicalSessionTimeoutMinutes": 30, "maxWireVersion": 21,
    }))
    monkeypatch.setattr(server, "db", database)
    capability = asyncio.run(server.get_permanent_deletion_capability())
    assert capability["enabled"] is False
    assert "replica set" in capability["reason"]
    request = server.PermanentDeletionConfirmation(confirmation="ELIMINAR")
    with pytest.raises(Exception) as error:
        asyncio.run(server.permanently_delete_user("user-fixture", request))
    assert error.value.status_code == 503
    assert not hasattr(database, "users")


def test_permanent_deletion_confirmation_requires_the_exact_word():
    assert server.PermanentDeletionConfirmation(confirmation=" ELIMINAR ").confirmation == "ELIMINAR"
    with pytest.raises(Exception):
        server.PermanentDeletionConfirmation(confirmation="eliminar")
