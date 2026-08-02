"""Safety boundaries for finalizing a historical staging draft."""

from inscription_import_service import analyze_rows
from server import _build_import_operations, _historical_enrichment_operations


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


def test_compact_history_enriches_only_unique_existing_player_and_protects_bank():
    draft = {
        "season": "2026-2027", "duplicates": [], "fuzzy_matches": [],
        "records": [{
            "id": "row-1", "source_row": 2, "nombre": "Álex", "apellidos": "De la Fuente",
            "excluded": False, "historical": {
                "equipment_current": {"number": "9", "shirt_size": "M"},
                "equipment_history": {"2025-2026": ["ALEX", "7", "S"]},
                "team_history": {"2025-2026": ["Cadete A"]},
                "federation_history": {"2025-2026": ["SI"]},
                "sport": {"position": "PORTERO"}, "schedule_history": ["L", "X"],
                "fees": {"due": 100, "confirmed_debt": False},
                "consents": {"images": "yes", "signed": False},
                "bank_reference": {"holder": "Persona Tutora"},
            },
            "bank": {"status": "valid", "iban_encrypted": "ciphertext", "iban_last4": "1332"},
        }],
    }
    existing = {"players": [{"id": "p1", "nombre": "Alex", "apellidos": "de la Fuente"}],
                "payments": [], "families": [], "teams": [], "inscriptions": []}
    operations, summary = _historical_enrichment_operations(draft, existing, "job-1")
    assert summary == {"matched_players": 1, "unmatched_rows": 0, "ambiguous_rows": 0,
                       "bank_references": 1, "created_players": 0, "official_debts": 0}
    player = next(op["after"] for op in operations if op["collection"] == "players")
    payment = next(op["after"] for op in operations if op["collection"] == "payments")
    assert player["segunda_equipacion"]["number"] == "9"
    assert player["posicion"] == "PORTERO"
    assert payment["iban_encrypted"] == "ciphertext"
    assert payment["importe_final"] == 0 and payment["confirmed_debt"] is False
    assert "ES91" not in str(operations)


def test_compact_history_never_creates_or_updates_ambiguous_players():
    draft = {"season": "2026-2027", "duplicates": [], "fuzzy_matches": [], "records": [
        {"id": "row-1", "nombre": "Mismo", "apellidos": "Nombre", "historical": {}, "bank": {}}
    ]}
    existing = {"players": [
        {"id": "p1", "nombre": "Mismo", "apellidos": "Nombre"},
        {"id": "p2", "nombre": "Mismo", "apellidos": "Nombre"},
    ], "payments": []}
    operations, summary = _historical_enrichment_operations(draft, existing, "job-1")
    assert operations == []
    assert summary["ambiguous_rows"] == 1
    assert summary["created_players"] == 0
