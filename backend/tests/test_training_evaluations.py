import pytest
from fastapi import HTTPException
from starlette.requests import Request

import server
from authz import ROLE_PERMISSIONS, current_user_context, route_permission


def evaluation_context(attendance="presente"):
    return {
        "actor": {"id": "coach-1", "role": "coach"},
        "training": {"id": "training-1", "fecha": "2026-08-01"},
        "team": {"id": "team-1", "nombre": "Alevín A", "categoria": "Alevín", "temporada": "2026-2027"},
        "player": {"id": "player-1", "equipo_id": "team-1"},
        "attendance": {"player_id": "player-1", "estado": attendance},
    }


def test_only_staff_have_training_evaluation_permissions():
    assert "training-evaluations" in ROLE_PERMISSIONS["admin"]
    for role in ("admin", "coordinator", "coach"):
        assert ROLE_PERMISSIONS[role]["training-evaluations"] >= {"read", "create", "edit"}
    assert all("training-evaluations" not in ROLE_PERMISSIONS[role] for role in ("family", "player"))


@pytest.mark.parametrize("method,path,expected", [
    ("GET", "/api/training-evaluations/training/training-1", ("training-evaluations", "read")),
    ("POST", "/api/training-evaluations", ("training-evaluations", "create")),
    ("PUT", "/api/training-evaluations/evaluation-1", ("training-evaluations", "edit")),
    ("POST", "/api/training-evaluations/evaluation-1/close", ("training-evaluations", "edit")),
])
def test_training_evaluation_routes_use_dedicated_permission(method, path, expected):
    request = Request({"type": "http", "method": method, "path": path, "headers": []})
    assert route_permission(request) == expected


def test_scores_are_limited_to_one_to_five_and_absence_never_gets_scores():
    with pytest.raises(ValueError):
        server.TrainingEvaluationPayload(training_id="t", player_id="p", participacion=6)
    with pytest.raises(ValueError):
        server.TrainingEvaluationPayload(training_id="t", player_id="p", fecha_evaluacion="not-a-date")
    payload = server.TrainingEvaluationPayload(training_id="t", player_id="p", asistencia="presente", participacion=4)
    with pytest.raises(HTTPException) as denied:
        server._validate_evaluation_values(payload.model_dump(), "lesion")
    assert denied.value.status_code == 422
    assert "ausente" in denied.value.detail


def test_completion_requires_all_criteria_and_document_uses_registered_attendance():
    payload = server.TrainingEvaluationPayload(
        training_id="training-1", player_id="player-1", asistencia="presente", estado="draft", participacion=4,
    )
    incomplete = {**payload.model_dump(), "estado": "completed"}
    with pytest.raises(HTTPException) as denied:
        server._validate_evaluation_values(incomplete, "presente", require_complete=True)
    assert denied.value.status_code == 422

    complete = server.TrainingEvaluationPayload(
        training_id="training-1", player_id="player-1", asistencia="justificada", estado="draft",
        observaciones="  Nota interna  ",
    )
    token = current_user_context.set({"id": "coach-1", "role": "coach"})
    try:
        document = server._evaluation_document(complete, evaluation_context("justificada"), {"id": "coach-1", "role": "coach"})
    finally:
        current_user_context.reset(token)
    assert document["asistencia"] == "justificada"
    assert document["temporada"] == "2026-2027"
    assert document["evaluador_id"] == "coach-1"
    assert document["observaciones"] == "Nota interna"
    assert all(document[field] is None for field in server.EVALUATION_SCORE_FIELDS)


def test_close_is_only_allowed_after_explicit_complete_data():
    data = {field: 3 for field in server.EVALUATION_SCORE_FIELDS}
    server._validate_evaluation_values({**data, "estado": "closed"}, "presente", require_complete=True)
