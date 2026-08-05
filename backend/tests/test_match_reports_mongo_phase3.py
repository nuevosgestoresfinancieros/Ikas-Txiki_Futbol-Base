import importlib
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient


MONGO_URL = os.environ.get("PHASE3_MATCH_MONGO_URL")
pytestmark = pytest.mark.skipif(not MONGO_URL, reason="requiere PHASE3_MATCH_MONGO_URL temporal")


def _login(client, username, password):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text


def _starter(player_id, minutes=60, periods=None, goals=0):
    return {
        "player_id": player_id, "called_up": True, "role": "starter", "played": True,
        "minutes": minutes, "period_ids": periods or ["T1", "T2", "T3"],
        "entries": 0, "exits": 0, "changes": [], "goals": goals, "own_goals": 0,
        "incidents": [], "internal_notes": "Observación interna de prueba", "origin": "manual",
    }


def test_match_reports_are_scoped_versioned_audited_and_never_duplicate(monkeypatch, request):
    db_name = f"ikas_txiki_phase3_match_{uuid.uuid4().hex[:10]}"
    monkeypatch.setenv("MONGO_URL", MONGO_URL)
    monkeypatch.setenv("DB_NAME", db_name)
    monkeypatch.setenv("JWT_SECRET", "phase3-match-local-secret-000000000000")
    monkeypatch.setenv("ADMIN_USER", "phase3_admin")
    monkeypatch.setenv("ADMIN_PASSWORD", "phase3-admin-local-password")
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
    database.settings.insert_one({
        "id": "global",
        "modalities": [entry.model_dump(mode="json") for entry in server.catalog_from_settings({})],
    })
    database.teams.insert_many([
        {"id": "team-f7", "nombre": "Equipo F7", "categoria": "Alevín", "temporada": "2026-2027", "modalidad": "F7", "estado": "activo"},
        {"id": "team-f11", "nombre": "Equipo F11", "categoria": "Cadete", "temporada": "2026-2027", "modalidad": "F11", "estado": "activo"},
    ])
    database.players.insert_many([
        {"id": "p1", "nombre": "Uno", "apellidos": "Prueba", "equipo_id": "team-f7", "estado": "activo"},
        {"id": "p2", "nombre": "Dos", "apellidos": "Prueba", "equipo_id": "team-f7", "estado": "activo"},
        {"id": "outsider", "nombre": "Fuera", "apellidos": "Equipo", "equipo_id": "team-f11", "estado": "activo"},
    ])
    database.matches.insert_many([
        {"id": "match-f7", "temporada": "2026-2027", "fecha": "2026-08-10", "equipo_id": "team-f7", "rival": "Rival F7", "condicion": "local", "tipo": "liga", "estado": "jugado", "resultado_propio": 1, "resultado_rival": 0},
        {"id": "match-no-callup", "temporada": "2026-2027", "fecha": "2026-08-11", "equipo_id": "team-f7", "rival": "Sin convocatoria", "condicion": "visitante", "tipo": "amistoso", "estado": "programado"},
        {"id": "match-f11", "temporada": "2026-2027", "fecha": "2026-08-12", "equipo_id": "team-f11", "rival": "Rival F11", "condicion": "local", "tipo": "liga", "estado": "programado"},
    ])
    database.callups.insert_one({
        "id": "callup-f7", "match_id": "match-f7", "equipo_id": "team-f7",
        "convocados": [
            {"player_id": "p1", "estado": "confirmed"},
            {"player_id": "p2", "estado": "pending"},
        ],
    })
    database.users.insert_many([
        {"id": "coach-in", "username": "coach_in", "role": "coach", "active": True,
         "assigned_team_ids": ["team-f7"], "password_hash": server.pwd_context.hash("coach-in-password")},
        {"id": "coach-out", "username": "coach_out", "role": "coach", "active": True,
         "assigned_team_ids": ["team-f11"], "password_hash": server.pwd_context.hash("coach-out-password")},
        {"id": "coordinator", "username": "coordinator", "role": "coordinator", "active": True,
         "assigned_team_ids": ["team-f7"], "password_hash": server.pwd_context.hash("coordinator-password")},
        {"id": "family", "username": "family", "role": "family", "active": True,
         "family_id": "family-1", "password_hash": server.pwd_context.hash("family-password")},
        {"id": "player", "username": "player", "role": "player", "active": True,
         "player_id": "p1", "password_hash": server.pwd_context.hash("player-password")},
    ])

    with TestClient(server.app, base_url="https://testserver") as client:
        assert client.get("/api/match-reports/match/match-f7").status_code == 401
        _login(client, "phase3_admin", "phase3-admin-local-password")
        empty = client.get("/api/match-reports/match/match-f7")
        assert empty.status_code == 200 and empty.json()["report"] is False
        assert empty.json()["configuration"]["total_minutes"] == 60
        assert empty.json()["callup"]["count"] == 2

        created = client.post("/api/match-reports/match/match-f7")
        assert created.status_code == 200
        assert client.post("/api/match-reports/match/match-f7").status_code == 409
        assert database.match_reports.count_documents({"match_id": "match-f7"}) == 1
        report = created.json()
        assert report["version"] == 1 and report["status"] == "draft"
        assert all(not row["played"] for row in report["participants"])

        invalid_outsider = client.put("/api/match-reports/match/match-f7", json={
            "version": 1, "participants": [_starter("outsider")],
        })
        assert invalid_outsider.status_code == 422
        assert database.match_reports.find_one({"match_id": "match-f7"})["version"] == 1

        saved = client.put("/api/match-reports/match/match-f7", json={
            "version": 1,
            "participants": [
                _starter("p1", goals=1),
                {**_starter("p2", minutes=20, periods=["T3"]), "role": "substitute", "entries": 1},
            ],
            "substitutions": [{
                "incoming_player_id": "p2", "outgoing_player_id": "p1", "period_id": "T3", "minute": 40,
            }],
            "goal_events": [{
                "kind": "player", "scorer_player_id": "p1", "period_id": "T2", "minute": 25,
            }],
            "internal_notes": "Acta interna",
        })
        assert saved.status_code == 200, saved.text
        assert saved.json()["version"] == 2
        assert client.put("/api/match-reports/match/match-f7", json={
            "version": 1, "participants": [_starter("p1")],
        }).status_code == 409

        validation = client.post("/api/match-reports/match/match-f7/validate")
        assert validation.status_code == 200 and validation.json()["errors"] == []
        closed = client.post("/api/match-reports/match/match-f7/close", json={
            "version": 2, "confirm_warnings": False,
        })
        assert closed.status_code == 200 and closed.json()["status"] == "closed"
        repeated_close = client.post("/api/match-reports/match/match-f7/close", json={
            "version": 2, "confirm_warnings": False,
        })
        assert repeated_close.status_code == 200 and repeated_close.json()["version"] == 3
        exported = client.get("/api/match-reports/match/match-f7/export.pdf?lang=eu")
        assert exported.status_code == 200
        assert exported.headers["content-type"].startswith("application/pdf")
        assert exported.content.startswith(b"%PDF") and len(exported.content) > 1000
        assert b"Observaci" not in exported.content
        assert client.put("/api/match-reports/match/match-f7", json={
            "version": 3, "participants": [_starter("p1")],
        }).status_code == 409
        assert client.post("/api/match-reports/match/match-f7/reopen", json={"version": 3, "reason": ""}).status_code == 422

        history = client.get("/api/match-reports/match/match-f7/history")
        assert history.status_code == 200
        assert {row["action"] for row in history.json()["history"]} >= {"created", "updated", "closed"}
        updated_event = next(row for row in history.json()["history"] if row["action"] == "updated")
        assert updated_event["detail"]["player_changes"]
        p1_change = next(row for row in updated_event["detail"]["player_changes"] if row["player_id"] == "p1")
        assert p1_change["fields"]["goals"] == {"previous": 0, "new": 1}
        stats = client.get("/api/match-reports/statistics/objective?player_id=p1")
        assert stats.status_code == 200
        assert stats.json()["totals"]["goals"] == 1
        assert stats.json()["totals"]["played_matches"] == 1

        reopened = client.post("/api/match-reports/match/match-f7/reopen", json={
            "version": 3, "reason": "Corrección administrativa documentada",
        })
        assert reopened.status_code == 200 and reopened.json()["status"] == "reopened"
        assert reopened.json()["reopen_reason"] == "Corrección administrativa documentada"

        dry_run = client.post("/api/match-reports/import/dry-run", json={"rows": [
            {"match_id": "match-f7", "player_id": "p1", "minutes": 60},
            {"match_id": "unknown", "player_id": "p1", "minutes": 60},
        ]})
        assert dry_run.status_code == 200 and dry_run.json()["dry_run"] is True
        assert dry_run.json()["summary"]["errors"] == 1

        no_callup = client.get("/api/match-reports/match/match-no-callup")
        assert no_callup.status_code == 200 and "no tiene convocatoria" in no_callup.json()["setup_warning"]
        f11 = client.get("/api/match-reports/match/match-f11")
        assert f11.status_code == 200 and f11.json()["configuration"]["total_minutes"] == 90

        client.post("/api/auth/logout")
        _login(client, "coach_in", "coach-in-password")
        assert client.get("/api/match-reports/match/match-f7").status_code == 200
        assert client.get("/api/match-reports/match/match-f11").status_code == 404
        exceptional_minutes = _starter("p1", minutes=61)
        exceptional_minutes.update({"minutes_override_reason": "Corrección administrativa", "warning_confirmed": True})
        assert client.put("/api/match-reports/match/match-f7/participants/p1", json={
            "version": 4, "participant": exceptional_minutes,
        }).status_code == 403
        assert database.match_reports.find_one({"match_id": "match-f7"})["version"] == 4
        assert client.post("/api/match-reports/match/match-f7/reopen", json={
            "version": 4, "reason": "No autorizado",
        }).status_code == 403

        client.post("/api/auth/logout")
        _login(client, "coordinator", "coordinator-password")
        assert client.get("/api/match-reports/match/match-f7").status_code == 200
        assert client.get("/api/match-reports/match/match-f11").status_code == 404

        for username, password in (("family", "family-password"), ("player", "player-password")):
            client.post("/api/auth/logout")
            _login(client, username, password)
            assert client.get("/api/match-reports/match/match-f7").status_code == 403

    audits = {row["type"] for row in database.internal_events.find({"match_id": "match-f7"})}
    assert {"match_report.created", "match_report.updated", "match_report.closed", "match_report.reopened", "match_report.exported"}.issubset(audits)
    mongo.drop_database(db_name)
    mongo.close()
