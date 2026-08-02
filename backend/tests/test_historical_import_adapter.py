import io
import itertools
import zipfile

from openpyxl import Workbook

from historical_import_adapter import (
    COMPACT_HEADERS, COMPACT_TOTAL_COLUMNS, EXPECTED_TOTAL_COLUMNS, HISTORICAL_COLUMN_MAPPING, historical_quality_summary,
    historical_simulation, parse_historical_excel, prepare_historical_staging,
)


SECRET = "historical-fictitious-secret-only-000000000000"


def _headers():
    operational = [header for _, header, _ in HISTORICAL_COLUMN_MAPPING]
    return operational + [f"AUXILIAR {index}" for index in range(80, EXPECTED_TOTAL_COLUMNS + 1)]


def _row(name="Ane", surname="Ficticia", birth="01/01/2015", team=""):
    row = [None] * EXPECTED_TOTAL_COLUMNS
    row[0:5] = [name, surname, birth, "2015", "Alevín"]
    row[6:14] = ["Tutor Uno", 600000000, "Tutor Dos", 611111111, "Calle Ficticia 1", "uno@example.invalid", "dos@example.invalid", "NO"]
    row[45:49] = ["FICTICIO", "7", "12", "35-38"]
    row[53:56] = ["Equipo Histórico", team, "Alevín"]
    row[65:72] = ["Titular Ficticio", "ES0000000000000000000000", "NO", "I", 300, None, 300]
    row[78] = "NO"
    return row


def workbook_bytes(rows, formulas=None):
    workbook = Workbook(); sheet = workbook.active; sheet.title = "BBDD"
    sheet.append(_headers())
    for row in rows:
        sheet.append(row)
    for cell, formula in formulas or []:
        sheet[cell] = formula
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def compact_workbook_bytes(rows):
    workbook = Workbook(); sheet = workbook.active; sheet.title = "BBDD"
    sheet.append(list(COMPACT_HEADERS))
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def _ids():
    counter = itertools.count()
    return lambda: f"test-{next(counter)}"


def test_maps_129_columns_without_assigning_team_or_modality_and_quarantines_auxiliary():
    auxiliary = [None] * EXPECTED_TOTAL_COLUMNS; auxiliary[69] = 300
    parsed = parse_historical_excel(workbook_bytes([_row(), auxiliary]), _ids())
    quality = historical_quality_summary(parsed)
    assert quality["identified_players"] == 1
    assert quality["without_current_team"] == 1 and quality["modality_pending"] == 1
    assert quality["auxiliary_rows_excluded"] == 1
    record = parsed["records"][0]
    assert record["equipo"] == "" and record["equipo_anterior"] == "Equipo Histórico"
    assert record["modalidad"] == ""
    assert record["historical"]["consents"]["debit"] == "no"
    assert record["historical"]["consents"]["images"] == "no"
    assert record["historical"]["fees"]["confirmed_debt"] is False


def test_invalid_contacts_bank_and_economic_text_are_flagged_without_fabrication():
    row = _row(); row[7] = "teléfono incompatible"; row[11] = "dos correos@example.invalid otro@example.invalid"
    row[66] = "12345678901234567890"; row[70] = "pendiente"
    parsed = parse_historical_excel(workbook_bytes([row]), _ids())
    quality = historical_quality_summary(parsed)
    assert quality["invalid_phone_cells"] == 1
    assert quality["invalid_email_cells"] == 1
    assert quality["invalid_iban_cells"] == 1
    assert quality["nonnumeric_fee_values"] == 1
    records, _, incidents = prepare_historical_staging(parsed, SECRET)
    assert records[0]["bank"]["status"] == "pending"
    assert records[0]["bank"]["iban_encrypted"] is None
    assert any(item["field"] == "bank" for item in incidents)


def test_family_candidates_need_two_independent_signals_and_are_not_linked():
    first = _row("Ane", "Ficticia", "01/01/2015")
    second = _row("Unai", "Ficticio", "02/02/2014")
    parsed = parse_historical_excel(workbook_bytes([first, second]), _ids())
    assert len(parsed["family_candidates"]) == 1
    assert len(parsed["family_candidates"][0]["signals"]) >= 2
    assert parsed["family_candidates"][0]["decision"] is None
    second[6] = "Otro Tutor"; second[7] = 622222222; second[8] = "Otra Tutora"; second[9] = 633333333
    second[10] = "Otra calle"; second[11] = "otra1@example.invalid"; second[12] = "otra2@example.invalid"
    second[65] = "Otra persona"; second[66] = "ES0000000000000000000001"
    separated = parse_historical_excel(workbook_bytes([first, second]), _ids())
    assert separated["family_candidates"] == []


def test_fuzzy_match_is_review_only_and_simulation_writes_nothing_official():
    first = _row("Ane", "Ficticia", "01/01/2015", "Equipo Ficticio")
    second = _row("Anne", "Ficticia", "01/01/2015", "Equipo Ficticio")
    parsed = parse_historical_excel(workbook_bytes([first, second]), _ids())
    assert len(parsed["fuzzy_matches"]) == 1 and parsed["fuzzy_matches"][0]["decision"] is None
    simulation = historical_simulation(parsed, [])
    assert simulation["proposed_creates"] == 2
    assert simulation["official_writes"] == 0
    assert all(value == 0 for key, value in simulation["planned_operations"].items() if key.startswith("official_"))


def test_economic_formulas_are_the_only_materializable_columns_and_other_formulas_block():
    content = workbook_bytes([_row()], formulas=[("BT2", "=1+2"), ("F2", "=1+2")])
    parsed = parse_historical_excel(content, _ids())
    # openpyxl does not create cached results; the allowed formula is safely blocked
    # until a trusted numeric cache exists. A formula outside BT:BV is always blocked.
    assert len(parsed["blocked_formulas"]) == 2
    records, _, incidents = prepare_historical_staging(parsed, SECRET)
    assert records and sum(item["code"] == "formula_not_allowed" for item in incidents) == 2


def test_no_original_workbook_or_clear_iban_is_present_in_staging_payload():
    parsed = parse_historical_excel(workbook_bytes([_row()]), _ids())
    records, _, _ = prepare_historical_staging(parsed, SECRET)
    payload = str(records)
    assert "workbook" not in payload.lower()
    assert "ES0000000000000000000000" not in payload
    assert records[0]["bank"]["iban_encrypted"] is None


def test_compact_64_column_export_maps_pending_player_history_without_fabricating_identity():
    row = [None] * COMPACT_TOTAL_COLUMNS
    row[0:2] = ["Ane", "Ficticia"]
    row[29:33] = ["FICTICIA", 7, "M", "JR"]
    row[33:37] = ["ANE", 9, "M", "JR"]
    row[37] = "FEDERADO"
    row[41:44] = ["Equipo 25/26", "Equipo 26/27", "Juvenil"]
    row[44:52] = ["SI"] * 8
    row[52] = "PORTERA"
    row[53:58] = ["Titular Ficticio", "ES0000000000000000000000", "SI", 500, 500]
    row[58:64] = ["SI", "NO", "SI", "NO", "SI", "SI"]

    parsed = parse_historical_excel(compact_workbook_bytes([row]), _ids())
    record = parsed["records"][0]
    assert parsed["source_layout"] == "compact_64"
    assert record["fecha_nacimiento"] is None
    assert record["equipo"] == "Equipo 26/27" and record["equipo_anterior"] == "Equipo 25/26"
    assert record["historical"]["equipment_history"]["2025-2026"] == ["FICTICIA", "7", "M", "JR"]
    assert record["historical"]["equipment_current"]["number"] == "9"
    assert record["historical"]["sport"]["position"] == "PORTERA"
    assert record["historical"]["consents"]["images"] == "yes"
    simulation = historical_simulation(parsed, [{"nombre": "Ane", "apellidos": "Ficticia", "fecha_nacimiento": "2010-01-01"}])
    assert simulation["profile_enrichment_candidates"] == 1
    assert simulation["proposed_creates"] == 0 and simulation["official_writes"] == 0
