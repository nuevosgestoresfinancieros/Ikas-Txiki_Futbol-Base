import importlib
import os
import sys
import uuid

import pytest
from pymongo import MongoClient
from fastapi.testclient import TestClient


MONGO_URL = os.environ.get("PHASE2_MONGO_URL")
pytestmark = pytest.mark.skipif(not MONGO_URL, reason="requiere PHASE2_MONGO_URL temporal")


def _complete_scores():
    return {
        "participacion": 4, "actitud": 4, "esfuerzo": 5,
        "comprension_tactica": 3, "tecnica": 4, "condicion_fisica": 3,
    }


def test_training_evaluations_api_is_scoped_atomic_and_audited(monkeypatch, request):
    db_name = f"ikas_txiki_phase2_eval_{uuid.uuid4().hex[:10]}"
    monkeypatch.setenv("MONGO_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("JWT_SECRET", "phase2-evaluation-local-secret-000000000000")
    monkeypatch.setenv("ADMIN_USER", "phase2_admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "phase2-admin-local-password")
    monkeypatch.setenv("CORS_ORIGINS", "https://testserver")
    monkeypatch.setenv("SMTP_HOST", "")
    monkeypatch.setenv("WHATSAPP_PROVIDER_URL", "")
    monkeypatch.setenv("SMS_PROVIDER_URL", "")

    sys.modules.pop("server", None)
    server = importlib.import_module("server")
    request.addfinalizer(lambda: sys.modules.pop("server", None))
    mongo = MongoClient(MONGO_URL)
    database = mongo[db_name]
    mongo.drop_database(db_name)
    database.teams.insert_one({
        "id": "phase2-team", "nombre": "Equipo Ficticio", "categoria": "Alevín",
        "temporada": "2026-2027", "modalidad": "F7", "estado": "activo",
    })
    database.players.insert_one({
        "id": "phase2-player", "nombre": "Jugador", "apellidos": "Ficticio",
        "equipo_id": "phase2-team", "estado": "activo",
    })
    database.players.insert_one({
        "id": "phase2-outsider", "nombre": "Fuera", "apellidos": "Ámbito",
        "equipo_id": "other-team", "estado": "activo",
    })
    database.players.insert_one({
        "id": "phase2-player-2", "nombre": "Segundo", "apellidos": "Ficticio",
        "equipo_id": "phase2-team", "estado": "activo",
    })
    database.trainings.insert_one({
        "id": "phase2-training", "fecha": "2026-08-01", "equipo_id": "phase2-team",
        "asistencia": [{"player_id": "phase2-player", "estado": "presente"}],
    })
    database.trainings.insert_one({
        "id": "phase2-training-absent", "fecha": "2026-08-02", "equipo_id": "phase2-team",
        "asistencia": [{"player_id": "phase2-player", "estado": "lesion"}],
    })
    database.trainings.insert_one({
        "id": "phase2-training-bulk", "fecha": "2026-08-03", "equipo_id": "phase2-team",
        "asistencia": [
            {"player_id": "phase2-player", "estado": "presente"},
            {"player_id": "phase2-player-2", "estado": "presente"},
        ],
    })
    database.users.insert_one({
        "id": "phase2-coach", "username": "phase2_coach", "role": "coach", "active": True,
        "assigned_team_ids": ["phase2-team"], "password_hash": server.pwd_context.hash("phase2-coach-password"),
    })
    database.users.insert_one({
        "id": "phase2-family", "username": "phase2_family", "role": "family", "active": True,
        "family_id": "family-phase2", "password_hash": server.pwd_context.hash("phase2-family-password"),
    })

    with TestClient(server.app, base_url="https://testserver") as client:
        assert client.post("/api/auth/login", json={"username": "phase2_admin", "password": "phase2-admin-local-password"}).status_code == 200
        listing = client.get("/api/training-evaluations/training/phase2-training")
        assert listing.status_code == 200
        assert listing.json()["summary"] == {"total": 2, "evaluated": 0, "pending": 2, "incomplete": 0, "absent": 0}

        payload = {
            "training_id": "phase2-training", "player_id": "phase2-player", "asistencia": "presente",
            "estado": "draft", "observaciones": "Nota interna", **_complete_scores(),
        }
        created = client.post("/api/training-evaluations", json=payload)
        assert created.status_code == 200
        evaluation_id = created.json()["id"]
        assert client.post("/api/training-evaluations", json=payload).status_code == 409
        assert client.post(f"/api/training-evaluations/{evaluation_id}/close").status_code == 200
        assert client.put(f"/api/training-evaluations/{evaluation_id}", json=payload).status_code == 409

        absent = client.post("/api/training-evaluations", json={
            "training_id": "phase2-training-absent", "player_id": "phase2-player", "asistencia": "lesion",
            "participacion": 4,
        })
        assert absent.status_code == 422
        assert database.training_evaluations.count_documents({"training_id": "phase2-training-absent"}) == 0

        bulk_row = lambda player_id: {
            "training_id": "phase2-training-bulk", "player_id": player_id,
            "asistencia": "presente", "estado": "draft", **_complete_scores(),
        }
        bulk = client.post("/api/training-evaluations/bulk", json={
            "training_id": "phase2-training-bulk",
            "evaluations": [bulk_row("phase2-player"), bulk_row("phase2-player-2")],
        })
        assert bulk.status_code == 200 and bulk.json()["count"] == 2
        duplicate_bulk = client.post("/api/training-evaluations/bulk", json={
            "training_id": "phase2-training-bulk",
            "evaluations": [bulk_row("phase2-player"), bulk_row("phase2-player")],
        })
        assert duplicate_bulk.status_code == 422
        assert database.training_evaluations.count_documents({"training_id": "phase2-training-bulk"}) == 2

        history = client.get("/api/training-evaluations/player/phase2-player")
        assert history.status_code == 200
        assert history.json()["evaluations"][0]["evaluador_role"] == "admin"
        audit_types = {row["type"] for row in database.internal_events.find({"evaluation_id": evaluation_id})}
        assert {"training_evaluation.created", "training_evaluation.closed"}.issubset(audit_types)

        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json={"username": "phase2_family", "password": "phase2-family-password"}).status_code == 200
        assert client.get("/api/training-evaluations/training/phase2-training").status_code == 403

        client.post("/api/auth/logout")
        assert client.post("/api/auth/login", json={"username": "phase2_coach", "password": "phase2-coach-password"}).status_code == 200
        assert client.get("/api/training-evaluations/training/phase2-training").status_code == 200
        assert client.post("/api/training-evaluations", json={
            "training_id": "phase2-training", "player_id": "phase2-outsider", "asistencia": "presente",
        }).status_code == 422

    assert database.training_evaluations.count_documents({"training_id": "phase2-training"}) == 1
    mongo.drop_database(db_name)
    mongo.close()
