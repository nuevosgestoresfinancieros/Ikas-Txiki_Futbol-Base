import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from family_access_service import (
    campaign_preflight, classify_parent, enqueue_family, get_mode, parent_data, public_access, set_mode,
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
