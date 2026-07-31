import os

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27039")
os.environ.setdefault("DB_NAME", "ikastxiki_exercise_library_test")
os.environ.setdefault("JWT_SECRET", "exercise-library-fictitious-secret-000000000000")
os.environ.setdefault("ADMIN_USER", "exercise_admin")
os.environ.setdefault("ADMIN_PASSWORD", "exercise-admin-fictitious-password")

import server
from authz import has_permission, route_permission
from exercise_service import (
    ExerciseValidationError, exercise_snapshot, exercise_statistics, normalize_exercise,
    normalize_planned_exercises, normalize_template,
)


EXERCISES = {
    "ex-1": {
        "id": "ex-1", "name": "Rondo ficticio", "category": "possession",
        "objective": "Conservar", "description": "Descripción ficticia",
        "recommended_duration": 15, "status": "active",
    },
    "ex-2": {
        "id": "ex-2", "name": "Finalización ficticia", "category": "finishing",
        "objective": "Finalizar", "description": "Descripción ficticia",
        "recommended_duration": 10, "status": "archived",
    },
}


def valid_exercise(**changes):
    return {
        "name": "Rondo ficticio", "category": "possession", "objective": "Conservar",
        "description": "Descripción ficticia", "instructions": ["Uno", "Dos"],
        "recommended_duration": 15, "min_players": 4, "max_players": 12,
        "materials": ["Balones"], "intensity": "medium", "recommended_space": "20x20",
        "safety_notes": "Sin datos personales", "visibility": "private", "team_ids": [],
        **changes,
    }


def test_normalizes_complete_exercise_and_preserves_extendable_other_category():
    result = normalize_exercise(valid_exercise(category="other"))
    assert result["category"] == "other"
    assert result["instructions"] == ["Uno", "Dos"]
    assert result["recommended_duration"] == 15


@pytest.mark.parametrize("field,value", [
    ("category", "invented"), ("intensity", "extreme"), ("visibility", "public"),
])
def test_rejects_invalid_catalog_values(field, value):
    with pytest.raises(ExerciseValidationError):
        normalize_exercise(valid_exercise(**{field: value}))


def test_rejects_incoherent_player_limits_and_team_visibility_without_teams():
    with pytest.raises(ExerciseValidationError):
        normalize_exercise(valid_exercise(min_players=20, max_players=10))
    with pytest.raises(ExerciseValidationError):
        normalize_exercise(valid_exercise(visibility="teams", team_ids=[]))


def test_planning_creates_minimal_snapshot_and_accessible_order():
    rows = normalize_planned_exercises([
        {"exercise_id": "ex-1", "planned_duration": 20, "completed": None},
    ], EXERCISES)
    assert rows == [{
        "exercise_id": "ex-1",
        "snapshot": {"name": "Rondo ficticio", "category": "possession", "objective": "Conservar"},
        "planned_duration": 20, "order": 1, "completed": None, "actual_duration": None,
        "rating": None, "observation": None, "not_completed_reason": None,
    }]


def test_archived_exercise_cannot_be_newly_planned_but_can_remain_historical():
    with pytest.raises(ExerciseValidationError):
        normalize_planned_exercises([{"exercise_id": "ex-2"}], EXERCISES)
    result = normalize_planned_exercises([{"exercise_id": "ex-2"}], EXERCISES, allow_archived_existing=True)
    assert result[0]["exercise_id"] == "ex-2"


def test_non_performed_exercise_requires_reason_and_rating_is_validated():
    with pytest.raises(ExerciseValidationError):
        normalize_planned_exercises([{"exercise_id": "ex-1", "completed": False}], EXERCISES)
    result = normalize_planned_exercises([{
        "exercise_id": "ex-1", "completed": False, "not_completed_reason": "Lluvia",
    }], EXERCISES)
    assert result[0]["not_completed_reason"] == "Lluvia"
    with pytest.raises(ExerciseValidationError):
        normalize_planned_exercises([{"exercise_id": "ex-1", "rating": "excellent"}], EXERCISES)


def test_duplicate_or_manipulated_exercise_ids_are_rejected():
    with pytest.raises(ExerciseValidationError):
        normalize_planned_exercises([{"exercise_id": "missing"}], EXERCISES)
    with pytest.raises(ExerciseValidationError):
        normalize_planned_exercises([{"exercise_id": "ex-1"}, {"exercise_id": "ex-1"}], EXERCISES)


def test_template_has_independent_snapshots_and_valid_scope():
    template = normalize_template({
        "name": "Sesión ficticia", "description": "Prueba", "visibility": "teams",
        "team_ids": ["team-own"], "planned_exercises": [{"exercise_id": "ex-1"}],
    }, EXERCISES)
    assert template["planned_exercises"][0]["snapshot"] == exercise_snapshot(EXERCISES["ex-1"])
    assert template["team_ids"] == ["team-own"]


def test_statistics_calculate_usage_completion_minutes_ratings_and_omissions():
    stats = exercise_statistics(list(EXERCISES.values()), [{
        "equipo_id": "team-own", "temporada": "2026-2027",
        "planned_exercises": [
            {"exercise_id": "ex-1", "planned_duration": 15, "completed": True, "actual_duration": 12, "rating": "very_good"},
        ],
    }, {
        "equipo_id": "team-own", "temporada": "2026-2027",
        "planned_exercises": [
            {"exercise_id": "ex-1", "planned_duration": 10, "completed": False, "rating": "needs_improvement"},
        ],
    }])
    row = stats["exercises"][0]
    assert row["planned_count"] == 2
    assert row["completed_count"] == 1
    assert row["completion_rate"] == 50
    assert row["planned_minutes"] == 25
    assert row["actual_minutes"] == 12
    assert row["average_rating"] == 3
    assert row["omitted_count"] == 1


@pytest.mark.parametrize("role,may_manage", [
    ("admin", True), ("coordinator", True), ("coach", True), ("family", False), ("player", False),
])
def test_five_roles_have_expected_exercise_permissions(role, may_manage):
    user = {"role": role, "active": True}
    assert has_permission(user, "exercises", "create") is may_manage
    assert has_permission(user, "exercises", "edit") is may_manage


def test_team_scope_and_private_authorship_are_enforced_for_management():
    coach = {"id": "coach", "role": "coach", "assigned_team_ids": ["team-own"]}
    assert server.can_manage_exercise(coach, {"author_id": "coach", "team_ids": []})
    assert server.can_manage_exercise(coach, {"author_id": "other", "team_ids": ["team-own"]})
    assert not server.can_manage_exercise(coach, {"author_id": "other", "team_ids": ["team-other"]})


def test_training_model_preserves_legacy_free_text_without_forced_conversion():
    training = server.Training(ejercicios="Texto histórico que no debe convertirse")
    dumped = training.model_dump()
    assert dumped["ejercicios"] == "Texto histórico que no debe convertirse"
    assert dumped["planned_exercises"] == []


def test_routes_use_dedicated_rbac_resource():
    class URL:
        path = "/api/exercises"
    class Request:
        url = URL()
        method = "POST"
    assert route_permission(Request()) == ("exercises", "create")
