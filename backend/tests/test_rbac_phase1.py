import pytest
from starlette.requests import Request

from authz import (
    ROLE_PERMISSIONS, enforce_permission, enforce_related_scope, has_permission,
    merge_query, route_permission,
)


def user(role, active=True):
    return {"id": role, "username": role, "role": role, "active": active}


@pytest.mark.parametrize(
    "role,resource,action,allowed",
    [
        ("admin", "users", "administer", True),
        ("admin", "data", "delete", True),
        ("coordinator", "teams", "edit", True),
        ("coordinator", "users", "administer", False),
        ("coach", "trainings", "create", True),
        ("coach", "payments", "read", False),
        ("family", "payments", "read", True),
        ("family", "players", "edit", False),
        ("player", "stats", "read", True),
        ("player", "families", "read", False),
    ],
)
def test_permission_matrix_all_roles(role, resource, action, allowed):
    assert has_permission(user(role), resource, action) is allowed


@pytest.mark.parametrize("role", ROLE_PERMISSIONS)
def test_inactive_user_is_always_denied(role):
    assert not has_permission(user(role, active=False), "dashboard", "read")


def test_enforce_permission_returns_403_for_denied_action():
    with pytest.raises(Exception) as error:
        enforce_permission(user("family"), "settings", "administer")
    assert error.value.status_code == 403


@pytest.mark.parametrize(
    "method,path,expected",
    [
        ("GET", "/api/players", ("players", "read")),
        ("POST", "/api/trainings", ("trainings", "create")),
        ("PUT", "/api/callups/id", ("callups", "edit")),
        ("DELETE", "/api/payments/id", ("payments", "delete")),
        ("GET", "/api/authorizations/id/pdf", ("authorizations", "export")),
        ("POST", "/api/import-excel", ("data", "administer")),
        ("PUT", "/api/settings", ("settings", "administer")),
    ],
)
def test_route_permission_mapping(method, path, expected):
    request = Request({"type": "http", "method": method, "path": path, "headers": []})
    assert route_permission(request) == expected


def test_scope_query_cannot_override_user_scope():
    result = merge_query({"estado": "activo"}, {"equipo_id": {"$in": ["team-1"]}})
    assert result == {"$and": [{"estado": "activo"}, {"equipo_id": {"$in": ["team-1"]}}]}


@pytest.mark.parametrize(
    "collection,data",
    [
        ("trainings", {"asistencia": [{"player_id": "player-other"}]}),
        ("callups", {"convocados": [{"player_id": "player-other"}]}),
        ("communications", {"destinatario_tipo": "equipo", "destinatario_id": "team-other"}),
        ("communications", {"destinatario_tipo": "individual", "destinatario_id": "player-other"}),
    ],
)
def test_embedded_identifiers_outside_scope_are_denied(collection, data):
    with pytest.raises(Exception) as error:
        enforce_related_scope(collection, data, {"team-1"}, {"player-1"})
    assert error.value.status_code == 403


@pytest.mark.parametrize(
    "collection,data",
    [
        ("trainings", {"asistencia": [{"player_id": "player-1"}]}),
        ("callups", {"convocados": [{"player_id": "player-1"}]}),
        ("communications", {"destinatario_tipo": "equipo", "destinatario_id": "team-1"}),
        ("communications", {"destinatario_tipo": "individual", "destinatario_id": "player-1"}),
    ],
)
def test_embedded_identifiers_inside_scope_are_allowed(collection, data):
    enforce_related_scope(collection, data, {"team-1"}, {"player-1"})
