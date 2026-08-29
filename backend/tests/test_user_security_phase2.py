from datetime import timedelta

from user_security_service import (
    generate_temporary_password, invitation_status, issue_token, legacy_session_allowed,
    safe_security_audit, security_public, token_digest, token_is_usable, utcnow,
)
from user_admin_service import validate_password_strength


SECRET = "fictitious-security-secret-at-least-32-characters"


def test_temporary_password_is_strong_and_not_deterministic():
    first, second = generate_temporary_password(), generate_temporary_password()
    assert first != second and len(first) >= 18
    assert validate_password_strength(first) == first


def test_tokens_store_only_digest_and_are_single_use_expiring():
    token, record = issue_token(SECRET)
    assert token not in str(record)
    assert record["digest"] == token_digest(token, SECRET)
    assert token_is_usable(record)
    assert not token_is_usable({**record, "used_at": utcnow().isoformat()})
    expired = {**record, "expires_at": (utcnow() - timedelta(seconds=1)).isoformat()}
    assert not token_is_usable(expired)


def test_invitation_states_cover_pending_used_cancelled_and_expired():
    _, record = issue_token(SECRET)
    assert invitation_status(record) == "pending"
    assert invitation_status({**record, "used_at": utcnow().isoformat()}) == "active"
    assert invitation_status({**record, "cancelled_at": utcnow().isoformat()}) == "cancelled"
    assert invitation_status({**record, "expires_at": (utcnow() - timedelta(seconds=1)).isoformat()}) == "expired"


def test_session_version_preserves_legacy_until_explicit_revocation():
    assert legacy_session_allowed({}, {})
    assert not legacy_session_allowed({}, {"session_version": 1})
    assert legacy_session_allowed({"ver": 3}, {"session_version": 3})
    assert not legacy_session_allowed({"ver": 2}, {"session_version": 3})


def test_public_security_and_audit_never_contain_secrets():
    public = security_public({"session_version": 2, "must_change_password": True,
                              "invitation": {"digest": "hidden", "expires_at": "invalid"}})
    assert public["must_change_password"] and "digest" not in str(public)
    audit = safe_security_audit("password_reset")
    assert audit == {"action": "password_reset", "sensitive_values_recorded": False}


def test_public_security_exposes_authoritative_access_state_without_credentials():
    activated = security_public({"account_status": "active", "active": True, "password_hash": "stored-hash"})
    pending = security_public({"account_status": "pending_activation", "active": False, "password_hash": "stored-hash"})
    blocked = security_public({"account_status": "suspended", "active": False})
    assert activated["access_state"] == "active"
    assert pending["access_state"] == "pending_activation"
    assert blocked["access_state"] == "blocked"
    assert "password_hash" not in activated
