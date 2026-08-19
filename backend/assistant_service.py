"""Motor seguro y sin persistencia de conversaciones del asistente híbrido."""
from __future__ import annotations

import hashlib
import html
import re
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Optional

from assistant_knowledge import contextual_help


MAX_MESSAGE_LENGTH = 1200
PROPOSAL_TTL_SECONDS = 10 * 60
SAFE_ROUTES = {
    "/", "/jugadores", "/familias", "/equipos", "/inscripciones",
    "/entrenamientos", "/partidos", "/convocatorias", "/pagos",
    "/autorizaciones", "/equipamiento", "/comunicacion", "/calendario",
    "/informes", "/estadisticas", "/configuracion", "/usuarios", "/portal",
}
SENSITIVE_KEYS = {
    "dni", "documento", "iban", "alergias", "enfermedades", "medicacion",
    "password", "contraseña", "token", "cookie", "direccion", "domicilio",
    "telefono", "email", "fecha_nacimiento",
}
INJECTION_MARKERS = {
    "ignora las instrucciones", "ignore previous", "system prompt", "developer message",
    "ejecuta mongo", "consulta mongodb", "bypass", "omite los permisos",
}


@dataclass(frozen=True)
class PrivacyDecision:
    allow_external: bool
    reason: str
    safe_message: Optional[str] = None


def _looks_like_personal_value(token: str) -> bool:
    return bool(
        re.fullmatch(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", token)
        or re.fullmatch(r"(?:\+?34)?[6789]\d{8}", re.sub(r"\s", "", token))
        or re.fullmatch(r"ES\d{22}", re.sub(r"\s", "", token).upper())
        or re.fullmatch(r"\d{8}[A-Za-z]", token.upper())
        or re.fullmatch(r"\d{4}-\d{2}-\d{2}", token)
    )


def privacy_gate(message: str, context: Mapping[str, Any]) -> PrivacyDecision:
    """Lista permitida + clasificación semántica + detectores de formato."""
    text = str(message or "").strip()
    if not text or len(text) > MAX_MESSAGE_LENGTH:
        return PrivacyDecision(False, "invalid_length")
    lowered = text.casefold()
    if any(marker in lowered for marker in INJECTION_MARKERS):
        return PrivacyDecision(False, "prompt_injection")
    if any(key in lowered for key in SENSITIVE_KEYS):
        return PrivacyDecision(False, "sensitive_topic")
    if any(_looks_like_personal_value(token.strip(".,;:()[]")) for token in text.split()):
        return PrivacyDecision(False, "personal_pattern")
    if set(context) - {"route", "role", "language", "module"}:
        return PrivacyDecision(False, "context_not_allowed")
    if context.get("route") not in SAFE_ROUTES:
        return PrivacyDecision(False, "route_not_allowed")
    return PrivacyDecision(True, "safe_general_help", text)


class ExternalAssistantProvider:
    """Interfaz desacoplada. Sin transporte inyectado nunca realiza red."""

    def __init__(self, transport: Optional[Callable[[dict], str]] = None, timeout_seconds: float = 5.0):
        self.transport = transport
        self.timeout_seconds = min(max(float(timeout_seconds), 1.0), 15.0)

    @property
    def configured(self) -> bool:
        return self.transport is not None

    def ask(self, message: str, context: Mapping[str, Any]) -> Optional[str]:
        if not self.transport:
            return None
        payload = {
            "message": message,
            "context": {key: context.get(key) for key in ("route", "role", "language", "module")},
            "timeout_seconds": self.timeout_seconds,
        }
        return html.escape(str(self.transport(payload) or ""))[:3000]


def safe_links(links: list[str]) -> list[str]:
    return [link for link in links if link in SAFE_ROUTES]


def answer_help(message: str, user: Mapping[str, Any], route: str, lang: str,
                provider: ExternalAssistantProvider) -> dict:
    context = {"route": route, "role": user.get("role"), "language": lang, "module": route}
    gate = privacy_gate(message, context)
    local = contextual_help(message, str(user.get("role")), lang, route)
    if not gate.allow_external:
        return {
            **local, "links": safe_links(list(local.get("links") or [])),
            "channel": "internal", "external_used": False,
            "privacy_notice": gate.reason,
        }
    external = provider.ask(gate.safe_message or "", context)
    return {
        **local,
        "text": external or local["text"],
        "links": safe_links(list(local.get("links") or [])),
        "channel": "external" if external else "internal",
        "external_used": bool(external),
        "privacy_notice": None if external else "provider_not_configured",
    }


@dataclass
class Proposal:
    id: str
    user_id: str
    session_hash: str
    intent: str
    data: dict
    target_id: Optional[str]
    expected_version: Optional[str]
    preview: dict
    created_at: float
    expires_at: float
    nonce: str
    used: bool = False
    cancelled: bool = False
    result: Optional[dict] = field(default=None)


class ProposalStore:
    def __init__(self, ttl_seconds: int = PROPOSAL_TTL_SECONDS):
        self.ttl_seconds = min(max(int(ttl_seconds), 60), 1800)
        self._items: dict[str, Proposal] = {}

    def create(self, *, user_id: str, session_hash: str, intent: str, data: dict,
               target_id: Optional[str], expected_version: Optional[str], preview: dict) -> Proposal:
        now = time.time()
        proposal = Proposal(
            id=secrets.token_urlsafe(18), user_id=user_id, session_hash=session_hash,
            intent=intent, data=dict(data), target_id=target_id,
            expected_version=expected_version, preview=dict(preview),
            created_at=now, expires_at=now + self.ttl_seconds,
            nonce=secrets.token_urlsafe(24),
        )
        self._items[proposal.id] = proposal
        self.purge()
        return proposal

    def get(self, proposal_id: str, user_id: str, session_hash: str) -> Proposal:
        proposal = self._items.get(proposal_id)
        if not proposal or proposal.user_id != user_id or not secrets.compare_digest(proposal.session_hash, session_hash):
            raise PermissionError("proposal_not_owned")
        if proposal.expires_at <= time.time():
            self._items.pop(proposal_id, None)
            raise TimeoutError("proposal_expired")
        return proposal

    def consume(self, proposal_id: str, user_id: str, session_hash: str, nonce: str) -> Proposal:
        proposal = self.get(proposal_id, user_id, session_hash)
        if proposal.cancelled:
            raise ValueError("proposal_cancelled")
        if proposal.used:
            raise ValueError("proposal_already_used")
        if not secrets.compare_digest(proposal.nonce, nonce):
            raise PermissionError("invalid_confirmation")
        proposal.used = True
        return proposal

    def cancel(self, proposal_id: str, user_id: str, session_hash: str) -> Proposal:
        proposal = self.get(proposal_id, user_id, session_hash)
        if proposal.used:
            raise ValueError("proposal_already_used")
        proposal.cancelled = True
        return proposal

    def purge(self) -> None:
        now = time.time()
        for key in [key for key, value in self._items.items() if value.expires_at <= now]:
            self._items.pop(key, None)


def session_fingerprint(token: str | None) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def public_proposal(proposal: Proposal) -> dict:
    return {
        "id": proposal.id, "intent": proposal.intent, "preview": proposal.preview,
        "expires_at": proposal.expires_at, "confirmation_nonce": proposal.nonce,
        "used": proposal.used, "cancelled": proposal.cancelled,
    }


ACTION_DEFINITIONS = {
    "player.create": {"resource": "players", "action": "create", "required": ["nombre"]},
    "player.update": {"resource": "players", "action": "edit", "required": ["target_id"]},
    "family.create": {"resource": "families", "action": "create", "required": ["progenitor1_nombre"]},
    "family.update": {"resource": "families", "action": "edit", "required": ["target_id"]},
    "player.link_family": {"resource": "players", "action": "edit", "required": ["target_id", "familia_id"]},
    "player.assign_team": {"resource": "players", "action": "edit", "required": ["target_id", "equipo_id"]},
    "inscription.create": {"resource": "inscriptions", "action": "create", "required": ["nombre"]},
    "attendance.update": {"resource": "attendance", "action": "edit", "required": ["training_id", "player_id", "estado"]},
    "callup.prepare": {"resource": "callups", "action": "create", "required": ["match_id"]},
    "equipment.update": {"resource": "equipment", "action": "edit", "required": ["target_id"]},
}
