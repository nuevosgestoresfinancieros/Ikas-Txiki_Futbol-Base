"""Notificaciones internas y proveedores de entrega configurables."""
from __future__ import annotations

import os
import smtplib
import ssl
import json
from urllib import request as urllib_request
from html import escape
from datetime import datetime, timezone
from email.message import EmailMessage
from typing import Mapping, Optional
from uuid import uuid4
from brand_assets import BRAND_BLUE, BRAND_NAME, CLUB_NAME, logo_bytes


NOTIFICATION_TYPES = {
    "callup.created", "callup.pending", "callup.response", "schedule.changed",
    "match.upcoming", "training.upcoming", "payment.pending", "document.pending",
    "authorization.pending", "communication.created",
}
PRIORITIES = {"low", "normal", "high", "urgent"}


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
    return {
        "email": {"configured": bool(env.get("SMTP_HOST") and env.get("SMTP_FROM")), "provider": "smtp"},
        "telegram": {
            "configured": bool(env.get("TELEGRAM_BOT_TOKEN")), "provider": "telegram_bot",
            "bot_username": env.get("TELEGRAM_BOT_USERNAME", "").lstrip("@") or None,
        },
        "sms": {"configured": bool(env.get("SMS_PROVIDER_URL") and env.get("SMS_TOKEN")), "provider": "optional"},
    }


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
                   action_label: Optional[str] = None) -> dict:
    env = environment if environment is not None else os.environ
    config = provider_configuration(env)["email"]
    base = {"id": str(uuid4()), "channel": "email", "recipient": recipient,
            "created_at": now_iso(), "provider": "smtp"}
    if not config["configured"]:
        return {**base, "status": "pending", "error": "provider_not_configured", "sent_at": None}
    try:
        message = EmailMessage()
        message["From"] = env["SMTP_FROM"]
        message["To"] = recipient
        message["Subject"] = subject
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
        message.add_alternative(
            f"""<!doctype html>
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
</html>""",
            subtype="html",
        )
        html_part = message.get_payload()[-1]
        html_part.add_related(logo_bytes(), maintype="image", subtype="png", cid="<ikastxiki-logo>")
        factory = smtp_factory or (smtplib.SMTP_SSL if env.get("SMTP_USE_SSL", "false").lower() == "true" else smtplib.SMTP)
        port = int(env.get("SMTP_PORT", "465" if factory is smtplib.SMTP_SSL else "587"))
        with factory(env["SMTP_HOST"], port, timeout=10) as client:
            if factory is not smtplib.SMTP_SSL and env.get("SMTP_STARTTLS", "true").lower() == "true":
                client.starttls(context=ssl.create_default_context())
            if env.get("SMTP_USER"):
                client.login(env["SMTP_USER"], env.get("SMTP_PASSWORD", ""))
            client.send_message(message)
        return {**base, "status": "sent", "error": None, "sent_at": now_iso()}
    except Exception as error:
        return {**base, "status": "failed", "error": type(error).__name__, "sent_at": None}
