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
        row[65:72] = ["Titular Ficticio", "ES0000000000000000000000", "NO", "I", 300, None, 300]
        row[78] = "NO" if index else None
        sheet.append(row)
    auxiliary = [None] * EXPECTED_TOTAL_COLUMNS; auxiliary[69] = 600; sheet.append(auxiliary)
    buffer = io.BytesIO(); workbook.save(buffer); return buffer.getvalue()


def test_historical_staging_is_admin_only_simulation_and_never_writes_official_data(monkeypatch, request):
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
        assert client.post("/api/auth/login", json={"username": "historical_admin", "password": "historical-admin-test-password"}).status_code == 200
        response = client.post("/api/inscription-imports/staging", data={"season": "2026-2027"}, files={"file": ("historico.xlsx", content, XLSX_MIME)})
        assert response.status_code == 200
        draft = response.json(); draft_id = draft["id"]
        assert draft["source_format"] == "historical_bbdd_v1"
        assert draft["summary"]["simulation_only"] is True and draft["summary"]["can_import"] is False
        assert draft["quality"]["identified_players"] == 2 and draft["quality"]["auxiliary_rows_excluded"] == 1
        assert draft["simulation"]["official_writes"] == 0
        assert "600000000" not in str(draft) and "uno@example.invalid" not in str(draft)
        stored = temp_db.import_staging.find_one({"id": draft_id})
        assert "historico.xlsx" not in str(stored) and bytes(content) not in str(stored).encode()
        assert all(temp_db[name].count_documents({}) == 0 for name in ("players", "families", "inscriptions", "payments", "teams"))
        assert client.post(f"/api/inscription-imports/staging/{draft_id}/confirm", json={"confirmed": True}).status_code == 409
        assert client.get(f"/api/inscription-imports/staging/{draft_id}/simulation").status_code == 200
        temp_db.users.insert_one({"id": "coach-historical", "username": "historical_coach", "role": "coach", "active": True,
                                  "assigned_team_ids": [], "password_hash": server.pwd_context.hash("historical-coach-test-password")})
        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json={"username": "historical_coach", "password": "historical-coach-test-password"}).status_code == 200
        assert client.get("/api/inscription-imports/staging").status_code == 403
        assert client.get(f"/api/inscription-imports/staging/{draft_id}/simulation").status_code == 403
    mongo.drop_database(db_name); mongo.close()
