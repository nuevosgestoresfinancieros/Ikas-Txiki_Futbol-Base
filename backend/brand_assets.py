"""Recursos visuales corporativos compartidos por documentos y comunicaciones."""
from __future__ import annotations

import base64
import io
from pathlib import Path
from typing import Optional

from reportlab.lib.units import mm
from reportlab.platypus import Image


BRAND_NAME = "Ikas-Txiki Manager"
CLUB_NAME = "Zornotzako Futbol Eskola"
BRAND_BLUE = "#164F70"
BRAND_TEAL = "#167E83"
LOGO_PATH = Path(__file__).resolve().parent.parent / "frontend" / "public" / "brand" / "ikas-txiki-logo.png"
MAX_CONFIGURED_LOGO_BYTES = 2 * 1024 * 1024


def logo_bytes(configured_logo: Optional[str] = None) -> bytes:
    """Devuelve el logo configurado válido o el recurso oficial de la aplicación."""
    if isinstance(configured_logo, str) and configured_logo.startswith(
        ("data:image/png;base64,", "data:image/jpeg;base64,")
    ):
        try:
            payload = base64.b64decode(configured_logo.split(",", 1)[1], validate=True)
            if 0 < len(payload) <= MAX_CONFIGURED_LOGO_BYTES:
                return payload
        except (ValueError, TypeError):
            pass
    return LOGO_PATH.read_bytes()


def pdf_logo(configured_logo: Optional[str] = None, size_mm: float = 18) -> Image:
    size = size_mm * mm
    return Image(io.BytesIO(logo_bytes(configured_logo)), width=size, height=size)
