"""Flujo completo de preparación contra MongoDB temporal y datos ficticios."""
import io
import importlib
import os
import sys

import pytest
from openpyxl import Workbook

from historical_import_adapter import EXPECTED_TOTAL_COLUMNS, HISTORICAL_COLUMN_MAPPING


MONGO_URL = os.environ.get("PHASE9_MONGO_URL")
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
pytestmark = pytest.mark.skipif(not MONGO_URL, reason="requiere PHASE9_MONGO_URL temporal")


def fictitious_workbook() -> bytes:
    workbook = Workbook(); sheet = workbook.active; sheet.title = "Inscripciones"
    sheet.append([
        "ID EXTERNO", "NOMBRE", "APELLIDOS", "FECHA NACIMIENTO", "TIPO INSCRIPCION",
        "CONTACTO 1 TELEFONO", "EQUIPO 26&27", "CATEGORIA", "MODALIDAD", "EQUIPAMIENTO", "IBAN",
    ])
    for index in range(55):
        external_id = "FICTICIO-000" if index == 1 else f"FICTICIO-{index:03d}"
        sheet.append([
            external_id, f"Persona{index}", "Ficticia", "01/01/2015", "renovacion", "600000000",
            "" if index < 3 else "Equipo Temporal", "Alevín", "", "Jugador;Portero" if index < 11 else "Jugador", "",
        ])
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def fictitious_historical_assignment_workbook() -> bytes:
    workbook = Workbook(); sheet = workbook.active; sheet.title = "BBDD"
    sheet.append([header for _, header, _ in HISTORICAL_COLUMN_MAPPING] + [f"AUX {n}" for n in range(80, 130)])
    for index in range(2):
        row = [None] * EXPECTED_TOTAL_COLUMNS
        row[:5] = [f"Histórica{index}", "Ficticia", "01/01/2015", "2015", "Alevín"]
        row[6:14] = ["Tutor Uno", 600000000, "Tutor Dos", 611111111, "Calle Ficticia",
                     "uno@example.invalid", "dos@example.invalid", "NO"]
        row[53:56] = ["Equipo Histórico", "Equipo Actual" if index else "", "Alevín"]
        sheet.append(row)
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def test_staging_admin_flow_permissions_isolation_and_delete(monkeypatch, request):
    db_name = "ikas_txiki_phase9_test"
    monkeypatch.setenv("MONGO_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("JWT_SECRET", "phase9-local-only-secret-key-000000000000")
    monkeypatch.setenv("ADMIN_USER", "phase9_admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "phase9-admin-local-password")
    monkeypatch.setenv("CORS_ORIGINS", "https://testserver")
    monkeypatch.setenv("IMPORT_STAGING_TTL_HOURS", "24")

    from fastapi.testclient import TestClient
    from pymongo import MongoClient
    sys.modules.pop("server", None)
    server = importlib.import_module("server")
    request.addfinalizer(lambda: sys.modules.pop("server", None))

    mongo = MongoClient(MONGO_URL); temp_db = mongo[db_name]; mongo.drop_database(db_name)
    workbook_content = fictitious_workbook()
    with TestClient(server.app, base_url="https://testserver") as client:
        admin_login = {"username": "phase9_admin", "password": "phase9-admin-local-password"}
        assert client.post("/api/auth/login", json=admin_login).status_code == 200
        response = client.post(
            "/api/inscription-imports/staging", data={"season": "2026-2027"},
            files={"file": ("ficticio.xlsx", workbook_content, XLSX_MIME)},
        )
        assert response.status_code == 200
        draft = response.json(); draft_id = draft["id"]
        assert draft["summary"]["rows_received"] == 55
        assert draft["summary"]["unique_expected"] == 54
        assert draft["summary"]["duplicates_pending"] == 1
        assert draft["summary"]["missing_team"] == 3
        assert draft["summary"]["missing_modality"] == 55
        assert sum(len(row.get("equipamiento_items") or []) == 2 for row in draft["records"]) == 11
        assert draft["summary"]["can_import"] is False
        assert temp_db.players.count_documents({}) == temp_db.families.count_documents({}) == 0
        assert temp_db.inscriptions.count_documents({}) == temp_db.payments.count_documents({}) == 0
        assert "fictitious_workbook" not in str(temp_db.import_staging.find_one({"id": draft_id}))
        assert temp_db.import_staging.index_information()["expires_at_ttl"]["expireAfterSeconds"] == 0

        # Guardar y continuar conserva el mismo borrador/id al recargar el archivo.
        repeated = client.post(
            "/api/inscription-imports/staging", data={"season": "2026-2027"},
            files={"file": ("ficticio.xlsx", workbook_content, XLSX_MIME)},
        )
        assert repeated.json()["id"] == draft_id

        group = draft["duplicates"][0]
        duplicate_response = client.post(
            f"/api/inscription-imports/staging/{draft_id}/duplicates/{group['id']}",
            json={"decision": "merge"},
        )
        assert duplicate_response.status_code == 200
        refreshed = client.get(f"/api/inscription-imports/staging/{draft_id}").json()
        record_ids = [row["id"] for row in refreshed["records"] if row["active"]]
        temp_db.teams.insert_one({
            "id": "team-phase9", "nombre": "Equipo Temporal", "categoria": "Alevín",
            "modalidad": "F7", "estado": "activo", "temporada": "2026-2027",
        })
        assert client.post(f"/api/inscription-imports/staging/{draft_id}/bulk", json={
            "record_ids": record_ids, "field": "modalidad", "value": "F7", "confirm_suggestion": False,
        }).status_code == 422
        assert client.post(f"/api/inscription-imports/staging/{draft_id}/bulk", json={
            "record_ids": record_ids, "field": "modalidad", "value": "F7", "confirm_suggestion": True,
        }).status_code == 200
        missing_ids = [row["id"] for row in refreshed["records"] if row["active"] and not row.get("equipo")]
        # La confirmación reforzada se exige únicamente a las asignaciones
        # históricas; la edición individual ordinaria conserva su contrato.
        for record_id in missing_ids:
            assert client.patch(f"/api/inscription-imports/staging/{draft_id}/records/{record_id}", json={
                "field": "equipo", "value": "Equipo Temporal", "confirm_suggestion": False,
            }).status_code == 200

        historical = client.post(
            "/api/inscription-imports/staging", data={"season": "2026-2027"},
            files={"file": ("historico-ficticio.xlsx", fictitious_historical_assignment_workbook(), XLSX_MIME)},
        )
        assert historical.status_code == 200
        historical_draft = historical.json(); historical_id = historical_draft["id"]
        historical_ids = [row["id"] for row in historical_draft["records"] if row["active"] and not row.get("equipo")]
        assert historical_ids
        before_rejection = client.get(f"/api/inscription-imports/staging/{historical_id}").json()
        rejected = client.post(f"/api/inscription-imports/staging/{historical_id}/bulk", json={
            "record_ids": historical_ids, "field": "equipo", "value": "team-phase9", "confirm_suggestion": False,
        })
        assert rejected.status_code == 422
        assert rejected.json()["detail"] == "La asignación requiere confirmación administrativa expresa"
        after_rejection = client.get(f"/api/inscription-imports/staging/{historical_id}").json()
        before_rows = {row["id"]: (row.get("equipo"), row.get("equipo_id")) for row in before_rejection["records"]}
        after_rows = {row["id"]: (row.get("equipo"), row.get("equipo_id")) for row in after_rejection["records"]}
        assert after_rows == before_rows

        temp_db.users.insert_one({
            "id": "coach-phase9", "username": "phase9_coach", "role": "coach", "active": True,
            "assigned_team_ids": [], "password_hash": server.pwd_context.hash("phase9-coach-local-password"),
        })
        client.post("/api/auth/logout")
        coach_login = {"username": "phase9_coach", "password": "phase9-coach-local-password"}
        assert client.post("/api/auth/login", json=coach_login).status_code == 200
        assert client.post(f"/api/inscription-imports/staging/{historical_id}/bulk", json={
            "record_ids": historical_ids, "field": "equipo", "value": "team-phase9", "confirm_suggestion": True,
        }).status_code == 403
        assert client.get("/api/inscription-imports/staging").status_code == 403
        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json=admin_login).status_code == 200
        assert client.post(f"/api/inscription-imports/staging/{historical_id}/bulk", json={
            "record_ids": historical_ids, "field": "equipo", "value": "team-phase9", "confirm_suggestion": True,
        }).status_code == 200
        assigned = client.get(f"/api/inscription-imports/staging/{historical_id}").json()
        assigned_rows = {row["id"]: row for row in assigned["records"]}
        assert all(assigned_rows[record_id]["equipo"] == "Equipo Temporal" for record_id in historical_ids)
        assert all(assigned_rows[record_id]["equipo_id"] == "team-phase9" for record_id in historical_ids)
        assert client.delete(f"/api/inscription-imports/staging/{historical_id}").status_code == 200
        october_response = client.post(
            f"/api/inscription-imports/staging/{draft_id}/october", json={"record_ids": record_ids[:54]},
        )
        assert october_response.status_code == 200
        ready = client.get(f"/api/inscription-imports/staging/{draft_id}").json()
        assert ready["summary"]["october_selected"] == 54
        assert ready["summary"]["teams_over_capacity"] == 1
        assert ready["summary"]["can_import"] is True
        applied = client.post(f"/api/inscription-imports/staging/{draft_id}/confirm", json={"confirmed": True})
        assert applied.status_code == 200
        job_id = applied.json()["job_id"]
        assert temp_db.players.count_documents({"import_job_id": job_id}) == 54
        assert temp_db.payments.count_documents({"import_job_id": job_id}) == 0
        assert client.post(f"/api/inscription-imports/{job_id}/undo").status_code == 200
        assert temp_db.players.count_documents({"import_job_id": job_id}) == 0

        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json=coach_login).status_code == 200
        assert client.get("/api/inscription-imports/staging").status_code == 403
        temp_db.users.insert_one({
            "id": "family-phase9", "username": "phase9_family", "role": "family", "active": True,
            "family_id": "family-none", "password_hash": server.pwd_context.hash("phase9-family-local-password"),
        })
        client.post("/api/auth/logout")
        family_login = {"username": "phase9_family", "password": "phase9-family-local-password"}
        assert client.post("/api/auth/login", json=family_login).status_code == 200
        assert client.get("/api/inscription-imports/staging").status_code == 403
        client.post("/api/auth/logout")
        client.post("/api/auth/login", json=admin_login)
        assert client.delete(f"/api/inscription-imports/staging/{draft_id}").status_code == 404
        replacement = client.post(
            "/api/inscription-imports/staging", data={"season": "2026-2027"},
            files={"file": ("ficticio.xlsx", workbook_content, XLSX_MIME)},
        ).json()
        assert client.delete(f"/api/inscription-imports/staging/{replacement['id']}").status_code == 200
    mongo.drop_database(db_name); mongo.close()
