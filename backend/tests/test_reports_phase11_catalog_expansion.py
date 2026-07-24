import io

import pytest
from openpyxl import load_workbook

from modality_service import catalog_from_settings
from report_export_service import generate_pdf, generate_xlsx
from report_service import REPORTS, ReportValidationError, build_report, catalog_for_role


TEAMS = [
    {"id": "team-a", "nombre": "Talde Fiktiboa A", "categoria": "Alevín", "modalidad": "F7",
     "temporada": "2026-2027", "limite_jugadores": 18},
    {"id": "team-b", "nombre": "Talde Fiktiboa B", "categoria": "Infantil", "modalidad": "F11",
     "temporada": "2026-2027", "limite_jugadores": 25},
]
PLAYERS = [
    {"id": "player-a", "nombre": "Ane", "apellidos": "Fiktiboa", "fecha_nacimiento": "2015-05-02",
     "fecha_alta": "2026-07-01", "equipo_id": "team-a", "familia_id": "family-a",
     "categoria": "Alevín", "dorsal": 7, "posicion": "Defensa", "numero_licencia": "LIC-F",
     "estado": "activo", "estado_documental": "pendiente", "doc_foto": True,
     "equipamiento_items": ["jugador", "portero"], "talla_camiseta": "M",
     "talla_pantalon": "M", "talla_chandal": "L", "equipacion_entregada": False},
    {"id": "player-b", "nombre": "Unai", "apellidos": "Fiktiboa", "fecha_nacimiento": "2013-02-01",
     "fecha_baja": "2026-10-01", "equipo_id": "team-b", "familia_id": "family-b",
     "categoria": "Infantil", "dorsal": 4, "estado": "baja", "estado_documental": "completo"},
]
TRAININGS = [
    {"id": "training-a", "fecha": "2026-09-01", "hora": "18:00", "campo": "Campo Ficticio",
     "equipo_id": "team-a", "callup_id": "callup-a",
     "asistencia": [{"player_id": "player-a", "estado": "presente"}]},
]
MATCHES = [
    {"id": "match-a", "temporada": "2026-2027", "fecha": "2026-09-01", "hora": "10:00",
     "equipo_id": "team-a", "rival": "Rival Ficticio", "condicion": "local", "tipo": "liga",
     "estado": "jugado", "resultado_propio": 2, "resultado_rival": 1},
]
CALLUPS = [
    {"id": "callup-a", "match_id": "match-a", "equipo_id": "team-a",
     "convocados": [{"player_id": "player-a", "estado": "confirmado",
                     "responded_at": "2026-08-30T12:00:00Z", "late": False}]},
]
CONTEXT = {
    "players": PLAYERS, "teams": TEAMS, "trainings": TRAININGS, "matches": MATCHES,
    "callups": CALLUPS, "modalities": catalog_from_settings(),
    "families": [{"id": "family-a", "progenitor1_nombre": "Tutor Ficticio",
                  "progenitor1_telefono": "600000000", "progenitor1_email": "ficticio@example.test"}],
    "inscriptions": [{"id": "ins-a", "player_id": "player-a", "nombre": "Ane",
                      "apellidos": "Fiktiboa", "tipo": "alta", "temporada": "2026-2027",
                      "equipo_id": "team-a", "categoria": "Alevín", "modalidad": "F7",
                      "estado": "aceptada", "created_at": "2026-07-01"}],
    "authorizations": [{"id": "auth-a", "player_id": "player-a", "tipo": "general",
                        "estado": "pendiente"}],
    "payments": [{"id": "pay-a", "player_id": "player-a", "concepto": "Cuota ficticia",
                  "importe_final": 125, "forma_pago": "transferencia", "estado": "pendiente",
                  "iban": "forbidden", "iban_encrypted": "forbidden"}],
    "stats": [{"id": "stats-a", "player_id": "player-a", "temporada": "2026-2027",
               "partidos_convocado": 5, "partidos_jugados": 4, "minutos": 200,
               "goles": 1, "asistencias": 2, "amarillas": 0, "rojas": 0, "valoracion": 8}],
}


def test_catalog_has_integral_non_duplicated_professional_scope():
    assert len(REPORTS) == 18
    assert len(REPORTS) == len(set(REPORTS))
    legacy = {value for definition in REPORTS.values() for value in definition["legacy_equivalents"]}
    assert legacy == {"playersList", "familyPhones", "familyEmails", "pendingPaymentsReport",
                      "pendingAuthsReport", "statsReport"}
    assert REPORTS["roster"]["legacy_equivalents"] == ["playersList"]
    assert REPORTS["family_contacts"]["legacy_equivalents"] == ["familyPhones", "familyEmails"]


@pytest.mark.parametrize("report_id", sorted(REPORTS))
def test_every_professional_report_builds_safe_preview_pdf_and_excel(report_id):
    role = "admin"
    definition, rows, totals = build_report(report_id, CONTEXT, {}, role)
    assert definition["id"] == report_id
    assert all(set(row) <= set(definition["columns"]) for row in rows)
    assert isinstance(totals, dict)
    pdf = generate_pdf(definition, rows, totals, {}, {}, {}, "es")
    xlsx = generate_xlsx(definition, rows, totals, {}, {}, {}, "eu")
    assert pdf.startswith(b"%PDF-")
    assert load_workbook(io.BytesIO(xlsx)).active.sheet_state == "visible"


def test_role_catalog_does_not_expand_sensitive_permissions():
    coach = {item["id"] for item in catalog_for_role("coach")}
    family = {item["id"] for item in catalog_for_role("family")}
    player = {item["id"] for item in catalog_for_role("player")}
    assert "family_contacts" not in coach | family | player
    assert "financial_summary" not in coach | player
    assert "inscriptions" not in coach | family | player
    with pytest.raises(ReportValidationError):
        build_report("family_contacts", CONTEXT, {}, "coach")


def test_family_contacts_are_explicit_and_other_reports_never_leak_contacts_or_bank_data():
    _, contacts, _ = build_report("family_contacts", CONTEXT, {"contact_type": "phone"}, "admin")
    assert contacts[0]["phone"] == "600000000" and contacts[0]["email"] is None
    for report_id in set(REPORTS) - {"family_contacts"}:
        role = "admin"
        _, rows, _ = build_report(report_id, CONTEXT, {}, role)
        serialized = str(rows).casefold()
        assert "600000000" not in serialized
        assert "example.test" not in serialized
        assert "iban" not in serialized


def test_multiple_equipment_items_are_preserved_as_separate_rows():
    _, rows, totals = build_report("equipment", CONTEXT, {}, "admin")
    ane_rows = [row for row in rows if row["name"] == "Ane"]
    assert [row["equipment_item"] for row in ane_rows] == ["jugador", "portero"]
    assert totals["items"] == len(rows)


def test_callup_response_and_attendance_comparison_use_normalized_status():
    _, responses, _ = build_report("callup_responses", CONTEXT, {}, "admin")
    _, comparison, _ = build_report("callup_attendance", CONTEXT, {}, "admin")
    assert responses[0]["response"] == "confirmed"
    assert comparison[0]["attendance_status"] == "presente"
    assert comparison[0]["consistent"] is True


def test_financial_report_has_aggregates_but_never_bank_data():
    _, rows, totals = build_report("financial_summary", CONTEXT, {"status": "pendiente"}, "admin")
    assert totals == {"rows": 1, "expected": 125.0, "paid": 0, "pending": 125.0}
    assert set(rows[0]) == set(REPORTS["financial_summary"]["columns"])
    assert "iban" not in str(rows).casefold()


def test_filters_are_strict_and_unknown_values_are_rejected():
    with pytest.raises(ReportValidationError):
        build_report("unknown", CONTEXT, {}, "admin")
    from report_service import validate_report_filters
    with pytest.raises(ReportValidationError):
        validate_report_filters("equipment", {"delivery": "manipulated"})
    with pytest.raises(ReportValidationError):
        validate_report_filters("roster", {"private_field": "x"})
