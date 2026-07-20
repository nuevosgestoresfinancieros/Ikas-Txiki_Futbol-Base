import io

from openpyxl import Workbook

from authz import route_permission
from inscription_import_service import (
    SEASON, analyze_rows, decode_plan, encode_plan, encrypt_iban, identity_key,
    merge_nonempty, parse_equipment, parse_excel, valid_iban,
)


HEADERS = [
    "ID EXTERNO", "NOMBRE", "APELLIDOS", "FECHA NACIMIENTO", "TIPO INSCRIPCION",
    "CONTACTO 1 TELEFONO", "EQUIPO 26&27", "CATEGORIA", "MODALIDAD", "EQUIPAMIENTO", "IBAN",
]


def row(**changes):
    value = {
        "_row": 2, "external_id": "FICTICIO-001", "nombre": "Ane", "apellidos": "Proba",
        "fecha_nacimiento": "2015-04-03", "tipo": "alta", "progenitor1_telefono": "600000001",
        "equipo": "F7 Ficticio", "categoria": "Alevín", "modalidad": "F7",
        "equipamiento_items": ["Camiseta", "Pantalón"], "iban": "ES9121000418450200051332",
    }
    value.update(changes)
    return value


def existing(**changes):
    value = {"players": [], "families": [], "teams": [], "inscriptions": [], "payments": []}
    value.update(changes)
    return value


def workbook_bytes(values):
    workbook = Workbook(); sheet = workbook.active; sheet.title = "Inscripciones"; sheet.append(HEADERS)
    for item in values:
        sheet.append(item)
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def test_valid_excel_and_equipment_multiple():
    content = workbook_bytes([["F-1", "Ane", "Proba", "03/04/2015", "alta", "600 000 001",
                               "F7 Ficticio", "Alevín", "F7", "Camiseta; Pantalón", "ES9121000418450200051332"]])
    parsed = parse_excel(content)
    assert parsed[0]["fecha_nacimiento"] == "2015-04-03"
    assert parsed[0]["equipamiento_items"] == ["Camiseta", "Pantalón"]
    assert analyze_rows(parsed, SEASON, existing(), "abc")["summary"]["create"] == 1


def test_duplicate_errors_conflicts_and_second_load():
    duplicate = analyze_rows([row(), row(_row=3)], SEASON, existing(), "abc")
    assert duplicate["summary"]["duplicate"] == 1
    invalid = analyze_rows([row(fecha_nacimiento=None), row(_row=3, external_id="F-2", iban="ES00")], SEASON, existing(), "abc")
    assert invalid["blocking_errors"] == 2
    conflict = analyze_rows([row()], SEASON, existing(teams=[
        {"id": "t1", "nombre": "F7 Ficticio"}, {"id": "t2", "nombre": "F7 Ficticio"},
    ]), "abc")
    assert conflict["summary"]["conflict"] == 1
    repeated = analyze_rows([row()], SEASON, existing(), "abc", duplicate_file=True)
    assert repeated["duplicate_file"] and repeated["blocking_errors"] == 1


def test_empty_cells_do_not_overwrite_and_shared_contact_is_not_conflict():
    original = row(); key = identity_key(original)
    player = {**original, "id": "p1", "import_identity_key": key, "centro_escolar": "Centro válido"}
    incoming = row(centro_escolar="")
    result = analyze_rows([incoming], SEASON, existing(players=[player]), "abc")
    assert result["summary"]["update"] == 1  # crea la inscripción, pero conserva el dato válido del jugador
    assert merge_nonempty(player, incoming, {"centro_escolar"})["centro_escolar"] == "Centro válido"
    sibling = row(_row=3, external_id="F-2", nombre="Unai", progenitor1_telefono="600000001")
    assert analyze_rows([sibling], SEASON, existing(players=[player]), "abc")["summary"]["create"] == 1


def test_team_limits_and_october_are_only_warnings():
    players = [{"id": f"p{i}", "equipo_id": "t1", "nombre": f"P{i}", "fecha_nacimiento": "2015-01-01"} for i in range(18)]
    analysis = analyze_rows([row(pendiente_octubre="sí")], SEASON,
                            existing(players=players, teams=[{"id": "t1", "nombre": "F7 Ficticio", "modalidad": "F7", "categoria": "Alevín"}]), "abc")
    codes = {item["code"] for item in analysis["issues"]}
    assert {"team_capacity", "october_manual"}.issubset(codes)
    assert analysis["blocking_errors"] == 0


def test_plan_and_iban_are_protected():
    secret = "x" * 32
    token = encode_plan({"rows": [row()]}, secret)
    assert "Ane" not in token and decode_plan(token, secret)["rows"][0]["nombre"] == "Ane"
    encrypted = encrypt_iban("ES9121000418450200051332", secret)
    assert encrypted["iban_last4"] == "1332" and "21000418" not in encrypted["iban_encrypted"]
    assert valid_iban("ES9121000418450200051332")
    assert parse_equipment("Camiseta; pantalón | Camiseta") == ["Camiseta", "pantalón"]


class Request:
    method = "GET"
    class URL:
        path = "/api/inscription-imports/history"
    url = URL()


def test_import_routes_always_require_administer_permission():
    assert route_permission(Request()) == ("data", "administer")
