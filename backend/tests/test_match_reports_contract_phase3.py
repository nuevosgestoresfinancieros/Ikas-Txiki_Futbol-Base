from starlette.requests import Request

from authz import ROLE_PERMISSIONS, route_permission
from server import _secure_match_report_participants


def test_match_reports_have_a_dedicated_internal_permission():
    for role in ("admin", "coordinator", "coach"):
        assert ROLE_PERMISSIONS[role]["match-reports"] >= {"read", "create", "edit"}
        assert "export" in ROLE_PERMISSIONS[role]["match-reports"]
    assert "administer" in ROLE_PERMISSIONS["admin"]["match-reports"]
    assert all("match-reports" not in ROLE_PERMISSIONS[role] for role in ("family", "player"))


def test_match_report_routes_apply_specific_close_reopen_and_import_permissions():
    cases = [
        ("GET", "/api/match-reports/match/m1", ("match-reports", "read")),
        ("POST", "/api/match-reports/match/m1", ("match-reports", "create")),
        ("PUT", "/api/match-reports/match/m1", ("match-reports", "edit")),
        ("PUT", "/api/match-reports/match/m1/participants/p1", ("match-reports", "edit")),
        ("POST", "/api/match-reports/match/m1/validate", ("match-reports", "read")),
        ("POST", "/api/match-reports/match/m1/close", ("match-reports", "edit")),
        ("POST", "/api/match-reports/match/m1/reopen", ("match-reports", "administer")),
        ("GET", "/api/match-reports/match/m1/history", ("match-reports", "read")),
        ("GET", "/api/match-reports/match/m1/export.pdf", ("match-reports", "export")),
        ("GET", "/api/match-reports/statistics/objective", ("match-reports", "read")),
        ("POST", "/api/match-reports/import/dry-run", ("match-reports", "administer")),
    ]
    for method, path, expected in cases:
        request = Request({"type": "http", "method": method, "path": path, "headers": []})
        assert route_permission(request) == expected


def test_ordinary_edits_cannot_spoof_server_managed_provenance():
    existing = {"participants": [{
        "player_id": "p1",
        "player_name": "Ane Prueba",
        "origin": "historical_import",
        "original_value": {"source_row": 7},
        "callup_response_original": "confirmed",
        "created_at": "2026-08-01T10:00:00Z",
        "created_by": "admin-1",
    }]}
    submitted = [{
        "player_id": "p1",
        "role": "did_not_play",
        "played": False,
        "origin": "forged-client-origin",
        "original_value": {"unexpected": "client-controlled"},
    }]
    context = {
        "actor": {"id": "coach-1", "role": "coach"},
        "players_by_id": {"p1": {"id": "p1", "nombre": "Ane", "apellidos": "Prueba"}},
        "callup": None,
    }

    secured = _secure_match_report_participants(submitted, existing, context)

    assert secured[0]["origin"] == "historical_import"
    assert secured[0]["original_value"] == {"source_row": 7}
    assert secured[0]["created_by"] == "admin-1"
