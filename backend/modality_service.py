"""Catálogo y normalización segura de modalidades deportivas.

Esta capa no conoce MongoDB ni modifica ``settings``. Recibe el documento de
configuración como entrada y devuelve modelos validados para que las futuras
integraciones decidan explícitamente cuándo y cómo persistirlos.
"""
from __future__ import annotations

import re
import unicodedata
from copy import deepcopy
from datetime import datetime
from typing import Any, Iterable, Literal, Mapping, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


MODALITY_CODE_RE = re.compile(r"^[A-Z][A-Z0-9_]{1,15}$")


def normalize_alias(value: Any) -> str:
    """Normaliza solo aspectos ortográficos, sin inferir una modalidad."""
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "", text.casefold())


class ModalityDefinition(BaseModel):
    """Definición estable de una modalidad almacenada en ``settings.modalities``."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    code: str
    name_es: str = Field(min_length=1, max_length=80)
    name_eu: str = Field(min_length=1, max_length=80)
    active: bool = True
    sort_order: int = Field(ge=0, le=10_000)
    aliases: list[str] = Field(default_factory=list)
    max_players: int = Field(gt=0, le=100)
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        code = value.strip().upper()
        if not MODALITY_CODE_RE.fullmatch(code):
            raise ValueError("El código de modalidad no es válido")
        return code

    @field_validator("aliases")
    @classmethod
    def validate_aliases(cls, values: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()
        for value in values:
            alias = value.strip()
            key = normalize_alias(alias)
            if not key:
                raise ValueError("Los alias de modalidad no pueden estar vacíos")
            if key not in seen:
                result.append(alias)
                seen.add(key)
        return result


class NormalizedModality(BaseModel):
    """Resultado auditable; conserva siempre la entrada exacta recibida."""

    original_value: Any = None
    status: Literal["recognized", "pending_review"]
    code: Optional[str] = None
    active: Optional[bool] = None
    matched_alias: Optional[str] = None


DEFAULT_MODALITIES = (
    ModalityDefinition(
        code="F7", name_es="Fútbol 7", name_eu="7ko futbola", active=True,
        sort_order=10, aliases=["F7", "F-7", "F 7", "Fútbol 7", "Futbol 7"],
        max_players=18, updated_at=None, updated_by="system:compatibility",
    ),
    ModalityDefinition(
        code="F11", name_es="Fútbol 11", name_eu="11ko futbola", active=True,
        sort_order=20, aliases=["F11", "F-11", "F 11", "Fútbol 11", "Futbol 11"],
        max_players=25, updated_at=None, updated_by="system:compatibility",
    ),
)


def validate_catalog(entries: Iterable[ModalityDefinition | Mapping[str, Any]]) -> list[ModalityDefinition]:
    """Valida códigos y garantiza que cada equivalencia tenga un único dueño."""
    catalog = [entry if isinstance(entry, ModalityDefinition) else ModalityDefinition.model_validate(entry)
               for entry in entries]
    if not catalog:
        raise ValueError("El catálogo de modalidades no puede estar vacío")
    codes: set[str] = set()
    alias_owners: dict[str, str] = {}
    for entry in catalog:
        if entry.code in codes:
            raise ValueError(f"Código de modalidad duplicado: {entry.code}")
        codes.add(entry.code)
        for alias in (entry.code, entry.name_es, entry.name_eu, *entry.aliases):
            key = normalize_alias(alias)
            owner = alias_owners.get(key)
            if owner and owner != entry.code:
                raise ValueError(f"Alias de modalidad compartido por {owner} y {entry.code}")
            alias_owners[key] = entry.code
    return sorted(catalog, key=lambda item: (item.sort_order, item.code))


def catalog_from_settings(settings: Optional[Mapping[str, Any]] = None) -> list[ModalityDefinition]:
    """Lee ``settings.modalities`` sin persistir ni completar el documento recibido."""
    raw = (settings or {}).get("modalities")
    if raw is None:
        return [item.model_copy(deep=True) for item in DEFAULT_MODALITIES]
    return validate_catalog(deepcopy(raw))


def normalize_modality(
    value: Any, catalog: Optional[Iterable[ModalityDefinition | Mapping[str, Any]]] = None,
) -> NormalizedModality:
    """Reconoce alias inequívocos; vacíos y desconocidos quedan pendientes."""
    entries = validate_catalog(DEFAULT_MODALITIES if catalog is None else catalog)
    key = normalize_alias(value)
    if not key:
        return NormalizedModality(original_value=value, status="pending_review")
    for entry in entries:
        for alias in (entry.code, entry.name_es, entry.name_eu, *entry.aliases):
            if normalize_alias(alias) == key:
                return NormalizedModality(
                    original_value=value, status="recognized", code=entry.code,
                    active=entry.active, matched_alias=alias,
                )
    return NormalizedModality(original_value=value, status="pending_review")


def modality_capacity(
    code: Any, catalog: Optional[Iterable[ModalityDefinition | Mapping[str, Any]]] = None,
) -> Optional[int]:
    """Devuelve la capacidad configurada; nunca inventa un valor por defecto."""
    requested = str(code or "").strip().upper()
    for entry in validate_catalog(DEFAULT_MODALITIES if catalog is None else catalog):
        if entry.code == requested:
            return entry.max_players
    return None


def active_modalities(
    catalog: Optional[Iterable[ModalityDefinition | Mapping[str, Any]]] = None,
) -> list[ModalityDefinition]:
    source = DEFAULT_MODALITIES if catalog is None else catalog
    return [entry for entry in validate_catalog(source) if entry.active]
