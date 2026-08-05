from starlette.requests import Request

from authz import ROLE_PERMISSIONS, route_permission


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
