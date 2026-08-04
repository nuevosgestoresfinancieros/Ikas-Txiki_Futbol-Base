"""Regresión de asignaciones masivas ordinarias contra MongoDB temporal."""
import importlib
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest


MONGO_URL = os.environ.get("PHASE9_MONGO_URL")
pytestmark = pytest.mark.skipif(not MONGO_URL, reason="requiere PHASE9_MONGO_URL temporal")


def ordinary_draft():
    now = datetime.now(timezone.utc)
    return {
        "id": "ordinary-bulk-draft", "season": "2026-2027", "status": "draft",
        "source_sha256": "ordinary-bulk-fixture", "created_by_user_id": "admin",
        "created_at": now, "updated_at": now, "expires_at": now + timedelta(hours=1),
        "records": [
            {"id": f"ordinary-record-{index}", "source_row": index + 2, "active": True,
             "excluded": False, "nombre": f"Persona{index}", "apellidos": "Ficticia",
             "fecha_nacimiento": "2015-01-01", "tipo": "renovacion", "categoria": "Alevín",
             "modalidad": "F7", "equipo": "", "equipo_id": None, "bank": {"status": "pending"}}
            for index in range(2)
        ],
        "duplicates": [], "incidents": [], "audit": [],
    }


def test_ordinary_bulk_team_assignment_is_atomic_and_admin_only(monkeypatch, request):
    db_name = "ikas_txiki_ordinary_bulk_team_test"
    monkeypatch.setenv("MONGO_URL", MONGO_URL); monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("JWT_SECRET", "ordinary-bulk-local-secret-000000000000")
    monkeypatch.setenv("ADMIN_USER", "ordinary_bulk_admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "ordinary-bulk-admin-password")
    monkeypatch.setenv("CORS_ORIGINS", "https://testserver")

    from fastapi.testclient import TestClient
    from pymongo import MongoClient

    sys.modules.pop("server", None); server = importlib.import_module("server")
    request.addfinalizer(lambda: sys.modules.pop("server", None))
    mongo = MongoClient(MONGO_URL); temp_db = mongo[db_name]; mongo.drop_database(db_name)
    temp_db.import_staging.insert_one(ordinary_draft())

    with TestClient(server.app, base_url="https://testserver") as client:
        admin_login = {"username": "ordinary_bulk_admin", "password": "ordinary-bulk-admin-password"}
        assert client.post("/api/auth/login", json=admin_login).status_code == 200
        record_ids = ["ordinary-record-0", "ordinary-record-1"]

        empty = client.post("/api/inscription-imports/staging/ordinary-bulk-draft/bulk", json={
            "record_ids": record_ids, "field": "equipo", "value": "", "confirm_suggestion": False,
        })
        assert empty.status_code == 422
        assert empty.json()["detail"] == "El valor de asignación es obligatorio"
        assert temp_db.import_staging.count_documents({"records.equipo": {"$ne": ""}}) == 0

        invalid_selection = client.post("/api/inscription-imports/staging/ordinary-bulk-draft/bulk", json={
            "record_ids": [record_ids[0], "record-inexistente"], "field": "equipo",
            "value": "Equipo Propuesto", "confirm_suggestion": False,
        })
        assert invalid_selection.status_code == 422
        assert invalid_selection.json()["detail"] == "Selección de registros no válida"
        assert temp_db.import_staging.count_documents({"records.equipo": {"$ne": ""}}) == 0

        assigned = client.post("/api/inscription-imports/staging/ordinary-bulk-draft/bulk", json={
            "record_ids": record_ids, "field": "equipo", "value": "Equipo Propuesto",
            "confirm_suggestion": False,
        })
        assert assigned.status_code == 200
        stored = temp_db.import_staging.find_one({"id": "ordinary-bulk-draft"}, {"_id": 0})
        assert all(row["equipo"] == "Equipo Propuesto" and row.get("equipo_id") is None for row in stored["records"])
        changes = stored["audit"][-1]["detail"]["changes"]
        assert all("new_id" not in change and "previous_id" not in change for change in changes)

        temp_db.users.insert_one({
            "id": "ordinary-bulk-coach", "username": "ordinary_bulk_coach", "role": "coach",
            "active": True, "assigned_team_ids": [],
            "password_hash": server.pwd_context.hash("ordinary-bulk-coach-password"),
        })
        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json={
            "username": "ordinary_bulk_coach", "password": "ordinary-bulk-coach-password",
        }).status_code == 200
        denied = client.post("/api/inscription-imports/staging/ordinary-bulk-draft/bulk", json={
            "record_ids": record_ids, "field": "equipo", "value": "Equipo No Autorizado",
            "confirm_suggestion": True,
        })
        assert denied.status_code == 403
        unchanged = temp_db.import_staging.find_one({"id": "ordinary-bulk-draft"}, {"_id": 0})
        assert all(row["equipo"] == "Equipo Propuesto" for row in unchanged["records"])

    mongo.drop_database(db_name); mongo.close()
