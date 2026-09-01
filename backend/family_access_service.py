"""Aprovisionamiento seguro y durable de accesos familiares.

El servicio no activa la entrega por correo por sí mismo. La entrega automática
requiere simultáneamente el modo funcional ``automatic`` y la variable
``FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED=1``. Esto permite desplegar y migrar la
estructura sin producir correos reales.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Mapping
from urllib.parse import quote
from uuid import uuid4

from pymongo import ReturnDocument

from pymongo.errors import DuplicateKeyError
from user_admin_service import account_status, family_access_state, normalized_key, normalized_text
from user_security_service import (
    INVITATION_TTL_HOURS, generate_temporary_password, invitation_status,
    issue_token, parse_time, token_is_usable,
)


ACCESS_MODE_MANUAL = "manual"
ACCESS_MODE_AUTOMATIC = "automatic"
CAMPAIGN_CONFIRMATION = "CONFIRMAR APROVISIONAMIENTO"
DEFAULT_RATE_PER_MINUTE = 20
SAFE_USER_PROJECTION = {
    "_id": 0, "password_hash": 0, "invitation.digest": 0,
    "invitation_history": 0, "recovery": 0, "previous_invitation": 0,
}
REVIEW_STATES = {
    "missing_email", "email_unconfirmed", "duplicate_email", "email_conflict",
    "blocked", "ambiguous_existing_account", "invalid_email",
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return utcnow().isoformat()


def new_id() -> str:
    return str(uuid4())


def valid_email(value: Any) -> bool:
    email = normalized_key(value)
    return bool(email and re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email))


def slot_fields(slot: int) -> dict[str, str]:
    if slot not in {1, 2}:
        raise ValueError("Slot familiar no válido")
    prefix = f"progenitor{slot}"
    return {
        "name": f"{prefix}_nombre", "phone": f"{prefix}_telefono",
        "email": f"{prefix}_email", "requested": f"{prefix}_crear_acceso",
        "confirmed": f"{prefix}_email_confirmado",
    }


def parent_data(family: Mapping[str, Any], slot: int) -> dict[str, Any]:
    fields = slot_fields(slot)
    return {
        "slot": slot,
        "name": normalized_text(family.get(fields["name"])),
        "phone": normalized_text(family.get(fields["phone"])) or None,
        "email": normalized_key(family.get(fields["email"])) or None,
        "requested": bool(family.get(fields["requested"], False)),
        "email_confirmed": bool(family.get(fields["confirmed"], False)),
    }


def _pending(user: Mapping[str, Any]) -> bool:
    return account_status(user) == "pending_activation" and token_is_usable(user.get("invitation"))


def _blocked(user: Mapping[str, Any]) -> bool:
    locked_until = parse_time(user.get("locked_until"))
    return account_status(user) in {"suspended", "deactivated"} or bool(locked_until and locked_until > utcnow())


def _equivalent(user: Mapping[str, Any], family_id: str, slot: int, email: str | None) -> bool:
    if user.get("role") != "family" or str(user.get("family_id") or "") != family_id:
        return False
    user_slot = user.get("family_contact_slot")
    if user_slot is not None:
        return int(user_slot) == slot
    return bool(email and normalized_key(user.get("email")) == email)


def classify_parent(
    family: Mapping[str, Any], slot: int, family_users: list[Mapping[str, Any]],
    email_owners: list[Mapping[str, Any]],
) -> dict[str, Any]:
    """Clasifica un slot sin exponer información del propietario de conflictos."""
    parent = parent_data(family, slot)
    family_id = str(family.get("id") or "")
    sibling = parent_data(family, 2 if slot == 1 else 1)
    base = {**parent, "family_id": family_id, "user_id": None, "state": "no_access"}
    # Las cuentas históricas inequívocas se muestran aunque el nuevo interruptor
    # todavía no exista en la ficha familiar.
    equivalent = [u for u in family_users if _equivalent(u, family_id, slot, parent["email"])]
    slot_accounts = [u for u in family_users if u.get("family_contact_slot") == slot]
    if len(equivalent) > 1 or (slot_accounts and not equivalent):
        return {**base, "state": "ambiguous_existing_account"}
    if equivalent:
        user = equivalent[0]
        result = {**base, "user_id": user.get("id")}
        state = family_access_state(user)
        if state == "pending_activation" and not _pending(user):
            state = "invitation_expired"
        return {**result, "state": state}
    if not parent["requested"]:
        return base
    if not parent["email"]:
        return {**base, "state": "missing_email"}
    if not valid_email(parent["email"]):
        return {**base, "state": "invalid_email"}
    if not parent["email_confirmed"]:
        return {**base, "state": "email_unconfirmed"}
    if sibling["requested"] and sibling["email"] == parent["email"]:
        return {**base, "state": "duplicate_email"}


    if email_owners:
        return {**base, "state": "email_conflict"}
    return {**base, "state": "eligible"}


def public_access(decision: Mapping[str, Any], user: Mapping[str, Any] | None = None) -> dict:
    state = str(decision.get("state") or "no_access")
    actions: list[str] = []
    user_id = decision.get("user_id")
    if state in {"eligible", "invitation_expired"}:
        actions.append("generate_invitation")
    if state == "pending_activation":
        actions.append("resend_invitation")
    if state == "missing_email" or (state == "invitation_expired" and user_id):
        actions.append("temporary_password")
    if user_id and state not in {"blocked"}:
        actions.append("block")
    if user_id:
        actions.append("view_account")
    return {
        "slot": decision.get("slot"), "name": decision.get("name") or "",
        "email": decision.get("email"), "requested": bool(decision.get("requested")),
        "email_confirmed": bool(decision.get("email_confirmed")), "state": state,
        "user_id": user_id, "username": (user or {}).get("username") if user_id else None, "invitation_status": invitation_status((user or {}).get("invitation")),
        "allowed_actions": actions,
    }


async def decisions_for_family(db: Any, family: Mapping[str, Any]) -> list[dict[str, Any]]:
    family_id = str(family.get("id") or "")
    family_users = await db.users.find({"role": "family", "family_id": family_id}, {"_id": 0}).to_list(100)
    decisions = []
    for slot in (1, 2):
        email = parent_data(family, slot)["email"]
        owners = []
        if email:
            owners = await db.users.find({"email_normalized": email}, {"_id": 0}).to_list(20)
            owners = [owner for owner in owners if not _equivalent(owner, family_id, slot, email)]
        decisions.append(classify_parent(family, slot, family_users, owners))
    return decisions


async def public_accesses(db: Any, family: Mapping[str, Any]) -> list[dict[str, Any]]:
    decisions = await decisions_for_family(db, family)
    result = []
    for decision in decisions:
        user = None
        if decision.get("user_id"):
            user = await db.users.find_one({"id": decision["user_id"]}, {"_id": 0})
        result.append(public_access(decision, user))
    return result


async def get_mode(db: Any) -> dict[str, Any]:
    record = await db.settings.find_one({"id": "global"}, {"_id": 0, "family_access_provisioning": 1}) or {}
    config = record.get("family_access_provisioning") or {}
    mode = config.get("mode") if config.get("mode") in {ACCESS_MODE_MANUAL, ACCESS_MODE_AUTOMATIC} else ACCESS_MODE_MANUAL
    return {
        "mode": mode, "enabled": mode == ACCESS_MODE_AUTOMATIC,
        "delivery_enabled": os.environ.get("FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED") == "1",
        "updated_at": config.get("updated_at"),
    }


async def set_mode(db: Any, mode: str, actor: Mapping[str, Any]) -> dict[str, Any]:
    if mode not in {ACCESS_MODE_MANUAL, ACCESS_MODE_AUTOMATIC}:
        raise ValueError("Modo de aprovisionamiento no válido")
    moment = now_iso()
    await db.settings.update_one({"id": "global"}, {"$set": {
        "family_access_provisioning": {
            "mode": mode, "updated_at": moment, "updated_by_user_id": actor.get("id"),
        }
    }}, upsert=True)
    await audit(db, actor, f"auto_mode_{'enabled' if mode == ACCESS_MODE_AUTOMATIC else 'disabled'}")
    return await get_mode(db)


async def audit(db: Any, actor: Mapping[str, Any], action: str, **detail: Any) -> None:
    safe_detail = {key: value for key, value in detail.items() if key in {
        "campaign_id", "job_id", "family_id", "slot", "result_code", "count",
    }}
    safe_detail["sensitive_values_recorded"] = False
    await db.internal_events.insert_one({
        "id": new_id(), "type": f"family_access.{action}",
        "actor_user_id": actor.get("id"), "actor_role": actor.get("role"),
        "detail": safe_detail, "created_at": now_iso(),
    })


def _job_key(source_id: str, family_id: str, slot: int) -> str:
    return f"{source_id}:{family_id}:{slot}"


async def enqueue_family(db: Any, family: Mapping[str, Any], actor: Mapping[str, Any], source: str,
                         campaign_id: str | None = None) -> list[dict[str, Any]]:
    decisions = await decisions_for_family(db, family)
    source_id = campaign_id or "family-save"
    results = []
    for decision in decisions:
        state = decision["state"]
        if state != "eligible":
            results.append({"slot": decision["slot"], "state": state})
            continue
        job = {
            "id": new_id(), "campaign_id": campaign_id, "source": source,
            "family_id": family["id"], "family_contact_slot": decision["slot"],
            "idempotency_key": _job_key(f"{source_id}:{decision.get('email') or 'no-email'}", family["id"], decision["slot"]),
            "status": "queued", "decision": "eligible", "attempt_count": 0,
            "next_attempt_at": now_iso(), "lease_owner": None, "lease_expires_at": None,
            "delivery_state": "not_started", "result_code": None,
            "created_at": now_iso(), "updated_at": now_iso(),
        }
        existing = await db.family_access_jobs.find_one({"idempotency_key": job["idempotency_key"]}, {"_id": 0})
        if not existing:
            await db.family_access_jobs.insert_one(job)
            existing = job
            await audit(db, actor, "job_queued", job_id=job["id"], family_id=family["id"], slot=decision["slot"])
        results.append({"slot": decision["slot"], "state": existing["status"], "job_id": existing["id"]})
    return results


def _fingerprint(summary: Mapping[str, int], secret: str) -> str:
    canonical = "|".join(f"{key}:{summary[key]}" for key in sorted(summary))
    return hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()


async def campaign_preflight(db: Any, actor: Mapping[str, Any], secret: str) -> dict[str, Any]:
    families = await db.families.find({}, {"_id": 0}).to_list(100000)
    counts: Counter[str] = Counter()
    for family in families:
        for decision in await decisions_for_family(db, family):
            state = decision["state"]
            counts["ready_to_invite" if state == "eligible" else state] += 1
    summary = {
        "ready_to_invite": counts["ready_to_invite"], "already_active": counts["active"],
        "pending_activation": counts["pending_activation"], "missing_email": counts["missing_email"],
        "unconfirmed_email": counts["email_unconfirmed"], "duplicate_email": counts["duplicate_email"],
        "conflicts": counts["email_conflict"] + counts["ambiguous_existing_account"],
        "blocked": counts["blocked"],
    }
    moment = now_iso()
    fingerprint = _fingerprint(summary, secret)
    campaign = {
        "id": f"preflight-{fingerprint[:24]}", "type": "family_access_provisioning", "status": "confirmation_required",
        "created_by_user_id": actor.get("id"), "created_at": moment, "confirmed_by_user_id": None,
        "confirmed_at": None, "preflight_version": 1, "preflight_fingerprint": fingerprint,
        "summary": summary, "progress": {"total_jobs": 0, "completed": 0, "sent": 0, "skipped": 0, "review": 0, "failed": 0},
        "started_at": None, "completed_at": None, "paused_at": None, "updated_at": moment,
    }
    return public_campaign(campaign)


def public_campaign(campaign: Mapping[str, Any]) -> dict[str, Any]:
    return {key: campaign.get(key) for key in (
        "id", "status", "created_at", "confirmed_at", "summary", "progress",
        "started_at", "completed_at", "paused_at", "updated_at", "preflight_fingerprint",
    )}


async def confirm_campaign(db: Any, campaign_id: str, fingerprint: str, confirmation: str,
                           actor: Mapping[str, Any], secret: str) -> dict[str, Any]:
    if confirmation != CAMPAIGN_CONFIRMATION:
        raise ValueError("La confirmación de campaña no es válida")
    campaign = await db.family_access_campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign and campaign_id != f"preflight-{fingerprint[:24]}":
        raise LookupError("Campaña no encontrada")
    if campaign and campaign.get("status") != "confirmation_required":
        raise RuntimeError("La campaña ya ha sido confirmada o no se puede confirmar")
    if campaign and not hmac.compare_digest(str(campaign.get("preflight_fingerprint") or ""), fingerprint):
        raise RuntimeError("El preflight ha cambiado; genera uno nuevo antes de confirmar")

    # Recalcular agregados sin crear una segunda campaña.
    families = await db.families.find({}, {"_id": 0}).to_list(100000)
    counts: Counter[str] = Counter()
    eligible: list[dict[str, Any]] = []
    for family in families:
        decisions = await decisions_for_family(db, family)
        for decision in decisions:
            state = decision["state"]
            counts["ready_to_invite" if state == "eligible" else state] += 1
            if state == "eligible":
                eligible.append({"family": family, "slot": decision["slot"]})
    summary = {
        "ready_to_invite": counts["ready_to_invite"], "already_active": counts["active"],
        "pending_activation": counts["pending_activation"], "missing_email": counts["missing_email"],
        "unconfirmed_email": counts["email_unconfirmed"], "duplicate_email": counts["duplicate_email"],
        "conflicts": counts["email_conflict"] + counts["ambiguous_existing_account"], "blocked": counts["blocked"],
    }
    if not hmac.compare_digest(_fingerprint(summary, secret), fingerprint):
        raise RuntimeError("Los datos han cambiado; genera un nuevo preflight")
    if not campaign:
        moment = now_iso()
        campaign = {
            "id": campaign_id, "type": "family_access_provisioning", "status": "confirmation_required",
            "created_by_user_id": actor.get("id"), "created_at": moment,
            "confirmed_by_user_id": None, "confirmed_at": None, "preflight_version": 1,
            "preflight_fingerprint": fingerprint, "summary": summary,
            "progress": {"total_jobs": 0, "completed": 0, "sent": 0, "skipped": 0, "review": 0, "failed": 0},
            "started_at": None, "completed_at": None, "paused_at": None, "updated_at": moment,
        }
        await db.family_access_campaigns.insert_one(campaign)

    for item in eligible:
        await enqueue_family(db, item["family"], actor, "campaign", campaign_id)
    moment = now_iso()
    total = await db.family_access_jobs.count_documents({"campaign_id": campaign_id})
    await db.family_access_campaigns.update_one({"id": campaign_id, "status": "confirmation_required"}, {"$set": {
        "status": "queued", "confirmed_by_user_id": actor.get("id"), "confirmed_at": moment,
        "progress.total_jobs": total, "updated_at": moment,
    }})
    await audit(db, actor, "campaign_confirmed", campaign_id=campaign_id, count=total)
    return public_campaign(await db.family_access_campaigns.find_one({"id": campaign_id}, {"_id": 0}))


async def list_campaigns(db: Any) -> list[dict[str, Any]]:
    rows = await db.family_access_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return [public_campaign(row) for row in rows]


async def campaign_action(db: Any, campaign_id: str, action: str, actor: Mapping[str, Any]) -> dict[str, Any]:
    campaign = await db.family_access_campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise LookupError("Campaña no encontrada")
    transitions = {
        "pause": ({"queued", "running"}, "paused"),
        "resume": ({"paused", "failed"}, "queued"),
        "cancel": ({"confirmation_required", "queued", "paused"}, "cancelled"),
    }
    if action not in transitions or campaign.get("status") not in transitions[action][0]:
        raise RuntimeError("La campaña no admite esta operación")
    target = transitions[action][1]
    moment = now_iso()
    updates = {"status": target, "updated_at": moment}
    if target == "paused": updates["paused_at"] = moment
    await db.family_access_campaigns.update_one({"id": campaign_id, "status": campaign["status"]}, {"$set": updates})
    if target == "cancelled":
        await db.family_access_jobs.update_many({"campaign_id": campaign_id, "status": "queued"}, {"$set": {"status": "skipped", "result_code": "campaign_cancelled", "updated_at": moment}})
    await audit(db, actor, f"campaign_{action}d" if action != "pause" else "campaign_paused", campaign_id=campaign_id)
    return public_campaign(await db.family_access_campaigns.find_one({"id": campaign_id}, {"_id": 0}))


async def _rate_allowed(db: Any, maximum: int = DEFAULT_RATE_PER_MINUTE) -> bool:
    minute = utcnow().replace(second=0, microsecond=0).isoformat()
    try:
        record = await db.family_access_rate_limits.find_one_and_update(
            {"id": f"global:{minute}", "count": {"$lt": maximum}},
            {"$inc": {"count": 1}, "$setOnInsert": {"created_at": utcnow()}},
            upsert=True, return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError:
        return False
    return bool(record and record.get("count", 0) <= maximum)


async def claim_job(db: Any, worker_id: str) -> dict[str, Any] | None:
    moment, lease = now_iso(), (utcnow() + timedelta(minutes=5)).isoformat()
    return await db.family_access_jobs.find_one_and_update({
        "status": {"$in": ["queued", "retry_wait"]}, "next_attempt_at": {"$lte": moment},
        "$or": [{"lease_expires_at": None}, {"lease_expires_at": {"$lte": moment}}],
    }, {"$set": {"status": "claimed", "lease_owner": worker_id, "lease_expires_at": lease, "updated_at": moment},
        "$inc": {"attempt_count": 1}}, return_document=ReturnDocument.AFTER)


async def prepare_account(db: Any, family: Mapping[str, Any], decision: Mapping[str, Any],
                          password_hasher: Callable[[str], str]) -> dict[str, Any]:
    slot, email = int(decision["slot"]), normalized_key(decision.get("email")) or None
    key = f"{family['id']}:{slot}"
    existing = await db.users.find_one({"provisioning_key": key}, {"_id": 0})
    if existing:
        return existing
    base = re.sub(r"[^a-z0-9]+", "", normalized_key(decision.get("name")))[:14] or "familia"
    username = None
    for _ in range(100):
        candidate = f"{base}.{secrets.token_hex(3)}"
        if not await db.users.find_one({"username_normalized": candidate}, {"_id": 1}):
            username = candidate; break
    if not username:
        raise RuntimeError("No se ha podido generar un usuario único")
    full_name = normalized_text(decision.get("name")) or f"Progenitor {slot}"
    parts = full_name.split(" ", 1)
    moment = now_iso()
    user = {
        "id": new_id(), "username": username, "username_normalized": normalized_key(username),
        "first_name": parts[0] if parts else "Familia", "last_name": parts[1] if len(parts) > 1 else "Familia",
        "email": email, "email_normalized": email, "phone": decision.get("phone"),
        "role": "family", "family_id": family["id"], "family_contact_slot": slot,
        "provisioning_source": "family_access", "provisioning_key": key,
        "linked_player_ids": [], "assigned_team_ids": [], "assigned_category_ids": [], "player_id": None,
        "language": "es", "notification_preferences": {"in_app": True, "email": True, "telegram": True, "callups": True, "schedule_changes": True, "payments": True, "documents": True},
        "password_hash": password_hasher(generate_temporary_password()), "account_status": "pending_activation",
        "active": False, "must_change_password": False, "session_version": 0,
        "failed_login_count": 0, "locked_until": None, "created_at": moment,
        "updated_at": moment, "last_access_at": None,
    }
    user["linked_player_ids"] = [str(value) for value in await db.players.distinct("id", {"familia_id": family["id"]}) if value]
    await db.users.insert_one(user)
    return user


async def process_one_job(
    db: Any, worker_id: str, actor: Mapping[str, Any], secret: str,
    password_hasher: Callable[[str], str], dispatcher: Callable[..., Mapping[str, Any]],
    public_app_url: str, *, allow_delivery: bool = False,
) -> dict[str, Any] | None:
    job = await claim_job(db, worker_id)
    if not job:
        return None
    if job.get("campaign_id"):
        campaign = await db.family_access_campaigns.find_one({"id": job["campaign_id"]}, {"_id": 0, "status": 1})
        campaign_status = (campaign or {}).get("status")
        if campaign_status not in {"queued", "running"}:
            target = "skipped" if campaign_status == "cancelled" else "queued"
            await db.family_access_jobs.update_one({"id": job["id"]}, {"$set": {
                "status": target, "result_code": "campaign_cancelled" if target == "skipped" else "campaign_paused",
                "next_attempt_at": (utcnow() + timedelta(minutes=1)).isoformat(),
                "lease_owner": None, "lease_expires_at": None, "updated_at": now_iso(),
            }})
            return {"job_id": job["id"], "status": target, "result_code": "campaign_not_running"}

    family = await db.families.find_one({"id": job["family_id"]}, {"_id": 0})
    if not family:
        await _finish_job(db, job, "review_required", "family_missing")
        return {"job_id": job["id"], "status": "review_required"}
    decision = (await decisions_for_family(db, family))[int(job["family_contact_slot"]) - 1]
    if decision["state"] != "eligible":
        status = "skipped" if decision["state"] in {"active", "pending_activation", "no_access"} else "review_required"
        await _finish_job(db, job, status, decision["state"])
        return {"job_id": job["id"], "status": status, "result_code": decision["state"]}
    if not await _rate_allowed(db):
        await db.family_access_jobs.update_one({"id": job["id"]}, {"$set": {
            "status": "retry_wait", "next_attempt_at": (utcnow() + timedelta(minutes=1)).isoformat(),
            "lease_owner": None, "lease_expires_at": None, "result_code": "rate_limited", "updated_at": now_iso(),
        }})
        return {"job_id": job["id"], "status": "retry_wait"}
    try:
        user = await prepare_account(db, family, decision, password_hasher)
    except Exception:
        await _finish_job(db, job, "review_required", "account_conflict")
        return {"job_id": job["id"], "status": "review_required", "result_code": "account_conflict"}
    # Reevaluar después de crear: la cuenta preparada todavía no tiene invitación.
    if token_is_usable(user.get("invitation")):
        await _finish_job(db, job, "skipped", "pending_activation")
        return {"job_id": job["id"], "status": "skipped"}
    plain, invitation = issue_token(secret, ttl_minutes=0, ttl_hours=INVITATION_TTL_HOURS)
    await db.users.update_one({"id": user["id"], "active": {"$ne": True}}, {"$set": {
        "invitation": invitation, "account_status": "pending_activation", "active": False, "updated_at": now_iso(),
    }})
    delivery_enabled = allow_delivery and os.environ.get("FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED") == "1"
    if not delivery_enabled:
        await _finish_job(db, job, "review_required", "delivery_disabled")
        return {"job_id": job["id"], "status": "review_required", "result_code": "delivery_disabled"}
    await db.family_access_jobs.update_one({"id": job["id"]}, {"$set": {"status": "sending", "delivery_state": "sending", "updated_at": now_iso()}})
    link = f"{public_app_url.rstrip('/')}/activar?token={quote(plain, safe='')}"
    try:
        delivery = dict(dispatcher(
            decision["email"], "Activa tu acceso a Ikas-Txiki",
            f"Hola,\n\nTu usuario de Ikastxiki es: {user['username']}.\n\nActiva tu acceso y crea tu contraseña personal.",
            action_url=link, action_label=user["username"], template="account_activation",
        ))
    except Exception:
        await _finish_job(db, job, "review_required", "delivery_uncertain", delivery_state="uncertain")
        return {"job_id": job["id"], "status": "review_required", "result_code": "delivery_uncertain"}
    safe_delivery = {key: delivery.get(key) for key in ("id", "channel", "provider", "status", "error", "created_at", "sent_at")}
    safe_delivery.update({"type": "family_access_invitation", "family_id": family["id"], "user_id": user["id"], "job_id": job["id"]})
    await db.delivery_logs.insert_one(safe_delivery)
    if delivery.get("status") == "sent":
        await _finish_job(db, job, "sent", "sent", delivery_state="sent")
        await audit(db, actor, "invitation_sent", job_id=job["id"], family_id=family["id"], slot=decision["slot"])
        return {"job_id": job["id"], "status": "sent"}
    await _finish_job(db, job, "review_required", "delivery_failed", delivery_state="failed")
    return {"job_id": job["id"], "status": "review_required", "result_code": "delivery_failed"}


async def _finish_job(db: Any, job: Mapping[str, Any], status: str, result_code: str,
                      delivery_state: str | None = None) -> None:
    updates = {"status": status, "result_code": result_code, "lease_owner": None,
               "lease_expires_at": None, "updated_at": now_iso()}
    if delivery_state: updates["delivery_state"] = delivery_state
    await db.family_access_jobs.update_one({"id": job["id"]}, {"$set": updates})
    if job.get("campaign_id"):
        campaign_id = job["campaign_id"]
        progress_key = "sent" if status == "sent" else "skipped" if status == "skipped" else "review" if status == "review_required" else "failed"
        await db.family_access_campaigns.update_one({"id": campaign_id}, {"$inc": {
            "progress.completed": 1, f"progress.{progress_key}": 1,
        }, "$set": {"status": "running", "started_at": job.get("started_at") or now_iso(), "updated_at": now_iso()}})
        remaining = await db.family_access_jobs.count_documents({"campaign_id": campaign_id, "status": {"$in": ["queued", "claimed", "retry_wait", "sending"]}})
        if remaining == 0:
            reviews = await db.family_access_jobs.count_documents({"campaign_id": campaign_id, "status": "review_required"})
            await db.family_access_campaigns.update_one({"id": campaign_id}, {"$set": {
                "status": "completed_with_review" if reviews else "completed", "completed_at": now_iso(), "updated_at": now_iso(),
            }})


async def manual_invitation(
    db: Any, family: Mapping[str, Any], slot: int, actor: Mapping[str, Any], secret: str,
    password_hasher: Callable[[str], str], dispatcher: Callable[..., Mapping[str, Any]],
    public_app_url: str, *, resend: bool = False, allow_delivery: bool = False,
) -> dict[str, Any]:
    decision = (await decisions_for_family(db, family))[slot - 1]
    if resend and decision["state"] != "pending_activation":
        raise RuntimeError("No existe una invitación pendiente que reenviar")
    if not resend and decision["state"] not in {"eligible", "invitation_expired"}:
        raise RuntimeError("El acceso no admite generar una invitación")
    if not allow_delivery or os.environ.get("FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED") != "1":
        raise RuntimeError("La entrega de accesos familiares está desactivada")
    user = await prepare_account(db, family, decision, password_hasher) if not decision.get("user_id") else await db.users.find_one({"id": decision["user_id"]}, {"_id": 0})
    plain, record = issue_token(secret, ttl_minutes=0, ttl_hours=INVITATION_TTL_HOURS)
    history = [item for item in [*(user.get("invitation_history") or []), user.get("invitation")] if token_is_usable(item)][-3:]
    await db.users.update_one({"id": user["id"], "active": {"$ne": True}}, {"$set": {
        "invitation": record, "invitation_history": history, "account_status": "pending_activation", "active": False,
    }})
    delivery = dispatcher(decision["email"], "Activa tu acceso a Ikas-Txiki",
                          f"Hola,\n\nTu usuario de Ikastxiki es: {user['username']}.",
                          action_url=f"{public_app_url.rstrip('/')}/activar?token={quote(plain, safe='')}",
                          action_label=user["username"], template="account_activation")
    await audit(db, actor, "invitation_sent", family_id=family["id"], slot=slot)
    return {"ok": delivery.get("status") == "sent", "delivery": delivery.get("status"), "expires_at": record["expires_at"]}

