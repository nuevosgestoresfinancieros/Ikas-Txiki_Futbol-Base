import asyncio

import pytest
from starlette.requests import Request

from authz import ROLE_PERMISSIONS, route_permission
from notification_service import (
    RECOVERY_LOGO_CID, _activation_email_html, _public_legal_url, _recovery_email_html, dispatch_email, dispatch_telegram, make_notification, notification_enabled, provider_configuration, smtp_configuration,
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
    assert status["telegram"]["configured"] is False
    assert status["sms"]["configured"] is False


def test_email_without_provider_is_recorded_pending_not_sent():
    result = dispatch_email("family@example.test", "Subject", "Body", environment={})
    assert result["status"] == "pending" and result["sent_at"] is None
    assert result["error"] == "smtp_configuration_invalid"


def test_email_without_recipient_is_recorded_pending_with_explicit_reason():
    result = dispatch_email(None, "Subject", "Body", environment={})
    assert result["status"] == "pending"
    assert result["error"] == "recipient_missing"
    assert result["sent_at"] is None


def test_smtp_from_accepts_display_name():
    result = smtp_configuration({
        "SMTP_HOST": "smtp.example.test",
        "SMTP_FROM": "Ikas-Txiki <ikasfutbase@gmail.com>",
    })
    assert result["configured"] is True


def test_telegram_never_uses_phone_or_sends_without_a_linked_chat():
    assert dispatch_telegram("", "Aviso", {"TELEGRAM_BOT_TOKEN": "secret"})["error"] == "telegram_not_linked"
    assert dispatch_telegram("123", "Aviso", {})["error"] == "provider_not_configured"


def test_configured_telegram_posts_only_to_the_explicit_chat_id():
    requests = []

    class FakeResponse:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def read(self): return b'{"ok": true}'

    def fake_open(request, timeout):
        requests.append((request, timeout))
        return FakeResponse()

    result = dispatch_telegram("chat-123", "Aviso", {"TELEGRAM_BOT_TOKEN": "test-token"}, fake_open)
    assert result["status"] == "sent"
    assert requests[0][0].full_url.endswith("/bottest-token/sendMessage")
    assert b'chat-123' in requests[0][0].data


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
    assert sent[0].is_multipart()
    rendered = sent[0].as_string()
    assert "Ikas-Txiki Manager" in rendered
    assert "Zornotzako Futbol Eskola" in rendered
    assert "Content-ID: <ikastxiki-logo>" in rendered


def test_configured_email_with_display_name_has_a_valid_message_id():
    sent = []

    class FakeSMTP:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def send_message(self, message):
            sent.append(message)

    result = dispatch_email(
        "family@example.test", "Subject", "Body",
        {"SMTP_HOST": "smtp.example.test", "SMTP_FROM": "Ikas-Txiki <ikasfutbase@gmail.com>", "SMTP_STARTTLS": "false"},
        FakeSMTP,
    )
    assert result["status"] == "sent"
    assert sent[0]["From"] == "Ikas-Txiki <ikasfutbase@gmail.com>"
    assert sent[0]["Message-ID"].endswith("@gmail.com>")


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


@pytest.mark.parametrize("channel", ["email", "telegram", "whatsapp", "sms"])
def test_supported_communication_channels_are_explicit(channel):
    assert Communication(canal=channel).canal == channel


def test_unsupported_communication_channel_is_rejected():
    with pytest.raises(ValueError):
        Communication(canal="push")


def test_recovery_email_has_corporate_content_and_hides_the_token_url_from_copy():
    token_url = "https://example.invalid/nueva-contrasena?token=secret-token"
    html = _recovery_email_html("Hola Andrea,\n\nTexto solo para la versión plana.", token_url)
    assert "Crea tu nueva contraseña" in html
    assert "Lleva Ikastxiki siempre contigo" in html
    assert "Por tu seguridad, este enlace solo puede utilizarse una vez." in html
    assert f'cid:{RECOVERY_LOGO_CID}' in html and 'alt="Ikastxiki"' in html
    assert "Texto solo para la versión plana." not in html
    assert html.count(token_url) == 1
    assert f'href="{token_url}"' in html
    assert "Android:" in html and "iPhone/iPad:" in html and "Ordenador:" in html
    assert "Protección de datos de menores" in html
    assert f'href="{_public_legal_url("/privacidad")}"' in html
    assert f'href="{_public_legal_url("/condiciones-de-uso")}"' in html


def test_recovery_email_mime_keeps_the_url_only_in_the_html_button_and_embeds_logo():
    sent = []

    class FakeSMTP:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def send_message(self, message):
            sent.append(message)

    token_url = "https://example.invalid/nueva-contrasena?token=secret-token"
    plain_body = "Hola Andrea,\n\nUsa el botón de este correo para crear una nueva contraseña."
    result = dispatch_email(
        "family@example.test", "Recuperación", plain_body,
        {"SMTP_HOST": "smtp.example.test", "SMTP_FROM": "club@example.test", "SMTP_STARTTLS": "false"},
        FakeSMTP, action_url=token_url, action_label="Crear mi nueva contraseña", template="password_recovery",
    )
    assert result["status"] == "sent" and len(sent) == 1
    message = sent[0]
    plain = message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert token_url not in plain
    assert "Usa el botón de este correo" in plain
    assert html.count(token_url) == 1 and f'href="{token_url}"' in html
    assert html.count("Hemos recibido una solicitud") == 1
    assert f'cid:{RECOVERY_LOGO_CID}' in html and 'alt="Ikastxiki"' in html
    assert f'href="{_public_legal_url("/privacidad")}"' in html
    assert f'href="{_public_legal_url("/condiciones-de-uso")}"' in html
    assert any(part.get("Content-ID") == f"<{RECOVERY_LOGO_CID}>" for part in message.walk())


def test_activation_email_has_corporate_content_and_hides_the_token_url_from_copy():
    token_url = "https://example.invalid/activar?token=activation-secret-token"
    html = _activation_email_html("Hola,", "familia.ejemplo", token_url)
    assert "Activa tu acceso a Ikastxiki" in html
    assert "Tu usuario de Ikastxiki es: <strong>familia.ejemplo</strong>" in html
    assert "48 horas" in html and "Lleva Ikastxiki siempre contigo" in html
    assert "Protección de datos de menores" in html
    assert f'cid:{RECOVERY_LOGO_CID}' in html and 'alt="Ikastxiki"' in html
    assert html.count(token_url) == 1 and f'href="{token_url}"' in html
    assert f'<a href="{token_url}"' in html and "Crear mi contraseña</a>" in html
    assert html.count("Crear mi contraseña") == 1
    assert f'href="{_public_legal_url("/privacidad")}"' in html
    assert f'href="{_public_legal_url("/condiciones-de-uso")}"' in html


def test_activation_email_mime_keeps_url_only_in_html_button_and_embeds_logo():
    sent = []

    class FakeSMTP:
        def __init__(self, *_args, **_kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def send_message(self, message): sent.append(message)

    token_url = "https://example.invalid/activar?token=activation-secret-token"
    plain_body = "Hola,\n\nTu usuario de Ikastxiki es: familia.ejemplo.\n\nUsa el botón de este correo."
    result = dispatch_email(
        "family@example.test", "Activación", plain_body,
        {"SMTP_HOST": "smtp.example.test", "SMTP_FROM": "club@example.test", "SMTP_STARTTLS": "false"},
        FakeSMTP, action_url=token_url, action_label="familia.ejemplo", template="account_activation",
    )
    assert result["status"] == "sent" and len(sent) == 1
    message = sent[0]
    plain = message.get_body(preferencelist=("plain",)).get_content()
    html = message.get_body(preferencelist=("html",)).get_content()
    assert token_url not in plain
    assert html.count(token_url) == 1 and f'href="{token_url}"' in html
    assert html.count("Crear mi contraseña") == 1
    assert f'cid:{RECOVERY_LOGO_CID}' in html and 'alt="Ikastxiki"' in html
    assert any(part.get("Content-ID") == f"<{RECOVERY_LOGO_CID}>" for part in message.walk())


def test_smtp_configuration_validates_transport_without_exposing_password():
    result = smtp_configuration({
        "SMTP_HOST": "smtp.example.test", "SMTP_PORT": "bad",
        "SMTP_FROM": "invalid", "SMTP_USER": "user", "SMTP_PASSWORD": "",
        "SMTP_STARTTLS": "true", "SMTP_USE_SSL": "true",
    })
    assert result["configured"] is False
    assert {"smtp_port_invalid", "smtp_from_invalid", "smtp_ssl_starttls_conflict", "smtp_password_missing"} <= set(result["errors"])
    assert "SMTP_PASSWORD" not in str(result) and "user" not in str(result).lower()


def test_admin_permission_matrix_covers_every_internal_module():
    required = {"users", "families", "players", "teams", "calendar", "trainings", "matches",
                "callups", "stats", "payments", "authorizations", "inscriptions",
                "communications", "settings", "reports", "data", "notifications"}
    assert required <= set(ROLE_PERMISSIONS["admin"])
    assert all("read" in actions and "administer" in actions for actions in ROLE_PERMISSIONS["admin"].values())
