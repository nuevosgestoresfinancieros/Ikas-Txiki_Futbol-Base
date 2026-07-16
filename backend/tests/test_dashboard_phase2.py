from datetime import date, datetime, timezone

import pytest

from dashboard_service import next_activity, pending_callups, weekly_attendance


NOW = datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc)


@pytest.mark.parametrize(
    "matches,trainings,expected",
    [
        ([{"id": "m", "fecha": "2026-07-18", "hora": "10:00"}], [], "partido"),
        ([], [{"id": "t", "fecha": "2026-07-18", "hora": "09:00"}], "entrenamiento"),
        ([{"id": "m", "fecha": "2026-07-19", "hora": "10:00"}], [{"id": "t", "fecha": "2026-07-18", "hora": "09:00"}], "entrenamiento"),
        ([], [], None),
    ],
)
def test_next_activity_scenarios(matches, trainings, expected):
    result = next_activity(matches, trainings, NOW)
    assert (result or {}).get("tipo") == expected


def test_next_activity_ignores_past_events():
    assert next_activity([{"fecha": "2026-07-16", "hora": "10:00"}], [], NOW) is None


def test_weekly_attendance_can_limit_one_or_multiple_children():
    trainings = [{
        "fecha": "2026-07-16",
        "asistencia": [
            {"player_id": "one", "estado": "presente"},
            {"player_id": "two", "estado": "justificada"},
            {"player_id": "other", "estado": "injustificada"},
        ],
    }]
    one = weekly_attendance(trainings, {"one"}, date(2026, 7, 17))
    children = weekly_attendance(trainings, {"one", "two"}, date(2026, 7, 17))
    assert one["registros"] == 1 and one["porcentaje_presencia"] == 100
    assert children["registros"] == 2 and children["porcentaje_presencia"] == 50


def test_weekly_attendance_empty_collections():
    result = weekly_attendance([], set(), date(2026, 7, 17))
    assert result["registros"] == 0
    assert result["porcentaje_presencia"] == 0


def test_pending_callups_respects_player_scope():
    callups = [{
        "id": "c", "convocados": [
            {"player_id": "mine", "estado": "pendiente"},
            {"player_id": "other", "estado": "pendiente"},
        ],
    }]
    assert pending_callups(callups, {"mine"})["total"] == 1
    assert pending_callups(callups, {"mine", "other"})["total"] == 2
