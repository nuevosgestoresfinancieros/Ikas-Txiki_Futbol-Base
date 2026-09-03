import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import family_access_service as family_service

from family_access_service import (
    campaign_preflight, classify_parent, enqueue_family, get_mode, manual_invitation,
    parent_data, public_access, set_mode,
)
from user_security_service import issue_token


def family(**changes):
    base = {
        "id": "family-1", "progenitor1_nombre": "Ana Uno",
        "progenitor1_email": "ana@example.test", "progenitor1_crear_acceso": True,
        "progenitor1_email_confirmado": True, "progenitor2_nombre": "Bea Dos",
        "progenitor2_email": "bea@example.test", "progenitor2_crear_acceso": True,
        "progenitor2_email_confirmado": True,
    }
    return {**base, **changes}


def user(slot=1, email="ana@example.test", **changes):
    base = {
        "id": f"user-{slot}", "role": "family", "family_id": "family-1",
        "family_contact_slot": slot, "email": email, "email_normalized": email,
        "account_status": "active", "active": True,
    }
    return {**base, **changes}


def test_two_distinct_confirmed_parents_are_independently_eligible():
    record = family()
    first = classify_parent(record, 1, [], [])
    second = classify_parent(record, 2, [], [])
    assert (first["state"], second["state"]) == ("eligible", "eligible")
    assert first["email"] != second["email"]


def test_active_and_pending_accounts_are_never_eligible_for_resend():
    record = family()
    active = classify_parent(record, 1, [user()], [])
    _plain, invitation = issue_token("test-secret", ttl_minutes=0, ttl_hours=48)
    pending_user = user(account_status="pending_activation", active=False, invitation=invitation)
    pending = classify_parent(record, 1, [pending_user], [])
    assert active["state"] == "active"
    assert pending["state"] == "pending_activation"
    assert "generate_invitation" not in public_access(active, user())["allowed_actions"]
    assert public_access(pending, pending_user)["allowed_actions"] == ["resend_invitation", "block", "view_account"]


@pytest.mark.parametrize("changes,state", [
    ({"progenitor1_email": None}, "missing_email"),
    ({"progenitor1_email_confirmado": False}, "email_unconfirmed"),
    ({"progenitor2_email": "ana@example.test"}, "duplicate_email"),
    ({"progenitor1_email": "invalid"}, "invalid_email"),
])
def test_review_cases_do_not_become_eligible(changes, state):
    assert classify_parent(family(**changes), 1, [], [])["state"] == state


def test_email_owner_conflict_discloses_no_owner_data():
    owner = {"id": "secret-user", "role": "family", "family_id": "other-family",
             "email": "ana@example.test", "first_name": "Never disclose"}
    result = public_access(classify_parent(family(), 1, [], [owner]))
    assert result["state"] == "email_conflict"
    serialized = str(result)
    assert "secret-user" not in serialized and "other-family" not in serialized and "Never disclose" not in serialized


def test_historical_active_account_is_detected_without_new_switch():
    record = family(progenitor1_crear_acceso=False)
    result = classify_parent(record, 1, [user(family_contact_slot=None)], [])
    assert result["state"] == "active" and result["user_id"] == "user-1"


def test_shared_family_does_not_share_security_material():
    first, second = user(1), user(2, "bea@example.test")
    first.update({"session_version": 3, "password_hash": "hash-one"})
    second.update({"session_version": 9, "password_hash": "hash-two"})
    assert first["family_id"] == second["family_id"]
    assert first["id"] != second["id"]
    assert first["session_version"] != second["session_version"]
    assert first["password_hash"] != second["password_hash"]


def test_public_access_never_contains_secrets():
    secured = user(password_hash="hash", invitation={"digest": "digest", "expires_at": "2099-01-01T00:00:00+00:00"})
    result = public_access({**parent_data(family(), 1), "state": "active", "user_id": secured["id"]}, secured)
    assert not ({"password_hash", "token", "digest", "invitation"} & result.keys())
    assert "hash" not in str(result) and "digest" not in str(result)


def test_global_mode_defaults_to_manual_and_delivery_disabled(monkeypatch):
    monkeypatch.delenv("FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED", raising=False)
    settings = SimpleNamespace(find_one=AsyncMock(return_value=None))
    result = asyncio.run(get_mode(SimpleNamespace(settings=settings)))
    assert result == {"mode": "manual", "enabled": False, "delivery_enabled": False, "updated_at": None}


def test_setting_automatic_mode_is_audited_without_secrets():
    settings = SimpleNamespace(
        update_one=AsyncMock(),
        find_one=AsyncMock(return_value={"family_access_provisioning": {"mode": "automatic", "updated_at": "now"}}),
    )
    events = SimpleNamespace(insert_one=AsyncMock())
    db = SimpleNamespace(settings=settings, internal_events=events)
    result = asyncio.run(set_mode(db, "automatic", {"id": "admin", "role": "admin"}))
    assert result["enabled"] is True
    event = events.insert_one.await_args.args[0]
    assert event["detail"] == {"sensitive_values_recorded": False}
    assert not ({"token", "password", "hash"} & event["detail"].keys())



class EmptyCursor:
    async def to_list(self, _limit):
        return []


def test_campaign_preflight_is_strictly_read_only():
    campaigns = SimpleNamespace(insert_one=AsyncMock())
    events = SimpleNamespace(insert_one=AsyncMock())
    db = SimpleNamespace(
        families=SimpleNamespace(find=lambda *_args, **_kwargs: EmptyCursor()),
        family_access_campaigns=campaigns, internal_events=events,
    )
    result = asyncio.run(campaign_preflight(db, {"id": "admin", "role": "admin"}, "secret"))
    assert result["status"] == "confirmation_required"
    assert result["id"].startswith("preflight-")
    campaigns.insert_one.assert_not_awaited()
def test_delivery_guard_is_off_in_test_environment():
    assert os.environ.get("FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED") != "1"


class RowsCursor:
    def __init__(self, rows): self.rows = rows
    async def to_list(self, _limit): return list(self.rows)

class EmptyUsers:
    def find(self, *_args, **_kwargs): return RowsCursor([])

class MemoryJobs:
    def __init__(self): self.rows = []
    async def find_one(self, query, _projection):
        return next((row for row in self.rows if row["idempotency_key"] == query["idempotency_key"]), None)
    async def insert_one(self, row): self.rows.append(dict(row))

class MemoryEvents:
    def __init__(self): self.rows = []
    async def insert_one(self, row): self.rows.append(dict(row))

def test_two_parent_jobs_are_independent_and_repeated_save_is_idempotent():
    jobs, events = MemoryJobs(), MemoryEvents()
    db = SimpleNamespace(users=EmptyUsers(), family_access_jobs=jobs, internal_events=events)
    actor = {"id": "admin", "role": "admin"}
    record = family(updated_at="one")
    first = asyncio.run(enqueue_family(db, record, actor, "family_save"))
    record["updated_at"] = "two"
    second = asyncio.run(enqueue_family(db, record, actor, "family_save"))
    assert len(jobs.rows) == 2
    assert {row["family_contact_slot"] for row in jobs.rows} == {1, 2}
    assert len({row["idempotency_key"] for row in jobs.rows}) == 2
    assert [item["job_id"] for item in first] == [item["job_id"] for item in second]
    assert all(row["family_id"] == "family-1" for row in jobs.rows)
    assert len(events.rows) == 2


def test_disabled_worker_records_pending_delivery_for_retry(monkeypatch):
    job = {
        "id": "job-1", "family_id": "family-1", "family_contact_slot": 1,
        "campaign_id": None,
    }
    user_record = {
        "id": "user-1", "username": "ana.1", "invitation": None,
        "account_status": "pending_activation", "active": False,
    }
    decision = {
        "slot": 1, "name": "Ana Uno", "email": "ana@example.test",
        "phone": None, "state": "eligible",
    }
    db = SimpleNamespace(
        families=SimpleNamespace(find_one=AsyncMock(return_value=family())),
        users=SimpleNamespace(update_one=AsyncMock()),
        delivery_logs=SimpleNamespace(insert_one=AsyncMock()),
    )
    finish = AsyncMock()
    monkeypatch.delenv("FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED", raising=False)
    monkeypatch.setattr(family_service, "claim_job", AsyncMock(return_value=job))
    monkeypatch.setattr(family_service, "_rate_allowed", AsyncMock(return_value=True))
    monkeypatch.setattr(family_service, "prepare_account", AsyncMock(return_value=user_record))
    monkeypatch.setattr(family_service, "decisions_for_family", AsyncMock(return_value=[decision, {
        "slot": 2, "state": "no_access",
    }]))
    monkeypatch.setattr(family_service, "_finish_job", finish)

    result = asyncio.run(family_service.process_one_job(
        db, "worker-1", {"id": "admin", "role": "admin"}, "test-secret",
        lambda value: value, lambda *_args, **_kwargs: {"status": "sent"},
        "https://app.example.test", allow_delivery=False,
    ))

    assert result == {"job_id": "job-1", "status": "review_required", "result_code": "delivery_disabled"}
    log = db.delivery_logs.insert_one.await_args.args[0]
    assert log["status"] == "pending"
    assert log["error"] == "delivery_disabled"
    assert log["recipient"] == "ana@example.test"
    assert log["user_id"] == "user-1"
    assert log["purpose"] == "family_account_activation"
    assert {"created_at", "sent_at", "message_id"} <= log.keys()
    assert "token" not in str(log).lower()
    delivery_update = db.users.update_one.await_args_list[-1].args[1]
    assert delivery_update["$set"]["invitation_delivery"]["status"] == "pending"
    finish.assert_awaited_once_with(
        db, job, "review_required", "delivery_disabled", delivery_state="pending",
    )


@pytest.mark.parametrize("delivery", [
    {"status": "sent", "message_id": "<fixture@example.test>"},
    {"status": "pending", "error": "delivery_disabled", "error_detail": "SMTP desactivado"},
    {"status": "failed", "error": "smtp_connection_error"},
])
def test_manual_invitation_records_mock_delivery_and_never_persists_plain_token(monkeypatch, delivery):
    record = {"digest": "fixture-digest", "expires_at": "2099-01-01T00:00:00+00:00",
              "created_at": "2026-01-01T00:00:00+00:00", "used_at": None, "cancelled_at": None}
    user_record = {"id": "user-1", "username": "ana.1", "invitation": None,
                   "account_status": "pending_activation", "active": False}
    updates, sent = [], []
    db = SimpleNamespace(
        users=SimpleNamespace(update_one=AsyncMock(side_effect=lambda query, update: updates.append(update))),
        delivery_logs=SimpleNamespace(insert_one=AsyncMock()),
        internal_events=SimpleNamespace(insert_one=AsyncMock()),
    )
    decision = {"slot": 1, "name": "Ana Uno", "email": "ana@example.test", "phone": None,
                "requested": True, "email_confirmed": True, "state": "eligible", "user_id": None}
    monkeypatch.setattr(family_service, "decisions_for_family", AsyncMock(return_value=[decision, {"slot": 2, "state": "no_access"}]))
    monkeypatch.setattr(family_service, "prepare_account", AsyncMock(return_value=user_record))
    monkeypatch.setattr(family_service, "issue_token", lambda *_args, **_kwargs: ("fixture-plain-token", dict(record)))

    def dispatcher(*args, **kwargs):
        sent.append((args, kwargs))
        return {"recipient": args[0], **delivery}

    result = asyncio.run(manual_invitation(
        db, family(), 1, {"id": "admin", "role": "admin"}, "secret",
        lambda value: value, dispatcher, "https://app.example.test", allow_delivery=True,
    ))
    assert result["delivery"] == delivery["status"]
    assert sent[0][1]["action_url"] == "https://app.example.test/activar?token=fixture-plain-token"
    assert "fixture-plain-token" not in str(updates)
    assert "fixture-plain-token" not in str(db.delivery_logs.insert_one.await_args.args[0])
