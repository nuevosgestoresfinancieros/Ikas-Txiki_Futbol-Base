"""Preparación temporal, auditable y aislada de importaciones de inscripciones."""
from __future__ import annotations

import re
import uuid
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Mapping

from inscription_import_service import (
    encrypt_iban, identity_key, normalize_key, normalize_iban, valid_iban,
)


MODALITY_SUGGESTIONS = {
    "chupetin": "F7", "querubin": "F7", "prebenjamin": "F7", "benjamin": "F7", "alevin": "F7",
    "infantil": "F11", "cadete": "F11", "juvenil": "F11",
}
ALLOWED_RECORD_FIELDS = {
    "nombre", "apellidos", "fecha_nacimiento", "tipo", "email_formulario", "centro_escolar",
    "progenitor1_nombre", "progenitor1_telefono", "progenitor1_email", "progenitor2_nombre",
    "progenitor2_telefono", "progenitor2_email", "domicilio", "equipo_anterior", "equipo", "categoria",
    "modalidad", "talla_camiseta", "talla_pantalon", "talla_chandal", "talla_medias",
    "talla_calzado", "observaciones", "equipamiento_items",
}
ISSUE_FIELDS = {
    "nombre", "apellidos", "fecha_nacimiento", "equipo", "categoria", "modalidad",
    "email_formulario", "progenitor1_email", "progenitor2_email", "progenitor1_telefono",
    "progenitor2_telefono", "talla_camiseta", "talla_pantalon", "talla_chandal",
    "talla_medias", "talla_calzado",
}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^\d{9,15}$")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def record_id() -> str:
    return str(uuid.uuid4())


def audit_event(actor_id: str | None, action: str, detail: Mapping[str, Any] | None = None) -> dict:
    return {
        "at": utc_now(), "actor_user_id": actor_id, "action": action,
        "detail": {key: value for key, value in (detail or {}).items() if key not in {"iban", "value"}},
    }


def modality_suggestion(category: Any) -> str | None:
    key = normalize_key(category)
    if key in MODALITY_SUGGESTIONS:
        return MODALITY_SUGGESTIONS[key]
    # Las categorías femeninas y variantes nominales solo producen sugerencias.
    return next((mode for base, mode in MODALITY_SUGGESTIONS.items() if base in key.split("_")), None)


def historical_readiness(draft: Mapping[str, Any]) -> tuple[dict, dict]:
    """Apply only deterministic, non-sensitive rules to a historical draft.

    The historical workbook has no explicit modality column.  Category is the
    club-approved source for F7/F11, including normalized feminine labels.  A
    missing team, an invalid email, and a possible family relationship remain
    visible warnings: none of them is a reason to prevent creating the initial
    player/family/registration base.  Fuzzy identity matches are deliberately
    left unresolved and continue to block final confirmation.

    The function is pure so it can be tested before its result is persisted by
    the authenticated endpoint.
    """
    if draft.get("source_format") != "historical_bbdd_v1":
        raise ValueError("El borrador no utiliza el formato histórico")
    updated = deepcopy(dict(draft))
    modality_assigned = team_pending = email_pending = 0
    for record in updated.get("records", []):
        suggested = modality_suggestion(record.get("categoria"))
        if record.get("modalidad") not in {"F7", "F11"} and suggested:
            record["modality_suggestion"] = suggested
            record["modalidad"] = suggested
            record["suggestion_confirmed"] = True
            record["automatic_modality_rule"] = {
                "rule": "category_modality_v1", "source": "categoria", "value": suggested,
            }
            modality_assigned += 1
        if not str(record.get("equipo") or "").strip() and not record.get("equipo_id"):
            record["team_assignment_status"] = "pending"
            team_pending += 1
        elif not record.get("equipo_id"):
            # Historical text stays as a suggestion only; it never becomes an
            # official team identifier without a separate administrator choice.
            record["team_assignment_status"] = "historical_suggestion"
        invalid_email_fields = [
            field for field in ("email_formulario", "progenitor1_email", "progenitor2_email")
            if record.get(field) and not EMAIL_RE.fullmatch(str(record[field]))
        ]
        if invalid_email_fields:
            record["contact_data_status"] = "pending_review"
            record["invalid_email_fields"] = invalid_email_fields
            email_pending += len(invalid_email_fields)

    for incident in updated.get("incidents", []):
        if incident.get("field") == "modalidad" and incident.get("code") in {"missing", "invalid"}:
            incident["blocking"] = False
            incident["resolution"] = "corrected"
            incident["automatic_rule"] = "category_modality_v1"
        elif incident.get("field") == "equipo" and incident.get("code") == "missing":
            incident["blocking"] = False
            incident["classification"] = "team_pending"
        elif incident.get("field") in {"email_formulario", "progenitor1_email", "progenitor2_email"}:
            incident["blocking"] = False
            incident["classification"] = "contact_pending"

    updated["historical_readiness"] = {
        "version": 1,
        "modality_rule": "category_modality_v1",
        "modality_assigned": modality_assigned,
        "team_pending": team_pending,
        "email_cells_pending": email_pending,
    }
    return updated, dict(updated["historical_readiness"])


def _bank_payload(value: Any, secret: str) -> dict:
    iban = normalize_iban(value)
    if not iban:
        return {"status": "pending", "iban_encrypted": None, "iban_last4": None}
    if not valid_iban(iban):
        return {"status": "pending", "iban_encrypted": None, "iban_last4": None}
    return {"status": "valid", **encrypt_iban(iban, secret)}


def prepare_records(rows: list[dict], secret: str) -> tuple[list[dict], list[dict], list[dict]]:
    """Retira datos bancarios en claro y genera incidencias y duplicados editables."""
    records: list[dict] = []
    by_identity: dict[str, list[str]] = {}
    for source in rows:
        rid = source.get("_staging_id") or record_id()
        record = {key: source.get(key) for key in ALLOWED_RECORD_FIELDS if key in source}
        bank = _bank_payload(source.get("iban"), secret)
        if source.get("_bank_issue"):
            bank = {"status": "pending", "iban_encrypted": None, "iban_last4": None}
        record.update({
            "id": rid, "source_row": source.get("_row"), "selected_october": False,
            "excluded": False, "issue_resolutions": {}, "bank": bank,
            "modality_suggestion": modality_suggestion(source.get("categoria")),
            "suggestion_confirmed": False,
        })
        records.append(record)
        by_identity.setdefault(identity_key(source), []).append(rid)

    duplicates = [
        {"id": record_id(), "record_ids": ids, "decision": None}
        for ids in by_identity.values() if len(ids) > 1
    ]
    incidents: list[dict] = []
    for record in records:
        for field in ("nombre", "apellidos", "fecha_nacimiento", "equipo", "categoria", "modalidad"):
            if not record.get(field):
                incidents.append(_issue(record, field, "missing", True))
        if record.get("modalidad") and record["modalidad"] not in {"F7", "F11"}:
            incidents.append(_issue(record, "modalidad", "invalid", True))
        for field in ("email_formulario", "progenitor1_email", "progenitor2_email"):
            if record.get(field) and not EMAIL_RE.fullmatch(str(record[field])):
                incidents.append(_issue(record, field, "invalid", True))
        for field in ("progenitor1_telefono", "progenitor2_telefono"):
            if record.get(field) and not PHONE_RE.fullmatch(str(record[field])):
                incidents.append(_issue(record, field, "invalid", False))
        if record["bank"]["status"] != "valid":
            incidents.append(_issue(record, "bank", "bank_pending", False))
    return records, duplicates, incidents


def _issue(record: Mapping[str, Any], field: str, code: str, blocking: bool) -> dict:
    return {
        "id": record_id(), "record_id": record["id"], "source_row": record.get("source_row"),
        "field": field, "code": code, "blocking": blocking, "resolution": "pending",
    }


def field_is_valid(record: Mapping[str, Any], field: str) -> bool:
    value = record.get(field)
    if field in {"nombre", "apellidos", "fecha_nacimiento", "equipo", "categoria", "modalidad"} and not value:
        return False
    if field == "fecha_nacimiento":
        try:
            datetime.fromisoformat(str(value))
        except ValueError:
            return False
    if field == "modalidad":
        return value in {"F7", "F11"}
    if field in {"email_formulario", "progenitor1_email", "progenitor2_email"}:
        return not value or bool(EMAIL_RE.fullmatch(str(value)))
    if field in {"progenitor1_telefono", "progenitor2_telefono"}:
        return not value or bool(PHONE_RE.fullmatch(str(value)))
    if field == "bank":
        return (record.get("bank") or {}).get("status") == "valid"
    return True


def effective_records(draft: Mapping[str, Any]) -> list[dict]:
    records = {row["id"]: dict(row) for row in draft.get("records", [])}
    for group in draft.get("duplicates", []):
        ids = group.get("record_ids") or []
        decision = group.get("decision")
        if decision == "keep_first":
            for rid in ids[1:]:
                records[rid]["excluded"] = True
        elif decision == "keep_second":
            for rid in ids[:1] + ids[2:]:
                records[rid]["excluded"] = True
        elif decision == "merge" and ids:
            target = records[ids[0]]
            equipment = list(target.get("equipamiento_items") or [])
            for rid in ids[1:]:
                source = records[rid]
                for field in ALLOWED_RECORD_FIELDS:
                    if target.get(field) in (None, "", []) and source.get(field) not in (None, "", []):
                        target[field] = source[field]
                for item in source.get("equipamiento_items") or []:
                    if item.casefold() not in {value.casefold() for value in equipment}:
                        equipment.append(item)
                source["excluded"] = True
            target["equipamiento_items"] = equipment
        elif decision == "different_people":
            for index, rid in enumerate(ids):
                records[rid]["identity_override"] = f"{identity_key(records[rid])}:reviewed:{index + 1}"
    # Fuzzy identity groups are never merged automatically.  When an
    # administrator explicitly chooses "same person", retain the first record
    # and conservatively fill only missing allowed values from the other one.
    for group in draft.get("fuzzy_matches", []):
        ids = [rid for rid in (group.get("record_ids") or []) if rid in records]
        if group.get("decision") == "same_person" and ids:
            target = records[ids[0]]
            equipment = list(target.get("equipamiento_items") or [])
            for rid in ids[1:]:
                source = records[rid]
                for field in ALLOWED_RECORD_FIELDS:
                    if target.get(field) in (None, "", []) and source.get(field) not in (None, "", []):
                        target[field] = source[field]
                for item in source.get("equipamiento_items") or []:
                    if item.casefold() not in {value.casefold() for value in equipment}:
                        equipment.append(item)
                source["excluded"] = True
            target["equipamiento_items"] = equipment
        elif group.get("decision") == "different_people":
            for index, rid in enumerate(ids):
                records[rid]["identity_override"] = f"{identity_key(records[rid])}:fuzzy-reviewed:{index + 1}"
    return [row for row in records.values() if not row.get("excluded")]


def draft_summary(draft: Mapping[str, Any]) -> dict:
    active = effective_records(draft)
    active_ids = {row["id"] for row in active}
    unresolved_duplicates = sum(1 for item in draft.get("duplicates", []) if not item.get("decision"))
    predicted_duplicates = sum(
        max(0, len(item.get("record_ids") or []) - 1)
        for item in draft.get("duplicates", []) if item.get("decision") != "different_people"
    )
    pending_incidents = [
        item for item in draft.get("incidents", [])
        if item.get("resolution") == "pending" and item.get("record_id") in active_ids
    ]
    blocking_incidents = [item for item in pending_incidents if item.get("blocking")]
    missing_team = sum(1 for row in active if not row.get("equipo"))
    missing_category = sum(1 for row in active if not row.get("categoria"))
    missing_modality = sum(1 for row in active if row.get("modalidad") not in {"F7", "F11"})
    october = sum(1 for row in active if row.get("selected_october"))
    capacities = team_capacities(active)
    capacity_over = sum(1 for item in capacities if item["over_capacity"])
    historical = draft.get("source_format") == "historical_bbdd_v1"
    pending_fuzzy = sum(
        1 for item in draft.get("fuzzy_matches", [])
        if item.get("decision") in {None, "", "leave_pending"}
    )
    pending_families = sum(1 for item in draft.get("family_candidates", []) if not item.get("decision"))
    october_blocker = 0 if historical else (1 if october != 54 else 0)
    # A historical import deliberately starts with incomplete sports/contact
    # data.  Only a potential identity merge can put two people at risk; team,
    # contact and family suggestions are follow-up work, not import blockers.
    if historical:
        blocking_incidents = [item for item in blocking_incidents if item.get("field") not in {
            "equipo", "modalidad", "email_formulario", "progenitor1_email", "progenitor2_email",
        }]
        blockers = unresolved_duplicates + pending_fuzzy + len(blocking_incidents)
    else:
        blockers = unresolved_duplicates + pending_fuzzy + pending_families + len(blocking_incidents) + october_blocker
    team_pending = sum(1 for row in active if row.get("team_assignment_status") == "pending")
    email_pending_cells = sum(
        1 for item in pending_incidents
        if item.get("field") in {"email_formulario", "progenitor1_email", "progenitor2_email"}
    )
    email_pending_records = len({
        item.get("record_id") for item in pending_incidents
        if item.get("field") in {"email_formulario", "progenitor1_email", "progenitor2_email"}
    })
    fuzzy_record_ids = {
        record_id for item in draft.get("fuzzy_matches", [])
        if item.get("decision") in {None, "", "leave_pending"}
        for record_id in (item.get("record_ids") or [])
    }
    complete_steps = sum((
        unresolved_duplicates == 0, len(blocking_incidents) == 0, missing_team == 0,
        missing_modality == 0, (True if historical else october == 54), capacity_over == 0,
    ))
    return {
        "rows_received": len(draft.get("records", [])),
        "unique_expected": len(active) - (predicted_duplicates if unresolved_duplicates else 0),
        "duplicates_pending": unresolved_duplicates, "missing_team": missing_team,
        "missing_category": missing_category,
        "missing_modality": missing_modality, "incidents_pending": len(pending_incidents),
        "october_selected": october, "october_required": 0 if historical else 54, "teams_over_capacity": capacity_over,
        "preparation_percent": round(complete_steps / 6 * 100), "blocking_count": blockers,
        "can_import": blockers == 0, "simulation_only": False,
        "fuzzy_matches_pending": pending_fuzzy, "family_candidates_pending": pending_families,
        "importable_now": max(0, len(active) - len(fuzzy_record_ids)),
        "importable_with_team_pending": team_pending,
        "importable_with_email_pending": email_pending_records,
        "email_cells_pending": email_pending_cells,
        "families_suggested_for_review": pending_families,
        "blocked_fuzzy_groups": pending_fuzzy,
        "blocked_fuzzy_records": len(fuzzy_record_ids),
        "auxiliary_rows_excluded": len(draft.get("auxiliary_rows", [])), "capacities": capacities,
    }


def team_capacities(records: Iterable[Mapping[str, Any]]) -> list[dict]:
    counts: dict[tuple[str, str], int] = {}
    for row in records:
        team, modality = str(row.get("equipo") or "").strip(), str(row.get("modalidad") or "").upper()
        if team and modality in {"F7", "F11"}:
            counts[(team, modality)] = counts.get((team, modality), 0) + 1
    result = []
    for (team, modality), count in sorted(counts.items()):
        limit = 18 if modality == "F7" else 25
        result.append({"team": team, "modality": modality, "count": count, "limit": limit,
                       "over_capacity": count > limit})
    return result


def public_draft(draft: Mapping[str, Any], include_records: bool = True) -> dict:
    result = {key: draft.get(key) for key in (
        "id", "season", "status", "source_format", "created_at", "updated_at", "expires_at", "source_sha256",
    )}
    result["summary"] = draft_summary(draft)
    if draft.get("source_format") == "historical_bbdd_v1":
        result["quality"] = draft.get("quality", {})
        result["simulation"] = draft.get("simulation", {})
        result["historical_readiness"] = draft.get("historical_readiness", {})
    if include_records:
        active_ids = {row["id"] for row in effective_records(draft)}
        pending_incident_ids = {
            item.get("record_id") for item in draft.get("incidents", [])
            if item.get("resolution") == "pending"
        }
        result["records"] = []
        for row in draft.get("records", []):
            clean = {key: value for key, value in row.items() if key not in {"bank", "historical"}}
            if draft.get("source_format") == "historical_bbdd_v1":
                for field in ("progenitor1_telefono", "progenitor2_telefono", "progenitor1_email", "progenitor2_email", "domicilio"):
                    if clean.get(field):
                        clean[field] = "••••"
                historical = row.get("historical") or {}
                clean["historical_summary"] = {
                    "team_seasons": len(historical.get("team_history") or {}),
                    "equipment_seasons": len(historical.get("equipment_history") or {}),
                    "federation_seasons": len(historical.get("federation_history") or {}),
                    "sensitive_notes_quarantined": bool((historical.get("sensitive_quarantine") or {}).get("other_notes_present")),
                }
            clean["active"] = row.get("id") in active_ids
            clean["october_eligible"] = row.get("tipo") == "renovacion"
            clean["has_pending_incidents"] = row.get("id") in pending_incident_ids
            bank = row.get("bank") or {}
            clean["bank_status"] = bank.get("status", "pending")
            clean["iban_masked"] = (
                f"ES•• •••• •••• •••• •••• {bank.get('iban_last4')}"
                if bank.get("iban_last4") else None
            )
            result["records"].append(clean)
        result["duplicates"] = draft.get("duplicates", [])
        result["fuzzy_matches"] = draft.get("fuzzy_matches", [])
        result["family_candidates"] = draft.get("family_candidates", [])
        result["incidents"] = draft.get("incidents", [])
        result["audit"] = draft.get("audit", [])
    return result


def expiry(hours: int) -> datetime:
    return utc_now() + timedelta(hours=max(1, hours))
