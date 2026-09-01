"""Explicit, idempotent batch provisioning for selected family records."""
import re
import secrets
from typing import Any, Mapping
from urllib.parse import quote

from pymongo.errors import DuplicateKeyError
from family_access_service import audit, new_id, now_iso, parent_data, valid_email
from user_admin_service import family_access_state, normalized_key
from user_security_service import INVITATION_TTL_HOURS, generate_temporary_password, issue_token


async def provision(db: Any, families: list[Mapping], actor: Mapping, secret: str, hasher, dispatcher, public_url: str):
    summary = {"accounts_created": 0, "invitations_sent": 0, "existing_accesses": 0, "families_for_review": 0}
    results = []
    for family in families:
        family_id, review, seen = str(family["id"]), False, set()
        children = [str(x) for x in await db.players.distinct("id", {"familia_id": family_id}) if x]
        for slot in (1, 2):
            parent = parent_data(family, slot)
            email = parent["email"]
            if not email or not valid_email(email):
                review, outcome = True, "missing_or_invalid_email"
            elif email in seen:
                review, outcome = True, "duplicate_parent_email"
            else:
                seen.add(email)
                existing = await db.users.find_one({"email_normalized": email}, {"_id": 0})
                if existing:
                    summary["existing_accesses"] += 1
                    outcome = "existing_" + family_access_state(existing)
                else:
                    key = f"family-batch:{family_id}:{slot}"
                    existing = await db.users.find_one({"provisioning_key": key}, {"_id": 0})
                    if existing:
                        summary["existing_accesses"] += 1
                        outcome = "existing_pending_activation"
                    else:
                        base = re.sub(r"[^a-z0-9]+", "", normalized_key(parent["name"]))[:14] or "familia"
                        username = f"{base}.{secrets.token_hex(3)}"
                        while await db.users.find_one({"username_normalized": normalized_key(username)}, {"_id": 1}):
                            username = f"{base}.{secrets.token_hex(3)}"
                        names = (parent["name"] or f"Progenitor {slot}").split(" ", 1)
                        plain, invitation = issue_token(secret, ttl_minutes=0, ttl_hours=INVITATION_TTL_HOURS)
                        moment = now_iso()
                        user = {"id": new_id(), "username": username, "username_normalized": normalized_key(username), "first_name": names[0], "last_name": names[1] if len(names) > 1 else "", "email": email, "email_normalized": email, "phone": parent["phone"], "role": "family", "family_id": family_id, "family_contact_slot": slot, "provisioning_source": "selected_family_batch", "provisioning_key": key, "linked_player_ids": children, "assigned_team_ids": [], "assigned_category_ids": [], "player_id": None, "language": "es", "notification_preferences": {"in_app": True, "email": True, "telegram": True, "callups": True, "schedule_changes": True, "payments": True, "documents": True}, "password_hash": hasher(generate_temporary_password()), "invitation": invitation, "account_status": "pending_activation", "active": False, "must_change_password": False, "session_version": 0, "failed_login_count": 0, "locked_until": None, "created_at": moment, "updated_at": moment, "last_access_at": None}
                        try:
                            await db.users.insert_one(user)
                        except DuplicateKeyError:
                            summary["existing_accesses"] += 1
                            outcome = "existing_pending_activation"
                        else:
                            delivery = dict(dispatcher(email, "Activa tu acceso a Ikas-Txiki", "Hola,\n\nActiva tu acceso y crea tu contraseña personal.", action_url=f"{public_url.rstrip('/')}/activar?token={quote(plain, safe='')}", action_label=username, template="account_activation"))
                            safe = {k: delivery.get(k) for k in ("id", "channel", "provider", "status", "error", "created_at", "sent_at")}
                            safe.update({"type": "family_access_invitation", "family_id": family_id, "user_id": user["id"]})
                            await db.delivery_logs.insert_one(safe)
                            await audit(db, actor, "selected_batch_account_created", family_id=family_id, slot=slot)
                            summary["accounts_created"] += 1
                            summary["invitations_sent"] += int(delivery.get("status") == "sent")
                            outcome = "created"
            results.append({"family_id": family_id, "slot": slot, "outcome": outcome})
        summary["families_for_review"] += int(review)
    return {"ok": True, "summary": summary, "results": results}
