import pytest
from fastapi import HTTPException

from communication_recipient_service import recipient_summary, usable_account
from user_admin_service import (
    account_status, effective_scope, safe_audit_detail, validate_password_strength,
)


@pytest.mark.parametrize("role", ["admin", "coordinator", "coach", "family", "player"])
def test_effective_scope_is_explicit_for_every_role(role):
    user = {"role": role, "assigned_team_ids": ["team-test"], "assigned_category_ids": ["Alevín"],
            "family_id": "family-test", "linked_player_ids": ["player-test"], "player_id": "player-test"}
    scope = effective_scope(user)
    assert scope["kind"] in {"club", "teams", "family", "player"}
    assert "NO APLICA" not in str(scope)


def test_legacy_account_status_remains_compatible():
    assert account_status({"active": True}) == "active"
    assert account_status({"active": False}) == "deactivated"
    assert account_status({"active": True, "account_status": "suspended"}) == "suspended"


@pytest.mark.parametrize("password", ["short", "password123", "onlylowercase123!", "ONLYUPPERCASE123!"])
def test_weak_or_common_passwords_are_rejected(password):
    with pytest.raises(HTTPException) as error:
        validate_password_strength(password)
    assert error.value.status_code == 422


def test_strong_password_is_accepted_without_being_returned_in_audit():
    secret = "Secure-Fictitious-2026!"
    assert validate_password_strength(secret) == secret
    event = safe_audit_detail("created", ["first_name", "role", "password", "password_hash", "token"])
    assert event == {"action": "created", "changed_fields": ["first_name", "role"]}
    assert secret not in str(event)


def test_recipient_summary_deduplicates_accounts_and_aggregates_exclusions():
    users = [
        {"id": "one", "role": "family", "family_id": "f", "active": True},
        {"id": "one", "role": "family", "family_id": "f", "active": True},
        {"id": "two", "role": "player", "player_id": None, "active": True},
        {"id": "three", "role": "coach", "assigned_team_ids": ["t"], "account_status": "suspended"},
    ]
    summary = recipient_summary(users, 2, team_count=1, player_count=3, family_count=2)
    assert summary["active_accounts"] == 1
    assert summary["available_emails"] == 2
    assert summary["excluded"] == [
        {"reason": "incomplete_link", "count": 1}, {"reason": "suspended", "count": 1},
    ]


@pytest.mark.parametrize("user,expected", [
    ({"role": "admin", "active": True}, (True, None)),
    ({"role": "coach", "active": True, "assigned_team_ids": []}, (False, "incomplete_link")),
    ({"role": "family", "active": False, "family_id": "f"}, (False, "deactivated")),
])
def test_account_recipient_eligibility(user, expected):
    assert usable_account(user) == expected
