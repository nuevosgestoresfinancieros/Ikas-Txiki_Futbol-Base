import asyncio
import time
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import server
from health_service import deployment_version


class HealthyDatabase:
    command = AsyncMock(return_value={"ok": 1})


class UnhealthyDatabase:
    command = AsyncMock(side_effect=RuntimeError("unavailable"))


def test_health_is_public_fast_shape_and_read_only(monkeypatch):
    database = HealthyDatabase()
    monkeypatch.setattr(server, "db", database)
    monkeypatch.setattr(server, "DEPLOYMENT_VERSION", "a" * 40)
    monkeypatch.setattr(server, "APP_ENVIRONMENT", "production")

    started = time.perf_counter()
    result = asyncio.run(server.health())
    elapsed = time.perf_counter() - started

    assert result == {
        "status": "ok",
        "version": "a" * 40,
        "environment": "production",
        "mongodb": "ok",
        "uptime_seconds": result["uptime_seconds"],
        "timestamp": result["timestamp"],
    }
    assert result["uptime_seconds"] >= 0
    assert result["timestamp"].endswith("+00:00")
    database.command.assert_awaited_once_with({"ping": 1, "maxTimeMS": 100})
    assert elapsed < 0.05
    route = next(route for route in server.app.routes if getattr(route, "path", None) == "/api/health")
    assert route.methods == {"GET"}
    assert route.dependant.dependencies == []


def test_health_returns_503_without_leaking_database_error(monkeypatch):
    monkeypatch.setattr(server, "db", UnhealthyDatabase())
    with pytest.raises(HTTPException) as raised:
        asyncio.run(server.health())
    assert raised.value.status_code == 503
    assert raised.value.detail["status"] == "error"
    assert raised.value.detail["mongodb"] == "error"
    assert "unavailable" not in str(raised.value.detail)


def test_deployment_version_prefers_explicit_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_VERSION", "b" * 40)
    assert deployment_version(tmp_path) == "b" * 40
