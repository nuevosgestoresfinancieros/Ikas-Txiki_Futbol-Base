from copy import deepcopy

from import_staging_service import (
    draft_summary, effective_records, modality_suggestion, prepare_records, public_draft,
    team_capacities,
)


SECRET = "phase9-fictitious-only-secret-000000000000"


def fictitious(index=1, **changes):
    value = {
        "_row": index + 1, "external_id": f"TEST-{index:03d}", "nombre": f"Ficticio{index}",
        "apellidos": "Prueba", "fecha_nacimiento": "2015-01-01", "tipo": "renovacion",
        "equipo": "Equipo Ficticio", "categoria": "Alevín", "modalidad": "F7",
        "progenitor1_telefono": "600000000", "email_formulario": "familia@example.invalid",
        "equipamiento_items": ["Jugador"], "iban": "",
    }
    value.update(changes)
    return value


def make_draft(rows):
    records, duplicates, incidents = prepare_records(rows, SECRET)
    return {"records": records, "duplicates": duplicates, "incidents": incidents}


def test_incomplete_draft_is_isolated_and_bank_never_public():
    draft = make_draft([fictitious(equipo="", modalidad="", iban="12345678901234567890")])
    summary = draft_summary(draft)
    assert summary["missing_team"] == 1 and summary["missing_modality"] == 1
    assert summary["can_import"] is False
    assert draft["records"][0]["bank"]["iban_encrypted"] is None
    exposed = public_draft({"id": "d", "status": "draft", **draft})
    assert "12345678901234567890" not in str(exposed)
    assert exposed["records"][0]["bank_status"] == "pending"


def test_modality_is_only_a_suggestion_until_confirmed():
    draft = make_draft([fictitious(modalidad="", categoria="Alevín")])
    record = draft["records"][0]
    assert modality_suggestion("Alevín") == "F7"
    assert record["modality_suggestion"] == "F7"
    assert record["modalidad"] == "" and record["suggestion_confirmed"] is False


def test_duplicate_decisions_and_double_equipment_are_explicit():
    first = fictitious(external_id="SAME", equipamiento_items=["Jugador"])
    second = fictitious(2, external_id="SAME", equipamiento_items=["Portero"])
    draft = make_draft([first, second])
    assert draft_summary(draft)["duplicates_pending"] == 1
    draft["duplicates"][0]["decision"] = "merge"
    effective = effective_records(draft)
    assert len(effective) == 1
    assert effective[0]["equipamiento_items"] == ["Jugador", "Portero"]


def test_all_duplicate_decisions_have_deterministic_results():
    source = [fictitious(external_id="SAME"), fictitious(2, external_id="SAME", nombre="Otra")]
    for decision, expected in (("keep_first", 1), ("keep_second", 1), ("merge", 1), ("different_people", 2)):
        draft = make_draft(source)
        draft["duplicates"][0]["decision"] = decision
        effective = effective_records(draft)
        assert len(effective) == expected
        if decision == "different_people":
            assert all(row.get("identity_override") for row in effective)


def test_exactly_54_october_and_team_capacity():
    draft = make_draft([fictitious(index) for index in range(1, 56)])
    for record in draft["records"][:54]:
        record["selected_october"] = True
    for incident in draft["incidents"]:
        if incident["field"] == "bank":
            incident["resolution"] = "not_applicable"
    summary = draft_summary(draft)
    assert summary["october_selected"] == 54
    assert summary["teams_over_capacity"] == 1
    assert team_capacities(draft["records"])[0] == {
        "team": "Equipo Ficticio", "modality": "F7", "count": 55, "limit": 18, "over_capacity": True,
    }
    f11 = team_capacities([fictitious(index, equipo="F11 Ficticio", modalidad="F11") for index in range(26)])
    assert f11[0]["count"] == 26 and f11[0]["limit"] == 25 and f11[0]["over_capacity"] is True


def test_save_and_continue_keeps_decisions_and_audit_without_personal_values():
    draft = make_draft([fictitious()])
    saved = deepcopy(draft)
    saved["records"][0]["equipo"] = "Equipo Revisado"
    saved["audit"] = [{"actor_user_id": "admin-test", "action": "record_updated", "detail": {"field": "equipo"}}]
    assert saved["records"][0]["equipo"] == "Equipo Revisado"
    assert "Ficticio1" not in str(saved["audit"])
