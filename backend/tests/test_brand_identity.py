from brand_assets import BRAND_NAME, CLUB_NAME, LOGO_PATH, logo_bytes
from server import attendance_export_pdf, build_authorization_pdf


def test_official_logo_is_the_single_shared_backend_asset():
    assert LOGO_PATH.name == "ikas-txiki-logo.png"
    payload = logo_bytes()
    assert payload.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(payload) > 10_000


def test_configured_invalid_logo_falls_back_to_official_asset():
    assert logo_bytes("data:image/png;base64,not-valid") == logo_bytes()


def test_authorization_and_attendance_pdfs_include_logo_and_selectable_text():
    authorization = build_authorization_pdf(
        {"tipo": "imagen", "firmante": "Tutor ficticio"},
        {"nombre": "Jugador", "apellidos": "Ficticio", "fecha_nacimiento": "2015-01-01"},
        {"club_nombre": CLUB_NAME, "temporada_actual": "2026-2027"},
    ).getvalue()
    attendance = attendance_export_pdf({
        "summary": {
            "desde": "2026-07-01", "hasta": "2026-07-30", "presente": 1,
            "justificada": 0, "injustificada": 0, "lesion": 0, "porcentaje_presencia": 100,
        }
    }, "es").getvalue()
    for payload in (authorization, attendance):
        assert b"/Subtype /Image" in payload
        assert b"/Font" in payload and b"/Subtype /Type1" in payload


def test_brand_names_are_public_corporate_text_only():
    assert BRAND_NAME == "Ikas-Txiki Manager"
    assert CLUB_NAME == "Zornotzako Futbol Eskola"
