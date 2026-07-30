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


def safe_audit_detail(action: str, changed_fields: list[str] | None = None) -> dict:
    """Return an allow-listed audit payload with no values or credentials."""
    allowed = {
        "first_name", "last_name", "email", "language", "role", "account_status",
        "assigned_team_ids", "assigned_category_ids", "player_id", "family_id",
        "linked_player_ids", "active",
    }
    return {
        "action": action,
        "changed_fields": sorted(set(changed_fields or []) & allowed),
    }


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
