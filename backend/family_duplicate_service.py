"""Detección y consolidación explícita, reversible y sin secretos de familias."""
from __future__ import annotations

import hashlib
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Mapping
from uuid import uuid4


FAMILY_FIELDS = (
    "progenitor1_nombre", "progenitor1_telefono", "progenitor1_email",
    "progenitor2_nombre", "progenitor2_telefono", "progenitor2_email",
    "domicilio", "contacto_principal", "preferencia_comunicacion", "observaciones",
    "progenitor1_crear_acceso", "progenitor1_email_confirmado",
    "progenitor2_crear_acceso", "progenitor2_email_confirmado",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize(value: Any) -> str:
    value = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", value)


def phone(value: Any) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def values(family: Mapping[str, Any], suffix: str) -> set[str]:
    result = set()
    for parent in ("progenitor1", "progenitor2"):
        key = f"{parent}_{suffix}"
        value = phone(family.get(key)) if suffix == "telefono" else normalize(family.get(key))
        if value:
            result.add(value)
    return result


def name_tokens(value: Any) -> tuple[str, ...]:
    """Normaliza un nombre conservando sus partes para distinguir nombre y apellidos."""
    value = unicodedata.normalize("NFKD", str(value or "").strip().lower())
    value = "".join(c for c in value if not unicodedata.combining(c))
    return tuple(part for part in re.split(r"[^a-z0-9]+", value) if part)


def complete_parent_name(family: Mapping[str, Any], parent: str) -> str:
    """Nombre completo de un progenitor, o vacío si es sólo nombre de pila."""
    parts = name_tokens(family.get(f"{parent}_nombre"))
    return "".join(parts) if len(parts) >= 2 else ""


def parent_surname(family: Mapping[str, Any], parent: str) -> str:
    """Apellidos de un progenitor, manteniendo la posición del progenitor."""
    parts = name_tokens(family.get(f"{parent}_nombre"))
    return "".join(parts[1:]) if len(parts) >= 2 else ""


def active(family: Mapping[str, Any]) -> bool:
    return not family.get("merged_into")


def reasons(left: Mapping[str, Any], right: Mapping[str, Any]) -> tuple[str, list[str]] | None:
    left_p1, left_p2 = complete_parent_name(left, "progenitor1"), complete_parent_name(left, "progenitor2")
    right_p1, right_p2 = complete_parent_name(right, "progenitor1"), complete_parent_name(right, "progenitor2")
    # Excluye nombres intercambiados y coincidencias de nombre de pila.
    if left_p1 and left_p2 and left_p1 == right_p1 and left_p2 == right_p2:
        return "high", ["Coinciden ambos progenitores tras normalización"]
    matching_contacts = values(left, "email").intersection(values(right, "email"))
    matching_contacts |= values(left, "telefono").intersection(values(right, "telefono"))
    if matching_contacts and ((left_p1 and left_p1 == right_p1) or (left_p2 and left_p2 == right_p2)):
        return "high", ["Coinciden correo o teléfono y el nombre completo de un progenitor"]

    same_address = normalize(left.get("domicilio")) and normalize(left.get("domicilio")) == normalize(right.get("domicilio"))
    left_s1, left_s2 = parent_surname(left, "progenitor1"), parent_surname(left, "progenitor2")
    right_s1, right_s2 = parent_surname(right, "progenitor1"), parent_surname(right, "progenitor2")
    if same_address and left_s1 and left_s2 and left_s1 == right_s1 and left_s2 == right_s2:
        return "high", ["Coinciden domicilio y ambos apellidos familiares"]
    return None


def public_family(family: Mapping[str, Any], players: list[dict], users: list[dict]) -> dict:
    fid = str(family.get("id"))
    return {
        "family_id": fid,
        "progenitor1": {"nombre": family.get("progenitor1_nombre"), "correo": family.get("progenitor1_email"), "telefono": family.get("progenitor1_telefono")},
        "progenitor2": {"nombre": family.get("progenitor2_nombre"), "correo": family.get("progenitor2_email"), "telefono": family.get("progenitor2_telefono")},
        "domicilio": family.get("domicilio"), "contacto_principal": family.get("contacto_principal"),
        "preferencia_comunicacion": family.get("preferencia_comunicacion"), "observaciones": family.get("observaciones"),
        "jugadores": [{"id": p.get("id"), "nombre": " ".join(filter(None, [str(p.get("nombre") or "").strip(), str(p.get("apellidos") or "").strip()]))} for p in players if p.get("familia_id") == fid],
        "cuentas": [{"usuario": u.get("username"), "estado": u.get("account_status") or ("active" if u.get("active") else "inactive")} for u in users if u.get("family_id") == fid],
    }


def candidates(families: list[dict], players: list[dict], users: list[dict]) -> list[dict]:
    active_families = [f for f in families if active(f)]
    result = []
    for index, left in enumerate(active_families):
        for right in active_families[index + 1:]:
            detected = reasons(left, right)
            if not detected:
                continue
            confidence, why = detected
            l, r = public_family(left, players, users), public_family(right, players, users)
            # Completitud y vínculos; la fecha/ID hacen el desempate estable.
            def score(item):
                data = sum(bool(normalize(item.get(k))) for k in FAMILY_FIELDS)
                return (data + len(item["jugadores"]) + len(item["cuentas"]), len(item["jugadores"]) + len(item["cuentas"]), item["family_id"])
            primary = max((l, r), key=score)
            result.append({"candidate_id": ":".join(sorted([l["family_id"], r["family_id"]])), "confidence": confidence,
                           "reasons": why, "left": l, "right": r, "proposed_primary_family_id": primary["family_id"],
                           "merge_allowed": confidence == "high"})
    return result


def merge_id(primary_id: str, duplicate_id: str) -> str:
    return hashlib.sha256(f"family-merge:{primary_id}:{duplicate_id}".encode()).hexdigest()


def merged_data(primary: Mapping[str, Any], duplicate: Mapping[str, Any]) -> dict:
    result = {}
    for field in FAMILY_FIELDS:
        result[field] = primary.get(field) if str(primary.get(field) or "").strip() else duplicate.get(field)
    return result


async def merge(db: Any, primary_id: str, duplicate_id: str, actor: Mapping[str, Any], reason: str) -> dict:
    if not primary_id or primary_id == duplicate_id:
        raise ValueError("Selecciona dos familias distintas")
    primary = await db.families.find_one({"id": primary_id}, {"_id": 0})
    duplicate = await db.families.find_one({"id": duplicate_id}, {"_id": 0})
    if not primary or not duplicate:
        raise LookupError("Una de las familias ya no existe")
    if primary.get("merged_into") or (duplicate.get("merged_into") and duplicate.get("merged_into") != primary_id):
        raise RuntimeError("Una de las familias ya está archivada por otra fusión")
    key = merge_id(primary_id, duplicate_id)
    existing = await db.family_merge_history.find_one({"id": key}, {"_id": 0})
    if existing and existing.get("status") == "completed":
        return {"status": "already_merged", "merge_id": key, "primary_family_id": primary_id}
    players = await db.players.find({"familia_id": duplicate_id}, {"_id": 0, "id": 1, "familia_id": 1}).to_list(5000)
    users = await db.users.find({"role": "family", "family_id": duplicate_id}, {"_id": 0, "id": 1, "family_id": 1}).to_list(5000)
    before = {"primary": {k: primary.get(k) for k in FAMILY_FIELDS}, "duplicate": {k: duplicate.get(k) for k in FAMILY_FIELDS},
              "players": players, "users": users}
    moment = now_iso()
    await db.family_merge_history.update_one({"id": key}, {"$setOnInsert": {"id": key, "status": "started", "before": before,
        "primary_family_id": primary_id, "duplicate_family_id": duplicate_id, "created_at": moment}}, upsert=True)
    await db.families.update_one({"id": primary_id, "merged_into": {"$exists": False}}, {"$set": {**merged_data(primary, duplicate), "updated_at": moment}})
    await db.players.update_many({"familia_id": duplicate_id}, {"$set": {"familia_id": primary_id, "updated_at": moment}})
    await db.users.update_many({"role": "family", "family_id": duplicate_id}, {"$set": {"family_id": primary_id, "updated_at": moment}})
    await db.families.update_one({"id": duplicate_id, "merged_into": {"$exists": False}}, {"$set": {"merged_into": primary_id, "merged_at": moment,
        "merged_by_user_id": actor.get("id"), "merged_reason": reason, "updated_at": moment}})
    after = {"primary_family_id": primary_id, "duplicate_family_id": duplicate_id, "moved_player_ids": [p.get("id") for p in players], "moved_user_ids": [u.get("id") for u in users]}
    await db.family_merge_history.update_one({"id": key}, {"$set": {"status": "completed", "after": after, "completed_at": moment, "actor_user_id": actor.get("id"), "reason": reason}})
    await db.internal_events.insert_one({"id": str(uuid4()), "type": "family_merge.completed", "actor_user_id": actor.get("id"), "actor_role": actor.get("role"),
        "detail": {"merge_id": key, "primary_family_id": primary_id, "duplicate_family_id": duplicate_id, "player_count": len(players), "family_account_count": len(users), "reason": reason, "sensitive_values_recorded": False}, "created_at": moment})
    return {"status": "merged", "merge_id": key, **after}


async def revert(db: Any, key: str, actor: Mapping[str, Any]) -> dict:
    record = await db.family_merge_history.find_one({"id": key, "status": "completed"}, {"_id": 0})
    if not record:
        raise LookupError("La fusión no existe o no puede revertirse")
    before, primary_id, duplicate_id = record["before"], record["primary_family_id"], record["duplicate_family_id"]
    duplicate = await db.families.find_one({"id": duplicate_id, "merged_into": primary_id}, {"_id": 0, "id": 1})
    if not duplicate:
        raise RuntimeError("La ficha ya no está en el estado esperado para revertir")
    moment = now_iso()
    await db.families.update_one({"id": primary_id}, {"$set": {**before["primary"], "updated_at": moment}})
    await db.families.update_one({"id": duplicate_id}, {"$set": {**before["duplicate"], "updated_at": moment}, "$unset": {"merged_into": "", "merged_at": "", "merged_by_user_id": "", "merged_reason": ""}})
    for row in before["players"]:
        await db.players.update_one({"id": row["id"], "familia_id": primary_id}, {"$set": {"familia_id": duplicate_id, "updated_at": moment}})
    for row in before["users"]:
        await db.users.update_one({"id": row["id"], "role": "family", "family_id": primary_id}, {"$set": {"family_id": duplicate_id, "updated_at": moment}})
    await db.family_merge_history.update_one({"id": key}, {"$set": {"status": "reverted", "reverted_at": moment, "reverted_by_user_id": actor.get("id")}})
    await db.internal_events.insert_one({"id": str(uuid4()), "type": "family_merge.reverted", "actor_user_id": actor.get("id"), "actor_role": actor.get("role"), "detail": {"merge_id": key, "primary_family_id": primary_id, "duplicate_family_id": duplicate_id, "sensitive_values_recorded": False}, "created_at": moment})
    return {"status": "reverted", "merge_id": key, "primary_family_id": primary_id, "duplicate_family_id": duplicate_id}
