"""Safety boundaries for finalizing a historical staging draft."""

from inscription_import_service import analyze_rows
from server import _build_import_operations, _historical_enrichment_operations, _operations_snapshot


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
    draft["records"][0]["equipo"] = "Cadete A"
    existing = {"players": [{"id": "p1", "nombre": "Alex", "apellidos": "de la Fuente"}],
                "payments": [], "families": [], "teams": [{"id": "t1", "nombre": "Cadete A"}], "inscriptions": []}
    operations, summary = _historical_enrichment_operations(draft, existing, "job-1")
    assert summary == {"matched_players": 1, "unmatched_rows": 0, "ambiguous_rows": 0,
                       "bank_references": 1, "team_assignments": 1, "teams_created": 0, "team_names_pending": 0,
                       "created_players": 0, "official_debts": 0}
    player = next(op["after"] for op in operations if op["collection"] == "players")
    payment = next(op["after"] for op in operations if op["collection"] == "payments")
    assert player["segunda_equipacion"]["number"] == "9"
    assert player["posicion"] == "PORTERO"
    assert player["equipo_id"] == "t1"
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
    ], "payments": [], "teams": []}
    operations, summary = _historical_enrichment_operations(draft, existing, "job-1")
    assert operations == []
    assert summary["ambiguous_rows"] == 1
    assert summary["created_players"] == 0


def test_historical_enrichment_creates_missing_real_team_and_assigns_player():
    draft = {"season": "2026-2027", "duplicates": [], "fuzzy_matches": [], "records": [{
        "id": "r1", "nombre": "Ane", "apellidos": "Ficticia", "equipo": "Anboto",
        "categoria": "Alevín", "modalidad": "F7", "historical": {
            "sport": {"team_assignment_source": "2025-2026"}
        }, "bank": {},
    }]}
    existing = {"players": [{"id": "p1", "nombre": "Ane", "apellidos": "Ficticia"}],
                "teams": [], "payments": []}
    operations, summary = _historical_enrichment_operations(draft, existing, "job-team")
    team_op = next(op for op in operations if op["collection"] == "teams")
    player_op = next(op for op in operations if op["collection"] == "players")
    assert team_op["after"]["nombre"] == "Anboto"
    assert team_op["after"]["temporada"] == "2025-2026"
    assert player_op["after"]["equipo_id"] == team_op["id"]
    assert summary["teams_created"] == 1 and summary["team_assignments"] == 1


def test_historical_enrichment_never_assigns_existing_no_aplica_team():
    draft = {"season": "2026-2027", "duplicates": [], "fuzzy_matches": [], "records": [{
        "id": "r1", "nombre": "Ane", "apellidos": "Ficticia", "equipo": "NO APLICA",
        "historical": {}, "bank": {},
    }]}
    existing = {
        "players": [{"id": "p1", "nombre": "Ane", "apellidos": "Ficticia", "equipo_id": "legacy-team"}],
        "teams": [{"id": "legacy-team", "nombre": "NO APLICA"}], "payments": [],
    }
    operations, summary = _historical_enrichment_operations(draft, existing, "job-no-team")
    player_op = next(op for op in operations if op["collection"] == "players")
    assert player_op["after"]["equipo_id"] is None
    assert summary["team_assignments"] == 0
    assert not any(op["collection"] == "teams" for op in operations)


def test_historical_base_publication_creates_player_without_assigning_text_team():
    """A staged historical row becomes an official profile, not an auto-team assignment."""
    staged = record(
        id="row-new", source_row=2,
        historical={
            "equipment_current": {"number": "25", "shirt_size": "S"},
            "team_history": {"2025-2026": "S.D.A. JUVENIL B"},
            "sport": {"position": "JUGADOR"},
            "bank_reference": {"holder": "Persona Tutora"},
        },
        bank={"status": "valid", "iban_encrypted": "ciphertext", "iban_last4": "9190"},
    )
    draft = {"season": "2026-2027", "duplicates": [], "fuzzy_matches": [], "records": [staged]}
    existing = {"players": [], "families": [], "inscriptions": [], "payments": [], "teams": []}
    row = dict(staged)
    row.update({"_row": staged["source_row"], "_staging_id": staged["id"], "equipo_id": None,
                "_family_candidate_pending": False,
                "_bank": {"iban_encrypted": "ciphertext", "iban_last4": "9190"}})
    analysis = analyze_rows(
        [row], draft["season"], existing, "historical-new", allow_pending_team=True,
        allow_pending_contact=True, ignore_team_name_suggestions=True,
    )
    base_operations = _build_import_operations(
        analysis, existing, "job-new", {}, allow_pending_team=True,
        keep_family_candidates_separate=True, skip_payments=True,
    )
    snapshot = _operations_snapshot(existing, base_operations)
    enrichment_operations, summary = _historical_enrichment_operations(
        draft, snapshot, "job-new", resolve_team_suggestions=False,
    )
    all_operations = [*base_operations, *enrichment_operations]

    assert analysis["blocking_errors"] == 0
    assert sum(op["collection"] == "players" and op["before"] is None for op in base_operations) == 1
    assert not any(op["collection"] == "teams" for op in all_operations)
    base_player = next(op["after"] for op in base_operations if op["collection"] == "players")
    enriched_player = next(op["after"] for op in enrichment_operations if op["collection"] == "players")
    assert base_player["equipo_id"] is None
    assert enriched_player["equipo_id"] is None
    assert enriched_player["historial_equipos"]["2025-2026"] == "S.D.A. JUVENIL B"
    assert summary["matched_players"] == 1
    assert any(op["collection"] == "payments" for op in enrichment_operations)
