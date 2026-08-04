import asyncio
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from authz import ROLE_PERMISSIONS, current_user_context, route_permission
from calendar_service import (
    aggregate_calendar_events, calendar_to_ical, next_calendar_event, subscription_capability,
)
from server import ensure_data_scope


TEAMS = [
    {"id": "team-a", "nombre": "A", "categoria": "Alevín", "temporada": "2026-2027"},
    {"id": "team-b", "nombre": "B", "categoria": "Infantil", "temporada": "2026-2027"},
]
MATCHES = [{"id": "m1", "fecha": "2026-07-20", "hora": "10:00", "equipo_id": "team-a", "rival": "Rival"}]
TRAININGS = [{"id": "t1", "fecha": "2026-07-19", "hora": "18:00", "equipo_id": "team-a", "campo": "Campo"}]
CLUB_EVENTS = [
    {"id": "e1", "tipo": "meeting", "titulo": "Reunión", "fecha": "2026-07-18", "equipo_id": "team-a"},
    {"id": "e2", "tipo": "club_event", "titulo": "Fiesta", "fecha": "2026-07-21", "equipo_id": None},
]


def test_aggregates_existing_sources_without_duplication():
    events = aggregate_calendar_events(MATCHES, TRAININGS, CLUB_EVENTS, TEAMS)
    assert [event["id"] for event in events] == ["club_event:e1", "training:t1", "match:m1", "club_event:e2"]
    assert {event["source"] for event in events} == {"match", "training", "club_event"}


def test_calendar_preserves_the_best_existing_match_location():
    matches = [{**MATCHES[0], "campo": "Campo A", "direccion_campo": "Calle Mayor 1",
                "latitud": 43.257, "longitud": -2.923}]
    event = aggregate_calendar_events(matches, [], [], TEAMS)[0]
    assert event["lugar"] == "Calle Mayor 1"
    assert event["latitude"] == 43.257
    assert event["longitude"] == -2.923


def test_filters_period_team_category_season_and_type():
    events = aggregate_calendar_events(MATCHES, TRAININGS, CLUB_EVENTS, TEAMS, start="2026-07-19", end="2026-07-20", team_id="team-a", category="Alevín", season="2026-2027")
    assert [event["tipo"] for event in events] == ["training", "match"]
    assert aggregate_calendar_events(MATCHES, TRAININGS, CLUB_EVENTS, TEAMS, event_type="meeting")[0]["titulo"] == "Reunión"


def test_next_event_uses_all_calendar_sources():
    events = aggregate_calendar_events(MATCHES, TRAININGS, CLUB_EVENTS, TEAMS)
    result = next_calendar_event(events, datetime(2026, 7, 17, tzinfo=timezone.utc))
    assert result["tipo"] == "meeting"


def test_ical_is_valid_authenticated_export_content():
    content = calendar_to_ical(aggregate_calendar_events(MATCHES, TRAININGS, CLUB_EVENTS, TEAMS))
    assert content.startswith("BEGIN:VCALENDAR\r\n") and content.endswith("END:VCALENDAR\r\n")
    assert content.count("BEGIN:VEVENT") == 4
    assert "SUMMARY:Reunión" in content and "LOCATION:Campo" in content


def test_public_subscription_is_only_prepared_not_enabled():
    assert subscription_capability() == {"enabled": False, "public_url": None, "token_required": True, "revocable": True}


@pytest.mark.parametrize("role,actions", [
    ("admin", {"read", "create", "edit", "delete", "export"}),
    ("coordinator", {"read", "create", "edit", "delete", "export"}),
    ("coach", {"read", "create", "edit", "delete", "export"}),
    ("family", {"read", "export"}),
    ("player", {"read", "export"}),
])
def test_calendar_permissions_by_role(role, actions):
    assert actions <= ROLE_PERMISSIONS[role]["calendar"]
    if role in {"family", "player"}:
        assert not ({"create", "edit", "delete"} & ROLE_PERMISSIONS[role]["calendar"])


def test_ical_route_requires_export_permission():
    request = Request({"type": "http", "method": "GET", "scheme": "https", "server": ("test", 443),
                       "client": ("test", 1), "path": "/api/calendar/export.ics", "query_string": b"", "headers": []})
    assert route_permission(request) == ("calendar", "export")


def test_coach_cannot_manipulate_event_team_identifier():
    token = current_user_context.set({"id": "coach", "role": "coach", "active": True, "assigned_team_ids": ["team-a"]})
    try:
        with pytest.raises(HTTPException) as error:
            asyncio.run(ensure_data_scope("club_events", {"equipo_id": "team-b"}))
        assert error.value.status_code == 403
    finally:
        current_user_context.reset(token)
