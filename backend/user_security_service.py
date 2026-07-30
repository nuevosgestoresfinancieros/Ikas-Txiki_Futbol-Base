"""Security helpers for user access lifecycle.

All secrets are returned only to the caller that creates them. Persistent
representations are SHA-256 digests bound to the application secret.
"""
from __future__ import annotations

import hashlib
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping


TOKEN_TTL_MINUTES = 30
INVITATION_TTL_HOURS = 48
LOCK_WINDOW_MINUTES = 15
LOCK_DURATION_MINUTES = 15
MAX_ACCOUNT_ATTEMPTS = 6


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso_after(*, minutes: int = 0, hours: int = 0) -> str:
    return (utcnow() + timedelta(minutes=minutes, hours=hours)).isoformat()


def parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def token_digest(token: str, secret: str) -> str:
    return hashlib.sha256(f"{secret}:{token}".encode("utf-8")).hexdigest()


def issue_token(secret: str, *, ttl_minutes: int = TOKEN_TTL_MINUTES,
                ttl_hours: int = 0) -> tuple[str, dict]:
    plain = secrets.token_urlsafe(32)
    return plain, {
        "digest": token_digest(plain, secret),
        "expires_at": iso_after(minutes=ttl_minutes, hours=ttl_hours),
        "created_at": utcnow().isoformat(), "used_at": None, "cancelled_at": None,
    }


def token_is_usable(record: Mapping[str, Any] | None, *, now: datetime | None = None) -> bool:
    if not record or record.get("used_at") or record.get("cancelled_at"):
        return False
    expires = parse_time(record.get("expires_at"))
    return bool(expires and expires > (now or utcnow()))


def generate_temporary_password(length: int = 18) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%&*"
    while True:
        value = "".join(secrets.choice(alphabet) for _ in range(length))
        if (any(c.islower() for c in value) and any(c.isupper() for c in value)
                and any(c.isdigit() for c in value) and any(not c.isalnum() for c in value)):
            return value


def security_public(user: Mapping[str, Any]) -> dict:
    locked_until = parse_time(user.get("locked_until"))
    locked = bool(locked_until and locked_until > utcnow())
    invitation = user.get("invitation") or {}
    return {
        "must_change_password": bool(user.get("must_change_password", False)),
        "locked": locked, "locked_until": user.get("locked_until") if locked else None,
        "session_version": int(user.get("session_version", 0)),
        "invitation_status": invitation_status(invitation),
        "invitation_expires_at": invitation.get("expires_at"),
        "last_password_change_at": user.get("last_password_change_at"),
        "sessions_revoked_at": user.get("sessions_revoked_at"),
    }


def invitation_status(record: Mapping[str, Any] | None) -> str:
    if not record:
        return "none"
    if record.get("cancelled_at"):
        return "cancelled"
    if record.get("used_at"):
        return "active"
    return "pending" if token_is_usable(record) else "expired"


def legacy_session_allowed(payload: Mapping[str, Any], user: Mapping[str, Any]) -> bool:
    current = int(user.get("session_version", 0))
    supplied = payload.get("ver")
    if supplied is None:
        return current == 0 and not user.get("sessions_revoked_at")
    return int(supplied) == current


def safe_security_audit(action: str) -> dict:
    return {"action": action, "sensitive_values_recorded": False}
