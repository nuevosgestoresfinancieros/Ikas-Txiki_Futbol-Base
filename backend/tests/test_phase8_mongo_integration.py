"""Integración de Fase 8 contra una base MongoDB temporal explícita."""
import os
import importlib
import sys
from pathlib import Path

import pytest


MONGO_URL = os.environ.get("PHASE8_MONGO_URL")
pytestmark = pytest.mark.skipif(not MONGO_URL, reason="requiere PHASE8_MONGO_URL temporal")


def test_admin_import_duplicate_undo_and_non_admin_denied(monkeypatch, request):
    monkeypatch.setenv("MONGO_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", "ikas_txiki_phase8_test")
    monkeypatch.setenv("JWT_SECRET", "phase8-local-only-secret-key-000000000000")
    monkeypatch.setenv("ADMIN_USER", "phase8_admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "phase8-admin-local-password")
    monkeypatch.setenv("CORS_ORIGINS", "https://testserver")

    from fastapi.testclient import TestClient
    from pymongo import MongoClient
    sys.modules.pop("server", None)
    server = importlib.import_module("server")
    request.addfinalizer(lambda: sys.modules.pop("server", None))

    template = Path(server.ROOT_DIR / "templates" / "plantilla_inscripciones_2026-2027.xlsx").read_bytes()
    mongo = MongoClient(MONGO_URL)
    temp_db = mongo["ikas_txiki_phase8_test"]
    with TestClient(server.app, base_url="https://testserver") as client:
        mongo.drop_database("ikas_txiki_phase8_test")
        login = client.post("/api/auth/login", json={"username": "phase8_admin", "password": "phase8-admin-local-password"})
        assert login.status_code == 200
        analysis = client.post("/api/inscription-imports/analyze", data={"season": "2026-2027"},
                               files={"file": ("plantilla.xlsx", template, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert analysis.status_code == 200
        payload = analysis.json()
        assert payload["summary"]["create"] == 3 and payload["blocking_errors"] == 0
        confirmed = client.post("/api/inscription-imports/confirm", json={
            "plan_token": payload["plan_token"], "decisions": {}, "confirmed": True,
        })
        assert confirmed.status_code == 200
        job_id = confirmed.json()["job_id"]
        assert temp_db.players.count_documents({"import_job_id": job_id}) == 3
        assert temp_db.inscriptions.count_documents({"import_job_id": job_id}) == 3
        assert temp_db.players.find_one({"import_job_id": job_id}, {"_id": 0, "iban": 1, "iban_encrypted": 1}) == {}

        repeated = client.post("/api/inscription-imports/analyze", data={"season": "2026-2027"},
                               files={"file": ("plantilla.xlsx", template, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
        assert repeated.json()["duplicate_file"] is True
        assert client.post("/api/inscription-imports/confirm", json={
            "plan_token": repeated.json()["plan_token"], "decisions": {}, "confirmed": True,
        }).status_code == 409

        assert client.post(f"/api/inscription-imports/{job_id}/undo").status_code == 200
        assert temp_db.players.count_documents({"import_job_id": job_id}) == 0
        assert temp_db.inscriptions.count_documents({"import_job_id": job_id}) == 0

        temp_db.users.insert_one({
            "id": "coach-phase8", "username": "phase8_coach", "role": "coach", "active": True,
            "assigned_team_ids": ["none"], "password_hash": server.pwd_context.hash("phase8-coach-local-password"),
        })
        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json={"username": "phase8_coach", "password": "phase8-coach-local-password"}).status_code == 200
        assert client.get("/api/inscription-imports/history").status_code == 403
        mongo.drop_database("ikas_txiki_phase8_test")
    mongo.close()
