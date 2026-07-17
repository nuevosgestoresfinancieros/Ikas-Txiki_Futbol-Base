from datetime import datetime

import pytest
from starlette.requests import Request

from attendance_service import (
    attendance_history, attendance_summary, attendance_trend, callup_attendance_comparison, player_percentages,
    repeated_absence_alerts,
)
from authz import ROLE_PERMISSIONS, route_permission


TRAININGS = [
    {"id": "t1", "fecha": "2026-07-06", "equipo_id": "a", "asistencia": [
        {"player_id": "one", "estado": "presente"}, {"player_id": "two", "estado": "injustificada"},
    ]},
    {"id": "t2", "fecha": "2026-07-13", "equipo_id": "a", "asistencia": [
        {"player_id": "one", "estado": "justificada"}, {"player_id": "two", "estado": "lesion"},
    ]},
    {"id": "t3", "fecha": "2026-07-14", "equipo_id": "b", "asistencia": [
        {"player_id": "other", "estado": "presente"},
    ]},
]


def test_summary_and_player_scope_do_not_leak_other_players():
    all_rows = attendance_summary(TRAININGS, {"one", "two"}, "2026-07-01", "2026-07-31")
    child = attendance_summary(TRAININGS, {"one"}, "2026-07-01", "2026-07-31")
    assert all_rows["registros"] == 4
    assert child == {**child, "presente": 1, "justificada": 1, "injustificada": 0, "lesion": 0, "registros": 2, "porcentaje_presencia": 50.0, "desde": "2026-07-01", "hasta": "2026-07-31"}


def test_weekly_and_monthly_trend_and_filters():
    monthly = attendance_trend(TRAININGS, {"one", "two"}, "monthly", "2026-07-01", "2026-07-31")
    weekly = attendance_trend(TRAININGS, {"one", "two"}, "weekly", "2026-07-01", "2026-07-31")
    assert len(monthly) == 1 and monthly[0]["registros"] == 4
    assert [entry["registros"] for entry in weekly] == [2, 2]
    assert set(player_percentages(TRAININGS, {"one"})) == {"one"}


def test_repeated_absence_alerts_and_injury_indicator():
    alerts = repeated_absence_alerts(TRAININGS, threshold=2, player_ids={"two"})
    assert alerts == [{"player_id": "two", "ausencias": 2, "lesiones": 1, "injustificadas": 1}]


def test_compares_linked_callup_response_with_actual_attendance():
    training = [{"callup_id": "c", "asistencia": [{"player_id": "one", "estado": "presente"}]}]
    callup = [{"id": "c", "convocados": [{"player_id": "one", "estado": "confirmed"}]}]
    assert callup_attendance_comparison(training, callup, {"one"}) == {"convocatoria_confirmed": 1, "asistencia_presente": 1}


def test_attendance_history_records_actor_reason_and_changes_only():
    actor = {"id": "coach-a", "role": "coach"}
    rows = attendance_history(
        [{"player_id": "one", "estado": "presente"}],
        [{"player_id": "one", "estado": "injustificada", "motivo": "Motivo"}], actor,
        at=datetime(2026, 7, 17, 12, 0),
    )
    assert rows[0]["previous_status"] == "presente"
    assert rows[0]["new_status"] == "injustificada"
    assert rows[0]["actor_id"] == "coach-a" and rows[0]["reason"] == "Motivo"
    assert attendance_history([{ "player_id": "one", "estado": "presente"}], [{"player_id": "one", "estado": "presente"}], actor) == []


@pytest.mark.parametrize("role,allowed", [
    ("admin", True), ("coordinator", True), ("coach", True), ("family", False), ("player", False),
])
def test_only_staff_can_edit_attendance(role, allowed):
    assert ("edit" in ROLE_PERMISSIONS[role].get("attendance", set())) is allowed


def test_attendance_exports_use_export_permission():
    request = Request({"type": "http", "method": "GET", "scheme": "https", "server": ("test", 443),
                       "client": ("test", 1), "path": "/api/attendance/export.pdf", "query_string": b"", "headers": []})
    assert route_permission(request) == ("attendance", "export")
