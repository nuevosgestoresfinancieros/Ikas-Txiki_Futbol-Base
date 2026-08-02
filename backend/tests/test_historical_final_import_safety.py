"""Safety boundaries for finalizing a historical staging draft."""

from inscription_import_service import analyze_rows
from server import _build_import_operations


def record(**changes):
    value = {
        "_row": 2, "external_id": "HIST-001", "nombre": "Persona", "apellidos": "Ficticia",
        "fecha_nacimiento": "2015-01-01", "tipo": "alta", "categoria": "Alevín",
        "modalidad": "F7", "equipo": "Nombre histórico", "iban": "",
        "progenitor1_email": "familia@example.invalid",
    }
    value.update(changes)
    return value


def test_historical_team_name_is_a_suggestion_not_an_official_assignment():
    existing = {"players": [], "families": [], "inscriptions": [], "payments": [], "teams": [
        {"id": "official-team", "nombre": "Nombre histórico", "categoria": "Infantil", "modalidad": "F11"},
    ]}
    analysis = analyze_rows(
        [record()], "2026-2027", existing, "test", allow_pending_team=True,
        allow_pending_contact=True, ignore_team_name_suggestions=True,
    )
    assert analysis["summary"]["conflict"] == 0
    assert analysis["summary"]["create"] == 1


def test_regular_import_still_rejects_team_name_with_incompatible_category():
    existing = {"players": [], "families": [], "inscriptions": [], "payments": [], "teams": [
        {"id": "official-team", "nombre": "Nombre histórico", "categoria": "Infantil", "modalidad": "F11"},
    ]}
    analysis = analyze_rows([record()], "2026-2027", existing, "test")
    assert analysis["summary"]["conflict"] == 1


def test_historical_operations_keep_team_pending_and_never_create_payments():
    existing = {"players": [], "families": [], "inscriptions": [], "payments": [], "teams": []}
    source = record(equipo="", iban="ES9121000418450200051332")
    analysis = analyze_rows(
        [source], "2026-2027", existing, "test", allow_pending_team=True,
        allow_pending_contact=True, ignore_team_name_suggestions=True,
    )
    operations = _build_import_operations(
        analysis, existing, "job-test", {}, allow_pending_team=True,
        keep_family_candidates_separate=True, skip_payments=True,
    )
    assert {operation["collection"] for operation in operations} == {"families", "players", "inscriptions"}
    player = next(item["after"] for item in operations if item["collection"] == "players")
    inscription = next(item["after"] for item in operations if item["collection"] == "inscriptions")
    assert player["equipo_id"] is None
    assert inscription["equipo_id"] is None
