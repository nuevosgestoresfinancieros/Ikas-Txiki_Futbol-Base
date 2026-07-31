"""Integración real de la biblioteca contra una base MongoDB temporal y aislada."""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest
import requests
from passlib.context import CryptContext
from pymongo import MongoClient


BACKEND = Path(__file__).resolve().parents[1]


def authenticated(base: str, username: str, password: str) -> requests.Session:
    session = requests.Session()
    response = session.post(f"{base}/api/auth/login", json={"username": username, "password": password}, timeout=5)
    assert response.status_code == 200, response.text
    token = response.cookies.get("ikastxiki_session")
    session.cookies.clear()
    session.cookies.set("ikastxiki_session", token, secure=False, path="/")
    return session


@pytest.fixture(scope="module")
def exercise_api():
    mongo_url = os.environ.get("EXERCISE_MONGO_URL")
    if not mongo_url:
        pytest.skip("Requiere EXERCISE_MONGO_URL apuntando a MongoDB temporal")
    db_name = "ikastxiki_exercise_library_integration"
    mongo = MongoClient(mongo_url, serverSelectionTimeoutMS=2000)
    mongo.drop_database(db_name)
    db = mongo[db_name]
    password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    db.teams.insert_many([
        {"id": "team-own", "nombre": "Equipo propio", "categoria": "Alevín", "estado": "activo"},
        {"id": "team-other", "nombre": "Equipo ajeno", "categoria": "Cadete", "estado": "activo"},
    ])
    db.users.insert_many([
        {"id": "coach", "username": "exercise_coach", "password_hash": password_context.hash("coach-fictitious-password"),
         "role": "coach", "active": True, "account_status": "active", "assigned_team_ids": ["team-own"], "session_version": 0},
        {"id": "family", "username": "exercise_family", "password_hash": password_context.hash("family-fictitious-password"),
         "role": "family", "active": True, "account_status": "active", "family_id": "family", "session_version": 0},
    ])
    port = 18150
    environment = {
        **os.environ, "MONGO_URL": mongo_url, "DB_NAME": db_name,
        "JWT_SECRET": "exercise-integration-fictitious-secret-000000000",
        "ADMIN_USER": "exercise_admin", "ADMIN_PASSWORD": "exercise-admin-fictitious-password",
        "CORS_ORIGINS": f"http://127.0.0.1:{port}",
    }
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=BACKEND, env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    base = f"http://127.0.0.1:{port}"
    for _ in range(100):
        try:
            if requests.get(f"{base}/api/public/branding", timeout=.2).status_code == 200:
                break
        except requests.RequestException:
            time.sleep(.1)
    else:
        process.terminate()
        raise RuntimeError("El backend temporal no arrancó")
    sessions = {
            "base": base, "db": db,
            "admin": authenticated(base, "exercise_admin", "exercise-admin-fictitious-password"),
            "coach": authenticated(base, "exercise_coach", "coach-fictitious-password"),
            "family": authenticated(base, "exercise_family", "family-fictitious-password"),
        }
    try:
        yield sessions
    finally:
        for name in ("admin", "coach", "family"):
            sessions[name].close()
        process.terminate()
        process.wait(timeout=8)
        mongo.drop_database(db_name)
        mongo.close()


def exercise_payload(**changes):
    return {
        "name": "Rondo de integración", "category": "possession", "objective": "Conservar",
        "description": "Datos exclusivamente ficticios", "recommended_duration": 15,
        "intensity": "medium", "visibility": "club", "team_ids": [], **changes,
    }


def test_admin_crud_duplicate_archive_restore_search_and_pagination(exercise_api):
    client = exercise_api["admin"]
    created = client.post(f"{exercise_api['base']}/api/exercises", json=exercise_payload()).json()
    assert created["id"] and created["status"] == "active"
    edited = client.put(f"{exercise_api['base']}/api/exercises/{created['id']}", json=exercise_payload(objective="Circular")).json()
    assert edited["objective"] == "Circular"
    duplicate = client.post(f"{exercise_api['base']}/api/exercises/{created['id']}/duplicate")
    assert duplicate.status_code == 200 and duplicate.json()["name"].endswith("(copia)")
    assert client.post(f"{exercise_api['base']}/api/exercises/{created['id']}/archive").json()["status"] == "archived"
    assert client.post(f"{exercise_api['base']}/api/exercises/{created['id']}/restore").json()["status"] == "active"
    listing = client.get(f"{exercise_api['base']}/api/exercises", params={"search": "Rondo", "page": 1, "page_size": 1}).json()
    assert listing["total"] == 2 and len(listing["items"]) == 1


def test_coach_scope_and_family_player_style_denial(exercise_api):
    coach = exercise_api["coach"]
    own = coach.post(f"{exercise_api['base']}/api/exercises", json=exercise_payload(
        name="Ejercicio propio", visibility="teams", team_ids=["team-own"],
    ))
    assert own.status_code == 200
    outside = coach.post(f"{exercise_api['base']}/api/exercises", json=exercise_payload(
        name="Ejercicio manipulado", visibility="teams", team_ids=["team-other"],
    ))
    assert outside.status_code == 403
    assert exercise_api["family"].get(f"{exercise_api['base']}/api/exercises").status_code == 403


def test_planning_evaluation_template_duplicate_and_statistics(exercise_api):
    client = exercise_api["admin"]
    exercise = client.post(f"{exercise_api['base']}/api/exercises", json=exercise_payload(name="Técnica planificada")).json()
    template = client.post(f"{exercise_api['base']}/api/training-templates", json={
        "name": "Plantilla ficticia", "visibility": "club", "team_ids": [],
        "planned_exercises": [{"exercise_id": exercise["id"], "planned_duration": 12}],
    })
    assert template.status_code == 200
    training = client.post(f"{exercise_api['base']}/api/trainings", json={
        "fecha": "2026-08-03", "equipo_id": "team-own", "asistencia": [],
        "planned_exercises": [{"exercise_id": exercise["id"], "planned_duration": 12}],
    }).json()
    assert training["planned_exercises"][0]["snapshot"]["name"] == "Técnica planificada"
    invalid = client.put(f"{exercise_api['base']}/api/trainings/{training['id']}", json={
        **training, "planned_exercises": [{"exercise_id": exercise["id"], "completed": False}],
    })
    assert invalid.status_code == 422
    valid = client.put(f"{exercise_api['base']}/api/trainings/{training['id']}", json={
        **training, "planned_exercises": [{
            "exercise_id": exercise["id"], "planned_duration": 12, "completed": True,
            "actual_duration": 10, "rating": "good",
        }],
    })
    assert valid.status_code == 200
    duplicate = client.post(f"{exercise_api['base']}/api/trainings/{training['id']}/duplicate", json={"fecha": "2026-08-04"})
    assert duplicate.status_code == 200 and duplicate.json()["planned_exercises"][0]["completed"] is None
    stats = client.get(f"{exercise_api['base']}/api/exercises/statistics").json()
    row = next(item for item in stats["exercises"] if item["exercise_id"] == exercise["id"])
    assert row["planned_count"] == 2 and row["completed_count"] == 1


def test_legacy_training_text_remains_untouched(exercise_api):
    exercise_api["db"].trainings.insert_one({
        "id": "historical", "equipo_id": "team-own", "ejercicios": "Texto histórico intacto",
    })
    response = exercise_api["admin"].get(f"{exercise_api['base']}/api/trainings/historical")
    assert response.status_code == 200
    assert response.json()["ejercicios"] == "Texto histórico intacto"
    assert not response.json().get("planned_exercises")


def test_audit_contains_actions_but_no_sensitive_fields(exercise_api):
    events = list(exercise_api["db"].internal_events.find({"type": {"$regex": "^exercise\\."}}, {"_id": 0}))
    assert {event["type"] for event in events} >= {"exercise.created", "exercise.updated", "exercise.archived", "exercise.restored", "exercise.assigned"}
    serialized = str(events).casefold()
    assert not any(field in serialized for field in ("password", "token", "cookie", "authorization"))
