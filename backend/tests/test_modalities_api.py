import asyncio
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

import server
from authz import current_user_context, has_permission, route_permission
from modality_service import DEFAULT_MODALITIES, ModalityUpdateRequest


def run(coro):
    return asyncio.run(coro)


def actor(role="admin"):
    return {"id": f"user-{role}", "role": role, "active": True}


@pytest.mark.parametrize("role", ["admin", "coordinator", "coach", "family", "player"])
def test_catalog_read_permission_for_all_authenticated_roles(role):
    assert has_permission(actor(role), "modalities", "read")


@pytest.mark.parametrize("role", ["coordinator", "coach", "family", "player"])
@pytest.mark.parametrize("action", ["create", "edit", "delete", "administer"])
def test_only_admin_can_administer_catalog(role, action):
    assert not has_permission(actor(role), "modalities", action)
    assert has_permission(actor("admin"), "modalities", action)


@pytest.mark.parametrize(
    "method,path,expected",
    [
        ("GET", "/api/modalities", ("modalities", "read")),
        ("POST", "/api/modalities", ("modalities", "create")),
        ("PUT", "/api/modalities/F7", ("modalities", "edit")),
        ("PATCH", "/api/modalities/F7/status", ("modalities", "edit")),
        ("POST", "/api/modalities/reorder", ("modalities", "create")),
    ],
)
def test_modality_routes_are_mapped_to_rbac(method, path, expected):
    request = Request({"type": "http", "method": method, "path": path, "headers": []})
    assert route_permission(request) == expected


def test_missing_catalog_returns_compatibility_defaults_without_persisting(monkeypatch):
    collection = type("Collection", (), {
        "find_one": AsyncMock(return_value=None),
        "update_one": AsyncMock(),
    })()
    monkeypatch.setattr(server.db, "settings", collection)

    catalog = run(server._load_modality_catalog())

    assert [entry.code for entry in catalog] == ["F7", "F11"]
    collection.update_one.assert_not_awaited()


def test_public_catalog_hides_inactive_and_non_admin_cannot_request_it(monkeypatch):
    catalog = [
        DEFAULT_MODALITIES[0].model_copy(update={"active": False}),
        DEFAULT_MODALITIES[1].model_copy(deep=True),
    ]
    monkeypatch.setattr(server, "_load_modality_catalog", AsyncMock(return_value=catalog))
    token = current_user_context.set(actor("family"))
    try:
        assert [item["code"] for item in run(server.get_modalities())] == ["F11"]
        with pytest.raises(HTTPException) as error:
            run(server.get_modalities(include_inactive=True))
        assert error.value.status_code == 403
    finally:
        current_user_context.reset(token)


def test_admin_can_read_active_and_inactive_modalities(monkeypatch):
    catalog = [
        DEFAULT_MODALITIES[0].model_copy(update={"active": False}),
        DEFAULT_MODALITIES[1].model_copy(deep=True),
    ]
    monkeypatch.setattr(server, "_load_modality_catalog", AsyncMock(return_value=catalog))
    token = current_user_context.set(actor())
    try:
        assert [item["code"] for item in run(server.get_modalities(True))] == ["F7", "F11"]
    finally:
        current_user_context.reset(token)


def test_alias_collision_is_rejected_without_persisting(monkeypatch):
    monkeypatch.setattr(server, "_load_modality_catalog", AsyncMock(return_value=list(DEFAULT_MODALITIES)))
    save = AsyncMock()
    monkeypatch.setattr(server, "_save_modality_catalog", save)
    token = current_user_context.set(actor())
    try:
        with pytest.raises(HTTPException) as error:
            run(server.update_modality("F11", ModalityUpdateRequest(aliases=["F7"])))
        assert error.value.status_code == 422
        save.assert_not_awaited()
    finally:
        current_user_context.reset(token)


def test_used_modality_cannot_be_deactivated_and_returns_usage(monkeypatch):
    monkeypatch.setattr(server, "_load_modality_catalog", AsyncMock(return_value=list(DEFAULT_MODALITIES)))
    monkeypatch.setattr(server, "_modality_usage", AsyncMock(return_value={"teams": 2}))
    save = AsyncMock()
    monkeypatch.setattr(server, "_save_modality_catalog", save)
    token = current_user_context.set(actor())
    try:
        with pytest.raises(HTTPException) as error:
            run(server.update_modality("F7", ModalityUpdateRequest(active=False)))
        assert error.value.status_code == 409
        assert error.value.detail["usage"] == {"teams": 2}
        save.assert_not_awaited()
    finally:
        current_user_context.reset(token)


def test_unused_modality_can_be_deactivated_with_audit_fields(monkeypatch):
    monkeypatch.setattr(server, "_load_modality_catalog", AsyncMock(return_value=list(DEFAULT_MODALITIES)))
    monkeypatch.setattr(server, "_modality_usage", AsyncMock(return_value={}))
    save = AsyncMock()
    monkeypatch.setattr(server, "_save_modality_catalog", save)
    token = current_user_context.set(actor())
    try:
        result = run(server.update_modality("F7", ModalityUpdateRequest(active=False)))
        assert result["active"] is False
        assert result["updated_by"] == "user-admin"
        assert result["updated_at"] is not None
        save.assert_awaited_once()
    finally:
        current_user_context.reset(token)


def test_settings_rejects_unsupported_or_colliding_catalogs():
    unsupported = [DEFAULT_MODALITIES[0].model_copy(update={"code": "F8"})]
    colliding = [
        DEFAULT_MODALITIES[0],
        DEFAULT_MODALITIES[1].model_copy(update={"aliases": ["F7"]}),
    ]
    with pytest.raises(ValidationError):
        server.Settings(modalities=unsupported)
    with pytest.raises(ValidationError):
        server.Settings(modalities=colliding)


def test_catalog_has_no_delete_endpoint():
    assert not any(
        route.path.startswith("/modalities") and "DELETE" in route.methods
        for route in server.api_router.routes
    )
