"""Pure helpers for the administrative user module.

The helpers deliberately avoid database access so validation can be shared by
the API and exercised without production data.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Mapping

from fastapi import HTTPException


ACCOUNT_STATUSES = {
    "pending_activation", "active", "suspended", "deactivated", "incomplete_link",
}
COMMON_PASSWORDS = {
    "password", "password123", "contraseña", "qwerty123", "admin123",
    "ikas-txiki", "ikastxiki", "123456789012",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalized_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def normalized_key(value: Any) -> str:
    return normalized_text(value).casefold()


def user_search_text(user: Mapping[str, Any]) -> str:
    return normalized_key(" ".join(str(user.get(field) or "") for field in (
        "username", "first_name", "last_name", "email",
    )))


def link_is_complete(user: Mapping[str, Any]) -> bool:
    role = str(user.get("role") or "player")
    if role == "admin":
        return True
    if role in {"coach", "coordinator"}:
        return bool(user.get("assigned_team_ids"))
    if role == "family":
        return bool(user.get("family_id") and user.get("linked_player_ids"))
    return bool(user.get("player_id"))


def security_state(user: Mapping[str, Any], now: datetime | None = None) -> str:
    if user.get("locked_until"):
        try:
            locked = datetime.fromisoformat(str(user["locked_until"]).replace("Z", "+00:00"))
            if locked > (now or datetime.now(timezone.utc)):
                return "locked"
        except ValueError:
            pass
    if user.get("must_change_password"):
        return "password_change_required"
    invitation = user.get("invitation") or {}
    if invitation and not invitation.get("used_at") and not invitation.get("cancelled_at"):
        try:
            expires = datetime.fromisoformat(str(invitation.get("expires_at", "")).replace("Z", "+00:00"))
            return "invitation_expired" if expires <= (now or datetime.now(timezone.utc)) else "invitation_pending"
        except ValueError:
            return "invitation_pending"
    return "verified"


def account_status(user: Mapping[str, Any]) -> str:
    explicit = normalized_key(user.get("account_status"))
    if explicit in ACCOUNT_STATUSES:
        return explicit
    return "active" if user.get("active", True) else "deactivated"


def status_is_active(status: str) -> bool:
    return status == "active"


def validate_password_strength(password: str) -> str:
    if len(password) < 12:
        raise HTTPException(status_code=422, detail="La contraseña debe tener al menos 12 caracteres")
    if password.casefold() in COMMON_PASSWORDS:
        raise HTTPException(status_code=422, detail="La contraseña es demasiado común")
    checks = (
        re.search(r"[a-z]", password), re.search(r"[A-Z]", password),
        re.search(r"\d", password), re.search(r"[^A-Za-z0-9]", password),
    )
    if not all(checks):
        raise HTTPException(
            status_code=422,
            detail="La contraseña debe incluir mayúscula, minúscula, número y símbolo",
        )
    return password


def safe_audit_detail(action: str, changed_fields: list[str] | None = None,
                      previous: Mapping[str, Any] | None = None,
                      current: Mapping[str, Any] | None = None) -> dict:
    """Return an allow-listed audit payload with no values or credentials."""
    allowed = {
        "first_name", "last_name", "email", "phone", "language", "role", "account_status",
        "assigned_team_ids", "assigned_category_ids", "player_id", "family_id",
        "linked_player_ids", "active",
    }
    detail = {
        "action": action,
        "changed_fields": sorted(set(changed_fields or []) & allowed),
    }
    if previous is not None or current is not None:
        previous, current = previous or {}, current or {}
        for field in ("role", "account_status"):
            if field in detail["changed_fields"]:
                detail[field] = {"previous": previous.get(field), "current": current.get(field)}
        for field in ("assigned_team_ids", "assigned_category_ids", "linked_player_ids"):
            if field in detail["changed_fields"]:
                detail[f"{field}_count"] = {
                    "previous": len(previous.get(field) or []), "current": len(current.get(field) or []),
                }
    return detail


def effective_scope(user: Mapping[str, Any]) -> dict:
    role = str(user.get("role") or "player")
    if role == "admin":
        return {"kind": "club", "team_ids": [], "category_ids": [], "player_ids": []}
    if role in {"coordinator", "coach"}:
        return {
            "kind": "teams", "team_ids": list(user.get("assigned_team_ids") or []),
            "category_ids": list(user.get("assigned_category_ids") or []), "player_ids": [],
        }
    if role == "family":
        return {
            "kind": "family", "family_id": user.get("family_id"),
            "player_ids": list(user.get("linked_player_ids") or []),
        }
    return {"kind": "player", "player_ids": [user.get("player_id")] if user.get("player_id") else []}
