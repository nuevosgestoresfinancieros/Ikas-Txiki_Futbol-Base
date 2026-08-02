"""Tests for the conservative team roster limit migration."""

import importlib.util
from pathlib import Path


MIGRATION_PATH = Path(__file__).resolve().parents[1] / "migrations" / "002_team_roster_limits.py"
SPEC = importlib.util.spec_from_file_location("team_roster_limits_migration", MIGRATION_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_required_limit_only_grows_insufficient_limit():
    assert MODULE.required_limit(20, 27) == 27
    assert MODULE.required_limit(27, 27) is None
    assert MODULE.required_limit(30, 27) is None


def test_required_limit_handles_missing_or_invalid_values():
    assert MODULE.required_limit(None, 8) == 8
    assert MODULE.required_limit("invalid", 4) == 4
    assert MODULE.required_limit(None, 0) is None
