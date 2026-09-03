import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

import family_access_api


def route_endpoint(router, suffix):
    return next(route.endpoint for route in router.routes if route.path.endswith(suffix))


def build_router(actor):
    return family_access_api.build_family_access_router(
        db=SimpleNamespace(families=SimpleNamespace(find_one=AsyncMock(return_value={"id": "family-1"}))),
        actor_getter=lambda: actor,
        secret="test-secret",
        password_hasher=lambda value: value,
        dispatcher=lambda *_args, **_kwargs: {"status": "sent"},
        public_url=lambda: "https://app.example.test",
        temporary_password=AsyncMock(),
        lock_access=AsyncMock(),
    )


def test_invitation_routes_reject_non_admin_before_reading_family_data():
    endpoint = route_endpoint(build_router({"id": "coach", "role": "coach"}), "/family-access/families/{family_id}/{slot}/invitation")
    with pytest.raises(HTTPException) as error:
        asyncio.run(endpoint("family-1", 1, family_access_api.ConfirmRequest(confirmation="ENVIAR INVITACIÓN")))
    assert error.value.status_code == 403


def test_invitation_routes_reject_inactive_admin():
    endpoint = route_endpoint(build_router({"id": "admin", "role": "admin", "active": False}), "/family-access/families/{family_id}/{slot}/invitation")
    with pytest.raises(HTTPException) as error:
        asyncio.run(endpoint("family-1", 1, family_access_api.ConfirmRequest(confirmation="ENVIAR INVITACIÓN")))
    assert error.value.status_code == 403


def test_invitation_route_passes_only_requested_family_and_slot_to_service(monkeypatch):
    service = AsyncMock(return_value={"ok": True, "delivery": "sent"})
    monkeypatch.setattr(family_access_api, "manual_invitation", service)
    router = build_router({"id": "admin", "role": "admin"})
    endpoint = route_endpoint(router, "/family-access/families/{family_id}/{slot}/invitation/resend")
    result = asyncio.run(endpoint("family-1", 2, family_access_api.ConfirmRequest(confirmation="REENVIAR INVITACIÓN")))
    assert result["delivery"] == "sent"
    args, kwargs = service.await_args
    assert args[1]["id"] == "family-1"
    assert args[2] == 2
    assert kwargs == {"resend": True, "allow_delivery": True}


def test_invitation_service_rejects_an_out_of_scope_slot():
    from family_access_service import manual_invitation

    with pytest.raises(ValueError, match="Slot familiar no válido"):
        asyncio.run(manual_invitation(
            SimpleNamespace(), {"id": "family-1"}, 3, {"id": "admin", "role": "admin"},
            "test-secret", lambda value: value, lambda *_args, **_kwargs: {"status": "sent"},
            "https://app.example.test", allow_delivery=True,
        ))
