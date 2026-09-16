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
ACTIVE_USER_STATUSES = {"active", "pending_activation"}
ARCHIVED_USER_STATUSES = ACCOUNT_STATUSES - ACTIVE_USER_STATUSES
COMMON_PASSWORDS = {
    "password", "password123", "contraseña", "qwerty123", "admin123",
    "ikas-txiki", "ikastxiki", "123456789012",
}
FAMILY_PARENT_SLOTS = (1, 2)
_FAMILY_CONTACT_PLACEHOLDERS = frozenset({"familia", "family", "progenitor", "tutor"})


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalized_text(value: Any) -> str:
    return " ".join(str(value or "").strip().split())


def normalized_key(value: Any) -> str:
    return normalized_text(value).casefold()


def _first_value(*values: Any) -> str | None:
    for value in values:
        value = normalized_text(value)
        if value:
            return value
    return None


def _parent_has_data(parent: Mapping[str, Any]) -> bool:
    return bool(parent.get("name") or parent.get("phone") or parent.get("email"))


def family_parent_slot(family: Mapping[str, Any] | None = None, preferred: Any = None,
                       legacy: Mapping[str, Any] | None = None) -> int:
    """Choose the parent slot while keeping old player-shaped records usable."""
    if preferred in FAMILY_PARENT_SLOTS or str(preferred or "").strip() in {"1", "2"}:
        return int(preferred)
    family, legacy = family or {}, legacy or {}
    legacy_email = normalized_key(legacy.get("email"))
    if legacy_email:
        for slot in FAMILY_PARENT_SLOTS:
            if normalized_key(family.get(f"progenitor{slot}_email")) == legacy_email:
                return slot
            if normalized_key(legacy.get(f"progenitor{slot}_email")) == legacy_email:
                return slot
    for slot in FAMILY_PARENT_SLOTS:
        if _parent_has_data({
            "name": _first_value(family.get(f"progenitor{slot}_nombre"), legacy.get(f"progenitor{slot}_nombre")),
            "phone": _first_value(family.get(f"progenitor{slot}_telefono"), legacy.get(f"progenitor{slot}_telefono")),
            "email": _first_value(family.get(f"progenitor{slot}_email"), legacy.get(f"progenitor{slot}_email")),
        }):
            return slot
    return 1


def family_parent(family: Mapping[str, Any] | None = None, slot: Any = None,
                  legacy: Mapping[str, Any] | None = None) -> dict:
    """Return one canonical parent, falling back to legacy player fields."""
    family, legacy = family or {}, legacy or {}
    resolved_slot = family_parent_slot(family, slot, legacy)

    def read_parent(candidate: int) -> dict:
        name = _first_value(
            family.get(f"progenitor{candidate}_nombre"),
            legacy.get(f"progenitor{candidate}_nombre"),
        )
        phone = _first_value(
            family.get(f"progenitor{candidate}_telefono"),
            legacy.get(f"progenitor{candidate}_telefono"),
        )
        email = _first_value(
            family.get(f"progenitor{candidate}_email"),
            legacy.get(f"progenitor{candidate}_email"),
        )
        return {"slot": candidate, "name": name, "phone": phone, "email": email}

    parent = read_parent(resolved_slot)
    if not _parent_has_data(parent) and slot is None:
        for candidate in FAMILY_PARENT_SLOTS:
            parent = read_parent(candidate)
            if _parent_has_data(parent):
                break
    if not parent.get("name"):
        contact = _first_value(family.get("contacto_principal"), legacy.get("contacto_principal"))
        if contact and normalized_key(contact) not in _FAMILY_CONTACT_PLACEHOLDERS:
            parent["name"] = contact
    parent["phone"] = normalized_text(parent.get("phone")) or None
    parent["email"] = normalized_key(parent.get("email")) or None
    return parent


def family_parent_identity(family: Mapping[str, Any] | None = None, slot: Any = None,
                           legacy: Mapping[str, Any] | None = None) -> dict:
    """Build account identity from the selected parent without losing legacy data."""
    legacy = legacy or {}
    parent = family_parent(family, slot, legacy)
    name_parts = normalized_text(parent.get("name")).split(" ", 1)
    first_name = name_parts[0] if name_parts and name_parts[0] else normalized_text(legacy.get("first_name"))
    last_name = name_parts[1] if len(name_parts) > 1 else normalized_text(legacy.get("last_name"))
    return {
        "family_contact_slot": parent.get("slot"),
        "first_name": first_name or None,
        "last_name": last_name or "Familia",
        "email": normalized_key(parent.get("email") or legacy.get("email")) or None,
        "phone": normalized_text(parent.get("phone") or legacy.get("phone")) or None,
        "holder": parent.get("name") or normalized_text(" ".join(
            part for part in (legacy.get("first_name"), legacy.get("last_name")) if part
        )) or None,
    }


def family_parent_name(family: Mapping[str, Any] | None = None, slot: Any = None,
                       legacy: Mapping[str, Any] | None = None) -> str | None:
    return family_parent(family, slot, legacy).get("name")


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


def user_view(user: Mapping[str, Any]) -> str:
    """Administrative bucket; inactive or blocked accounts never leak into daily work."""
    return "active" if account_status(user) in ACTIVE_USER_STATUSES and not user.get("archived_at") else "archived"


def family_access_state(user: Mapping[str, Any] | None) -> str:
    if not user:
        return "no_access"
    status = account_status(user)
    if user.get("archived_at"):
        return "archived"
    if status == "active" and user.get("active", True):
        return "active"
    if status == "pending_activation":
        return "pending_activation"
    if status == "deactivated":
        return "inactive"
    return "blocked"


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
        "linked_player_ids", "family_contact_slot", "active",
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
