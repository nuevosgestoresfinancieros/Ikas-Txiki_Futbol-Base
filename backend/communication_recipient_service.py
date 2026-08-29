"""Recipient preview helpers for Communications.

Only aggregate counts and stable identifiers are returned. Personal contact
values are intentionally omitted from previews and logs.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable, Mapping


CONSENT_ALLOWED = {True, 1, "1", "yes", "si", "sí", "true", "accepted", "granted", "opt_in"}
CONSENT_DENIED = {False, 0, "0", "no", "false", "revoked", "denied", "opt_out"}
INACTIVE_RECORD_STATES = {
    "inactive", "inactivo", "deactivated", "desactivado", "suspended", "suspendido",
    "archived", "archivado", "deleted", "eliminado", "baja",
}


def _normalized_consent(value: Any) -> str:
    if isinstance(value, str):
        value = value.strip().casefold()
    if value in CONSENT_ALLOWED:
        return "granted"
    if value in CONSENT_DENIED:
        return "revoked"
    return "missing"


def communication_consent(document: Mapping[str, Any], channel: str) -> str:
    """Return a conservative, channel-specific consent decision.

    Current records may store consent in one of the supported mappings. Missing
    and ambiguous historical values never grant an external delivery.
    """
    mappings = [
        document.get("communication_consents"),
        document.get("consents"),
        (document.get("historical") or {}).get("consents"),
    ]
    aliases = {
        "email": ("email", "notifications"),
        "sms": ("sms",),
        "telegram": ("telegram",),
        # Historical WhatsApp preferences remain readable, but new deliveries
        # use Telegram and require a separate explicit Telegram consent.
        "whatsapp": ("whatsapp",),
        "in_app": ("in_app", "notifications"),
    }
    for mapping in mappings:
        if not isinstance(mapping, Mapping):
            continue
        for key in aliases.get(channel, (channel,)):
            if key in mapping:
                return _normalized_consent(mapping.get(key))
    return "missing"


def communication_record_active(document: Mapping[str, Any]) -> bool:
    if document.get("active") is False:
        return False
    state = str(document.get("account_status") or document.get("estado") or "").strip().casefold()
    return state not in INACTIVE_RECORD_STATES


def consented_contacts(candidates: Iterable[Mapping[str, Any]], channel: str) -> tuple[list[str], dict[str, int]]:
    """Deduplicate contacts without allowing an allowed duplicate to recover a denied one."""
    decisions: dict[str, list[str]] = defaultdict(list)
    for candidate in candidates:
        value = str(candidate.get("value") or "").strip()
        if not value:
            continue
        decisions[value.casefold()].append(communication_consent(candidate, channel))
    allowed: list[str] = []
    exclusions: dict[str, int] = defaultdict(int)
    for normalized_value, states in decisions.items():
        if states and all(state == "granted" for state in states):
            allowed.append(normalized_value)
        elif "revoked" in states:
            exclusions["consent_revoked"] += 1
        else:
            exclusions["consent_missing"] += 1
    return sorted(allowed), dict(exclusions)


def usable_account(user: dict[str, Any]) -> tuple[bool, str | None]:
    status = user.get("account_status") or ("active" if user.get("active", True) else "deactivated")
    if status != "active" or user.get("active") is False:
        return False, status
    if user.get("locked_until"):
        from datetime import datetime, timezone
        try:
            if datetime.fromisoformat(str(user["locked_until"]).replace("Z", "+00:00")) > datetime.now(timezone.utc):
                return False, "locked"
        except ValueError:
            return False, "locked"
    role = user.get("role")
    if role in {"coach", "coordinator"} and not user.get("assigned_team_ids"):
        return False, "incomplete_link"
    if role == "family" and not user.get("family_id"):
        return False, "incomplete_link"
    if role == "player" and not user.get("player_id"):
        return False, "incomplete_link"
    return True, None


def recipient_summary(users: list[dict], email_count: int, *, team_count: int = 0,
                      player_count: int = 0, family_count: int = 0,
                      extra_exclusions: Mapping[str, int] | None = None,
                      families_found: int | None = None, families_selected: int | None = None,
                      duplicate_families_removed: int = 0,
                      authorized_contacts: int | None = None) -> dict:
    unique: dict[str, dict] = {}
    exclusions: dict[str, int] = {}
    duplicate_count = 0
    for user in users:
        key = str(user.get("id") or user.get("username") or "")
        if not key:
            exclusions["invalid"] = exclusions.get("invalid", 0) + 1
            continue
        if key in unique:
            duplicate_count += 1
            continue
        allowed, reason = usable_account(user)
        if allowed:
            unique[key] = user
        else:
            exclusions[reason or "invalid"] = exclusions.get(reason or "invalid", 0) + 1
    for reason, count in (extra_exclusions or {}).items():
        exclusions[reason] = exclusions.get(reason, 0) + int(count)
    return {
        "teams": team_count,
        "players": player_count,
        "families": family_count,
        "families_found": family_count if families_found is None else families_found,
        "families_selected": family_count if families_selected is None else families_selected,
        "duplicate_families_removed": duplicate_families_removed,
        "active_accounts": len(unique),
        "available_emails": email_count,
        "authorized_contacts": email_count if authorized_contacts is None else authorized_contacts,
        "pending_accounts": sum(1 for user in users if user.get("account_status") == "pending_activation"),
        "incomplete_links": exclusions.get("incomplete_link", 0),
        "duplicate_accounts": duplicate_count,
        "unique_recipients": len(unique),
        "excluded": [{"reason": reason, "count": count} for reason, count in sorted(exclusions.items())],
    }
