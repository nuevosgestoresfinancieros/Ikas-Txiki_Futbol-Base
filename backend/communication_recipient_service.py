"""Recipient preview helpers for Communications.

Only aggregate counts and stable identifiers are returned. Personal contact
values are intentionally omitted from previews and logs.
"""
from __future__ import annotations

from typing import Any


def usable_account(user: dict[str, Any]) -> tuple[bool, str | None]:
    status = user.get("account_status") or ("active" if user.get("active", True) else "deactivated")
    if status != "active" or user.get("active") is False:
        return False, status
    role = user.get("role")
    if role in {"coach", "coordinator"} and not user.get("assigned_team_ids"):
        return False, "incomplete_link"
    if role == "family" and not user.get("family_id"):
        return False, "incomplete_link"
    if role == "player" and not user.get("player_id"):
        return False, "incomplete_link"
    return True, None


def recipient_summary(users: list[dict], email_count: int, *, team_count: int = 0,
                      player_count: int = 0, family_count: int = 0) -> dict:
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
    return {
        "teams": team_count,
        "players": player_count,
        "families": family_count,
        "active_accounts": len(unique),
        "available_emails": email_count,
        "pending_accounts": sum(1 for user in users if user.get("account_status") == "pending_activation"),
        "incomplete_links": exclusions.get("incomplete_link", 0),
        "duplicate_accounts": duplicate_count,
        "unique_recipients": len(unique),
        "excluded": [{"reason": reason, "count": count} for reason, count in sorted(exclusions.items())],
    }
