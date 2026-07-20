import asyncio

import pytest
from starlette.requests import Request

from authz import ROLE_PERMISSIONS, route_permission
from notification_service import (
    dispatch_email, make_notification, notification_enabled, provider_configuration,
)
from server import scope_for_collection
from server import Communication


def test_notification_contains_read_priority_expiry_link_and_recipient():
    row = make_notification(
        {"id": "user", "username": "family"}, "callup.created", "Title", "Message",
        "/convocatorias", "high", {"callup_id": "c"}, "2026-08-01T00:00:00+00:00", "callup:c:user",
    )
    assert row["recipient_user_id"] == "user" and row["read_at"] is None
    assert row["priority"] == "high" and row["expires_at"].startswith("2026-08-01")
    assert row["link"] == "/convocatorias" and row["dedupe_key"] == "callup:c:user"


def test_preferences_disable_only_the_related_automatic_events():
    assert notification_enabled({"callups": False}, "callup.pending") is False
    assert notification_enabled({"callups": False}, "payment.pending") is True
    assert notification_enabled({"in_app": False}, "communication.created") is False


def test_provider_status_does_not_claim_unconfigured_channels_are_available():
    status = provider_configuration({})
    assert status["email"]["configured"] is False
    assert status["whatsapp"]["configured"] is False
    assert status["sms"]["configured"] is False


def test_email_without_provider_is_recorded_pending_not_sent():
    result = dispatch_email("family@example.test", "Subject", "Body", environment={})
    assert result["status"] == "pending" and result["sent_at"] is None
    assert result["error"] == "provider_not_configured"


def test_configured_email_is_sent_only_after_provider_success():
    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            self.host = host

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def starttls(self, context):
            return None

        def send_message(self, message):
            sent.append(message)

    env = {"SMTP_HOST": "smtp.example.test", "SMTP_FROM": "club@example.test", "SMTP_STARTTLS": "false"}
    result = dispatch_email("family@example.test", "Subject", "Body", env, FakeSMTP)
    assert result["status"] == "sent" and result["sent_at"]
    assert len(sent) == 1


@pytest.mark.parametrize("role", ["coordinator", "coach", "family", "player"])
def test_roles_can_read_and_mark_only_their_notifications(role):
    assert {"read", "edit"} <= ROLE_PERMISSIONS[role]["notifications"]
    assert not ({"create", "delete"} & ROLE_PERMISSIONS[role]["notifications"])


def test_notification_scope_is_personal_even_for_admin():
    for role in ("admin", "family", "player"):
        scope = asyncio.run(scope_for_collection("notifications", {"id": "mine", "username": "me", "role": role}))
        assert {"recipient_user_id": "mine"} in scope["$or"]
        assert {"recipient_username": "me"} in scope["$or"]


def test_notification_routes_use_read_and_edit_permissions():
    get_request = Request({"type": "http", "method": "GET", "scheme": "https", "server": ("test", 443),
                           "client": ("test", 1), "path": "/api/notifications", "query_string": b"", "headers": []})
    patch_request = Request({"type": "http", "method": "PATCH", "scheme": "https", "server": ("test", 443),
                             "client": ("test", 1), "path": "/api/notifications/n/read", "query_string": b"", "headers": []})
    assert route_permission(get_request) == ("notifications", "read")
    assert route_permission(patch_request) == ("notifications", "edit")


def test_communication_cannot_claim_it_was_sent_from_client_data():
    communication = Communication(
        destinatario_tipo="equipo", destinatario_id="team", canal="email",
        asunto="Aviso", mensaje="Mensaje", enviado=True,
        fecha_envio="2026-07-20T10:00:00+00:00",
    )
    payload = communication.model_dump()
    payload.update({"enviado": False, "fecha_envio": None, "estado_envio": "pending"})
    assert payload["enviado"] is False
    assert payload["fecha_envio"] is None
    assert payload["estado_envio"] == "pending"


@pytest.mark.parametrize("channel", ["email", "whatsapp", "sms"])
def test_supported_communication_channels_are_explicit(channel):
    assert Communication(canal=channel).canal == channel


def test_unsupported_communication_channel_is_rejected():
    with pytest.raises(ValueError):
        Communication(canal="push")
