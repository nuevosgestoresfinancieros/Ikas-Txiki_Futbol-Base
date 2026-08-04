"""Integración del adaptador histórico contra MongoDB temporal y datos ficticios."""
import importlib
import io
import os
import sys

import pytest
from openpyxl import Workbook

from historical_import_adapter import EXPECTED_TOTAL_COLUMNS, HISTORICAL_COLUMN_MAPPING


MONGO_URL = os.environ.get("PHASE9_MONGO_URL")
pytestmark = pytest.mark.skipif(not MONGO_URL, reason="requiere PHASE9_MONGO_URL temporal")
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def fictitious_historical_workbook():
    workbook = Workbook(); sheet = workbook.active; sheet.title = "BBDD"
    sheet.append([header for _, header, _ in HISTORICAL_COLUMN_MAPPING] + [f"AUX {n}" for n in range(80, 130)])
    for index in range(2):
        row = [None] * EXPECTED_TOTAL_COLUMNS
        row[:5] = [f"Persona{index}", "Ficticia", "01/01/2015", "2015", "Alevín"]
        row[6:14] = ["Tutor Uno", 600000000, "Tutor Dos", 611111111, "Calle Ficticia", "uno@example.invalid", "dos@example.invalid", "NO"]
        row[53:56] = ["Equipo Histórico", "Equipo Actual" if index else "", "Alevín"]
        row[65:72] = ["Titular Ficticio", "ES9121000418450200051332", "NO", "I", 300, None, 300]
        row[78] = "NO" if index else None
        sheet.append(row)
    auxiliary = [None] * EXPECTED_TOTAL_COLUMNS; auxiliary[69] = 600; sheet.append(auxiliary)
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def test_historical_staging_requires_admin_and_preserves_protected_data(monkeypatch, request):
    db_name = "ikas_txiki_historical_adapter_test"
    monkeypatch.setenv("MONGO_URL", MONGO_URL); monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("JWT_SECRET", "historical-local-test-secret-000000000000")
    monkeypatch.setenv("ADMIN_USER", "historical_admin"); monkeypatch.setenv("ADMIN_PASSWORD", "historical-admin-test-password")
    monkeypatch.setenv("CORS_ORIGINS", "https://testserver")
    from fastapi.testclient import TestClient
    from pymongo import MongoClient
    sys.modules.pop("server", None); server = importlib.import_module("server")
    request.addfinalizer(lambda: sys.modules.pop("server", None))
    mongo = MongoClient(MONGO_URL); temp_db = mongo[db_name]; mongo.drop_database(db_name)
    content = fictitious_historical_workbook()
    with TestClient(server.app, base_url="https://testserver") as client:
        temp_db.players.insert_many([
            {"id": f"historical-player-{index}", "nombre": f"Persona{index}", "apellidos": "Ficticia",
             "fecha_nacimiento": "2015-01-01", "equipo_id": None}
            for index in range(2)
        ])
        assert client.post("/api/auth/login", json={"username": "historical_admin", "password": "historical-admin-test-password"}).status_code == 200
        response = client.post("/api/inscription-imports/staging", data={"season": "2026-2027"}, files={"file": ("historico.xlsx", content, XLSX_MIME)})
        assert response.status_code == 200
        draft = response.json(); draft_id = draft["id"]
        assert draft["source_format"] == "historical_bbdd_v1"
        # El borrador actual admite enriquecimiento real, pero su vista previa
        # continúa siendo una simulación sin escrituras oficiales.
        assert draft["summary"]["simulation_only"] is False
        assert draft["summary"]["can_import"] is False
        assert draft["quality"]["identified_players"] == 2 and draft["quality"]["auxiliary_rows_excluded"] == 1
        assert draft["simulation"]["mode"] == "simulation_only"
        assert draft["simulation"]["official_writes"] == 0
        assert "600000000" not in str(draft) and "uno@example.invalid" not in str(draft)
        assert "ES9121000418450200051332" not in str(draft)
        stored = temp_db.import_staging.find_one({"id": draft_id})
        assert "historico.xlsx" not in str(stored) and bytes(content) not in str(stored).encode()
        assert temp_db.players.count_documents({}) == 2
        assert all(temp_db[name].count_documents({}) == 0 for name in ("families", "inscriptions", "payments", "teams"))
        blocked = client.post(f"/api/inscription-imports/staging/{draft_id}/confirm", json={"confirmed": True})
        assert blocked.status_code == 409
        assert blocked.json()["detail"] == "El borrador mantiene bloqueos pendientes"
        assert temp_db.players.count_documents({"historical_import_job_id": {"$exists": True}}) == 0
        prepared = client.post(f"/api/inscription-imports/staging/{draft_id}/historical-readiness")
        assert prepared.status_code == 200
        prepared_draft = prepared.json()
        fuzzy_group = prepared_draft["fuzzy_matches"][0]
        family_group = prepared_draft["family_candidates"][0]
        assert client.post(
            f"/api/inscription-imports/staging/{draft_id}/reviews/fuzzy/{fuzzy_group['id']}",
            json={"decision": "different_people"},
        ).status_code == 200
        reviewed = client.post(
            f"/api/inscription-imports/staging/{draft_id}/reviews/family/{family_group['id']}",
            json={"decision": "keep_separate"},
        )
        assert reviewed.status_code == 200
        assert reviewed.json()["summary"]["can_import"] is True
        simulation = client.get(f"/api/inscription-imports/staging/{draft_id}/simulation")
        assert simulation.status_code == 200
        assert simulation.json()["simulation"]["official_writes"] == 0
        assert temp_db.players.count_documents({}) == 2
        assert temp_db.payments.count_documents({}) == 0

        temp_db.users.insert_one({"id": "coach-historical", "username": "historical_coach", "role": "coach", "active": True,
                                  "assigned_team_ids": [], "password_hash": server.pwd_context.hash("historical-coach-test-password")})
        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json={"username": "historical_coach", "password": "historical-coach-test-password"}).status_code == 200
        assert client.get("/api/inscription-imports/staging").status_code == 403
        assert client.get(f"/api/inscription-imports/staging/{draft_id}/simulation").status_code == 403
        assert client.post(f"/api/inscription-imports/staging/{draft_id}/confirm", json={"confirmed": True}).status_code == 403
        assert temp_db.players.count_documents({"historical_import_job_id": {"$exists": True}}) == 0
        assert temp_db.payments.count_documents({}) == 0

        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json={"username": "historical_admin", "password": "historical-admin-test-password"}).status_code == 200
        rejected = client.post(f"/api/inscription-imports/staging/{draft_id}/confirm", json={"confirmed": False})
        assert rejected.status_code == 422
        assert rejected.json()["detail"] == "La importación requiere confirmación expresa"
        assert temp_db.players.count_documents({"historical_import_job_id": {"$exists": True}}) == 0
        assert temp_db.payments.count_documents({}) == 0

        applied = client.post(f"/api/inscription-imports/staging/{draft_id}/confirm", json={"confirmed": True})
        assert applied.status_code == 200
        result = applied.json()
        assert result["summary"]["matched_players"] == 2
        assert result["summary"]["created_players"] == 0
        assert result["summary"]["official_debts"] == 0
        assert temp_db.players.count_documents({}) == 2
        assert temp_db.families.count_documents({}) == temp_db.inscriptions.count_documents({}) == 0
        enriched = list(temp_db.players.find({"historical_import_job_id": result["job_id"]}, {"_id": 0}))
        assert len(enriched) == 2
        assert all(player.get("historial_equipos") for player in enriched)
        assert all((player.get("referencias_permisos") or {}).get("signed") is not True for player in enriched)
        bank_references = list(temp_db.payments.find({"import_job_id": result["job_id"]}, {"_id": 0}))
        assert len(bank_references) == 2
        assert all(reference["historical_bank_reference"] is True for reference in bank_references)
        assert all(reference["confirmed_debt"] is False and reference["importe_final"] == 0 for reference in bank_references)
        assert all(reference.get("iban") is None and reference.get("iban_encrypted") for reference in bank_references)
        assert "ES9121000418450200051332" not in str(bank_references)
    mongo.drop_database(db_name); mongo.close()
