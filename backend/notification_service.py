"""Notificaciones internas y proveedores de entrega configurables."""
from __future__ import annotations

import os
import smtplib
import ssl
import json
import re
from urllib import request as urllib_request
from html import escape
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import make_msgid
from typing import Mapping, Optional
from uuid import uuid4
from brand_assets import BRAND_BLUE, BRAND_NAME, CLUB_NAME, logo_bytes


NOTIFICATION_TYPES = {
    "callup.created", "callup.pending", "callup.response", "schedule.changed",
    "match.upcoming", "training.upcoming", "payment.pending", "document.pending",
    "authorization.pending", "communication.created",
}
PRIORITIES = {"low", "normal", "high", "urgent"}
RECOVERY_LOGO_CID = "ikastxiki-logo"
PUBLIC_APP_URL = "https://ikasfutbase.cibermedida.es"
DELIVERY_STATUSES = {"sent", "pending", "failed", "delivered_unknown"}
_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _public_legal_url(path: str) -> str:
    base_url = str(os.environ.get("PUBLIC_APP_URL") or PUBLIC_APP_URL).strip().rstrip("/")
    return f"{base_url}{path}"


def _recovery_email_html(greeting: str, action_url: str) -> str:
    """Render the password-recovery email without exposing its token URL as text."""
    safe_greeting = escape((greeting.splitlines() or ["Hola,"])[0] or "Hola,")
    safe_url = escape(action_url, quote=True)
    privacy_url = escape(_public_legal_url("/privacidad"), quote=True)
    terms_url = escape(_public_legal_url("/condiciones-de-uso"), quote=True)
    return f"""<!doctype html>
<html lang="es"><body style="margin:0;padding:0;background:#F5F8FC;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;color:#263746;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#F5F8FC;"><tr><td align="center" style="padding:28px 12px 36px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;margin:0 auto;">
<tr><td align="center" style="padding:30px 24px 28px;background:#0E3554;background:linear-gradient(135deg,#0E3554 0%,#1B5C8F 58%,#2B75B0 100%);border-radius:20px 20px 0 0;"><img src="cid:{RECOVERY_LOGO_CID}" alt="Ikastxiki" width="86" height="86" style="display:block;width:86px;height:86px;margin:0 auto 14px;border:0;object-fit:contain;"><p style="margin:0;color:#ffffff;font-size:22px;font-weight:800;line-height:28px;">Ikas-Txiki Manager</p><p style="margin:5px 0 0;color:#CFE9FA;font-size:12px;font-weight:700;letter-spacing:0.7px;line-height:18px;text-transform:uppercase;">{CLUB_NAME}</p></td></tr>
<tr><td style="padding:0 1px;background:#ffffff;border-left:1px solid #CFE9FA;border-right:1px solid #CFE9FA;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:34px 30px 10px;"><p style="margin:0 0 14px;color:#0E3554;font-size:28px;font-weight:800;letter-spacing:-0.4px;line-height:34px;">Crea tu nueva contraseña</p><p style="margin:0 0 18px;font-size:16px;line-height:25px;">{safe_greeting}</p><p style="margin:0 0 26px;font-size:16px;line-height:25px;">Hemos recibido una solicitud para cambiar la contraseña de tu cuenta. Este enlace es personal, de un solo uso y caduca en <strong>30 minutos</strong>. Si no realizaste esta solicitud, puedes ignorar este mensaje.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:0 0 28px;"><a href="{safe_url}" style="display:inline-block;box-sizing:border-box;width:100%;max-width:360px;padding:16px 22px;background:#0E3554;background:linear-gradient(135deg,#1B5C8F,#0E3554);border-radius:12px;color:#ffffff;font-size:16px;font-weight:800;line-height:20px;text-align:center;text-decoration:none;">Crear mi nueva contraseña</a></td></tr></table><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#EAF6FD;border:1px solid #CFE9FA;border-radius:12px;"><tr><td style="padding:15px 16px;"><p style="margin:0;color:#0E3554;font-size:15px;font-weight:800;line-height:21px;">&#128274;&nbsp; Por tu seguridad, este enlace solo puede utilizarse una vez.</p></td></tr></table></td></tr></table></td></tr>
<tr><td style="padding:26px 30px 30px;background:#ffffff;border-left:1px solid #CFE9FA;border-right:1px solid #CFE9FA;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F5F8FC;border-radius:16px;"><tr><td style="padding:22px 20px;"><p style="margin:0 0 8px;color:#0E3554;font-size:18px;font-weight:800;line-height:24px;">Lleva Ikastxiki siempre contigo</p><p style="margin:0 0 14px;color:#52616B;font-size:14px;line-height:21px;">Puedes instalar Ikastxiki como aplicación web, sin descargarla de una tienda.</p><p style="margin:0 0 9px;color:#263746;font-size:14px;line-height:21px;"><strong>Android:</strong> abre Ikastxiki en Chrome &rarr; men&uacute; &#8942; &rarr; “Instalar aplicaci&oacute;n” o “A&ntilde;adir a pantalla de inicio”.</p><p style="margin:0 0 9px;color:#263746;font-size:14px;line-height:21px;"><strong>iPhone/iPad:</strong> abre Ikastxiki en Safari &rarr; Compartir &rarr; “A&ntilde;adir a pantalla de inicio”.</p><p style="margin:0;color:#263746;font-size:14px;line-height:21px;"><strong>Ordenador:</strong> abre Ikastxiki en Chrome o Edge &rarr; icono de instalaci&oacute;n junto a la barra de direcciones.</p></td></tr></table></td></tr>
<tr><td style="padding:0 30px 26px;background:#ffffff;border-left:1px solid #CFE9FA;border-right:1px solid #CFE9FA;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F5F8FC;border:1px solid #CFE9FA;border-radius:14px;"><tr><td style="padding:18px 18px 16px;"><p style="margin:0 0 8px;color:#0E3554;font-size:15px;font-weight:800;line-height:21px;">&#128737;&nbsp; Protección de datos de menores</p><p style="margin:0 0 10px;color:#52616B;font-size:13px;line-height:20px;">Protección de datos de menores: en Ikastxiki protegemos especialmente la privacidad de niños, niñas y adolescentes. Este correo no incluye datos personales de menores. Los datos se tratan únicamente para prestar el servicio, proteger las cuentas y gestionar esta solicitud.</p><p style="margin:0;color:#52616B;font-size:13px;line-height:20px;">Consulta la <a href="{privacy_url}" style="color:#1B5C8F;font-weight:800;text-decoration:underline;">Política de privacidad</a> para conocer cómo tratamos los datos y ejercer tus derechos. Consulta también las <a href="{terms_url}" style="color:#1B5C8F;font-weight:800;text-decoration:underline;">Condiciones de uso</a>.</p></td></tr></table></td></tr>
<tr><td align="center" style="padding:20px 28px;background:#EAF6FD;border-radius:0 0 20px 20px;border:1px solid #CFE9FA;border-top:0;"><p style="margin:0 0 6px;color:#0E3554;font-size:13px;font-weight:800;line-height:18px;">Ikas-Txiki Manager · {CLUB_NAME}</p><p style="margin:0;color:#52616B;font-size:12px;line-height:18px;">Nunca compartas este correo ni tu contraseña. Si necesitas ayuda, contacta con el equipo de tu club.</p></td></tr>
</table></td></tr></table></body></html>"""


def _activation_email_html(greeting: str, username: str, action_url: str) -> str:
    """Render the activation email without exposing its token URL as text."""
    safe_greeting = escape((greeting.splitlines() or ["Hola,"])[0] or "Hola,")
    safe_username = escape(username or "")
    html = _recovery_email_html(greeting, action_url)
    greeting_block = '<p style="margin:0 0 18px;font-size:16px;line-height:25px;">' + safe_greeting + '</p>'
    activation_block = (
        greeting_block
        + '<p style="margin:0 0 14px;font-size:16px;line-height:25px;">Tu usuario de Ikastxiki es: <strong>'
        + safe_username + '</strong>.</p>'
        + '<p style="margin:0 0 26px;font-size:16px;line-height:25px;">Activa tu acceso y crea una contraseña personal desde el botón. El enlace es personal, caduca en <strong>48 horas</strong> y no debe compartirse.</p>'
    )
    recovery_block = (
        greeting_block
        + '<p style="margin:0 0 26px;font-size:16px;line-height:25px;">Hemos recibido una solicitud para cambiar la contraseña de tu cuenta. Este enlace es personal, de un solo uso y caduca en <strong>30 minutos</strong>. Si no realizaste esta solicitud, puedes ignorar este mensaje.</p>'
    )
    return (html
        .replace('Crea tu nueva contraseña', 'Activa tu acceso a Ikastxiki', 1)
        .replace(recovery_block, activation_block, 1)
        .replace('Crear mi nueva contraseña', 'Crear mi contraseña', 1)
        .replace('&#128274;&nbsp; Por tu seguridad, este enlace solo puede utilizarse una vez.', '&#128274;&nbsp; Protege tu acceso: no compartas este correo ni tu contraseña.', 1)
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_notification(recipient: Mapping, notification_type: str, title: str, message: str,
                      link: Optional[str] = None, priority: str = "normal",
                      related: Optional[dict] = None, expires_at: Optional[str] = None,
                      dedupe_key: Optional[str] = None) -> dict:
    if notification_type not in NOTIFICATION_TYPES:
        raise ValueError("Tipo de notificación no válido")
    if priority not in PRIORITIES:
        raise ValueError("Prioridad no válida")
    return {
        "id": str(uuid4()), "recipient_user_id": recipient.get("id"),
        "recipient_username": recipient.get("username"), "type": notification_type,
        "priority": priority, "title": title, "message": message, "link": link,
        "related": related or {}, "created_at": now_iso(), "read_at": None,
        "expires_at": expires_at, "dedupe_key": dedupe_key,
    }


def notification_enabled(preferences: Mapping, notification_type: str) -> bool:
    if preferences.get("in_app", True) is False:
        return False
    mapping = {
        "callup.created": "callups", "callup.pending": "callups", "callup.response": "callups",
        "schedule.changed": "schedule_changes", "match.upcoming": "schedule_changes",
        "training.upcoming": "schedule_changes", "payment.pending": "payments",
        "document.pending": "documents", "authorization.pending": "documents",
    }
    return preferences.get(mapping.get(notification_type, "in_app"), True) is not False


def provider_configuration(environment: Optional[Mapping[str, str]] = None) -> dict:
    env = environment if environment is not None else os.environ
    smtp = smtp_configuration(env)
    return {
        "email": {"configured": smtp["configured"], "provider": "smtp", "errors": smtp["errors"]},
        "telegram": {
            "configured": bool(env.get("TELEGRAM_BOT_TOKEN")), "provider": "telegram_bot",
            "bot_username": env.get("TELEGRAM_BOT_USERNAME", "").lstrip("@") or None,
        },
        "sms": {"configured": bool(env.get("SMS_PROVIDER_URL") and env.get("SMS_TOKEN")), "provider": "optional"},
    }


def _as_bool(value: object, default: bool) -> bool:
    if value is None or str(value).strip() == "":
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def smtp_configuration(environment: Optional[Mapping[str, str]] = None) -> dict:
    """Validate SMTP settings without ever returning a secret value."""
    env = environment if environment is not None else os.environ
    host = str(env.get("SMTP_HOST") or "").strip()
    sender = str(env.get("SMTP_FROM") or "").strip()
    errors = []
    if not host:
        errors.append("smtp_host_missing")
    if not sender:
        errors.append("smtp_from_missing")
    elif not _EMAIL_RE.fullmatch(sender):
        errors.append("smtp_from_invalid")
    try:
        port = int(str(env.get("SMTP_PORT") or "587"))
        if not 1 <= port <= 65535:
            raise ValueError
    except (TypeError, ValueError):
        errors.append("smtp_port_invalid")
        port = None
    use_ssl = _as_bool(env.get("SMTP_USE_SSL"), False)
    starttls = _as_bool(env.get("SMTP_STARTTLS"), True)
    if use_ssl and starttls:
        errors.append("smtp_ssl_starttls_conflict")
    if str(env.get("SMTP_USER") or "").strip() and not str(env.get("SMTP_PASSWORD") or ""):
        errors.append("smtp_password_missing")
    return {"configured": not errors, "errors": errors, "port": port,
            "use_ssl": use_ssl, "starttls": starttls}


def delivery_log(delivery: Mapping[str, object] | None, *, user_id: str | None = None,
                 purpose: str | None = None, **extra: object) -> dict:
    """Return the stable, secret-free delivery_logs schema."""
    source = dict(delivery or {})
    status = source.get("status") if source.get("status") in DELIVERY_STATUSES else "failed"
    return {
        "id": source.get("id") or str(uuid4()), "channel": source.get("channel"),
        "provider": source.get("provider"), "recipient": source.get("recipient"),
        "status": status, "error": source.get("error"), "error_detail": source.get("error_detail"),
        "created_at": source.get("created_at") or now_iso(), "sent_at": source.get("sent_at"),
        "message_id": source.get("message_id"), "user_id": user_id or source.get("user_id"),
        "purpose": purpose or source.get("purpose"), **extra,
    }


def _smtp_error(error: Exception) -> tuple[str, str]:
    if isinstance(error, smtplib.SMTPAuthenticationError):
        return "failed", "smtp_authentication_failed"
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        return "failed", "smtp_recipient_refused"
    if isinstance(error, smtplib.SMTPSenderRefused):
        return "failed", "smtp_sender_refused"
    if isinstance(error, smtplib.SMTPDataError):
        return "failed", "smtp_data_rejected"
    if isinstance(error, (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, TimeoutError, OSError)):
        return "pending", "smtp_connection_error"
    if isinstance(error, smtplib.SMTPException):
        return "failed", "smtp_protocol_error"
    return "failed", "email_delivery_error"


def dispatch_telegram(chat_id: str, text: str, environment: Optional[Mapping[str, str]] = None,
                      http_open=None) -> dict:
    """Send an explicitly consented communication through the club Telegram bot.

    Telegram identifiers are never inferred from a telephone or email address.
    A recipient must have linked the bot first, so an absent chat id remains a
    pending delivery rather than a potentially misdirected message.
    """
    env = environment if environment is not None else os.environ
    base = {"id": str(uuid4()), "channel": "telegram", "recipient": str(chat_id or "") or None,
            "created_at": now_iso(), "provider": "telegram_bot"}
    token = env.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        return {**base, "status": "pending", "error": "provider_not_configured", "sent_at": None}
    if not str(chat_id or "").strip():
        return {**base, "status": "pending", "error": "telegram_not_linked", "sent_at": None}
    try:
        payload = json.dumps({"chat_id": str(chat_id), "text": text}).encode("utf-8")
        opener = http_open or urllib_request.urlopen
        request = urllib_request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage", data=payload,
            headers={"Content-Type": "application/json"}, method="POST",
        )
        with opener(request, timeout=10) as response:
            result = json.loads(response.read().decode("utf-8"))
        if not result.get("ok"):
            return {**base, "status": "failed", "error": "telegram_api_rejected", "sent_at": None}
        return {**base, "status": "sent", "error": None, "sent_at": now_iso()}
    except Exception as error:
        return {**base, "status": "failed", "error": type(error).__name__, "sent_at": None}


def dispatch_email(recipient: str, subject: str, body: str,
                   environment: Optional[Mapping[str, str]] = None,
                   smtp_factory=None, *, action_url: Optional[str] = None,
                   action_label: Optional[str] = None, template: Optional[str] = None,
                   user_id: Optional[str] = None, purpose: Optional[str] = None) -> dict:
    env = environment if environment is not None else os.environ
    config = smtp_configuration(env)
    base = {"id": str(uuid4()), "channel": "email", "recipient": recipient,
            "created_at": now_iso(), "provider": "smtp", "message_id": None,
            "user_id": user_id, "purpose": purpose}
    if not isinstance(recipient, str) or not _EMAIL_RE.fullmatch(recipient.strip()):
        return {**base, "status": "failed", "error": "recipient_invalid", "sent_at": None}
    if not config["configured"]:
        return {**base, "status": "pending", "error": "smtp_configuration_invalid" if config["errors"] else "provider_not_configured", "sent_at": None,
                "configuration_errors": config["errors"],
                "error_detail": ", ".join(config["errors"]) if config["errors"] else None}
    try:
        message = EmailMessage()
        message["From"] = env["SMTP_FROM"]
        message["To"] = recipient
        message["Subject"] = subject
        sender_domain = str(env["SMTP_FROM"]).rsplit("@", 1)[-1]
        message_id = make_msgid(domain=sender_domain)
        message["Message-ID"] = message_id
        message.set_content(body)
        safe_body = "<br>".join(escape(body).splitlines())
        action_html = ""
        if action_url and action_label:
            action_html = (
                '<p style="margin:24px 0;text-align:center">'
                f'<a href="{escape(action_url, quote=True)}" '
                f'style="display:inline-block;border-radius:10px;background:{BRAND_BLUE};color:#ffffff;'
                'padding:13px 20px;font-weight:700;text-decoration:none">'
                f'{escape(action_label)}</a></p>'
            )
        html = (_recovery_email_html(body, action_url) if template == "password_recovery" and action_url else _activation_email_html(body, action_label or "", action_url) if template == "account_activation" and action_url else f"""<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f5fafc;font-family:Arial,sans-serif;color:#1f2937">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5fafc;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dbe7ed;border-radius:16px">
          <tr><td style="padding:24px;text-align:center;border-bottom:3px solid {BRAND_BLUE}">
            <img src="cid:ikastxiki-logo" alt="{BRAND_NAME}" width="96" height="96" style="display:block;margin:0 auto 10px;object-fit:contain">
            <strong style="font-size:20px;color:{BRAND_BLUE}">{BRAND_NAME}</strong><br>
            <span style="font-size:13px;color:#52616b">{CLUB_NAME}</span>
          </td></tr>
          <tr><td style="padding:28px;font-size:15px;line-height:1.65">{safe_body}{action_html}</td></tr>
          <tr><td style="padding:16px 24px;background:#eef6f9;text-align:center;font-size:12px;color:#52616b">
            {BRAND_NAME} · {CLUB_NAME}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>""")
        message.add_alternative(html, subtype="html")
        html_part = message.get_payload()[-1]
        html_part.add_related(logo_bytes(), maintype="image", subtype="png", cid=f"<{RECOVERY_LOGO_CID}>")
        use_ssl = config["use_ssl"]
        factory = smtp_factory or (smtplib.SMTP_SSL if use_ssl else smtplib.SMTP)
        port = config["port"]
        with factory(env["SMTP_HOST"], port, timeout=10) as client:
            if not use_ssl and config["starttls"]:
                client.starttls(context=ssl.create_default_context())
            if env.get("SMTP_USER"):
                client.login(env["SMTP_USER"], env.get("SMTP_PASSWORD", ""))
            client.send_message(message)
        return {**base, "message_id": message_id, "status": "sent", "error": None, "sent_at": now_iso()}
    except Exception as error:
        status, error_code = _smtp_error(error)
        return {**base, "status": status, "error": error_code, "sent_at": None}
