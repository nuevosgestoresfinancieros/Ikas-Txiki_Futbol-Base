"""Backend API tests for Phase 3 Data Management:
seed-demo, clear-all, export-excel, import-excel.
Destructive: wipes DB. Re-seeds at the end.
"""
import os
import io
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://ikas-futbol-base.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


# ---------- Seed demo ----------
class TestSeedDemo:
    def test_seed_demo(self, session):
        r = session.post(f"{API}/seed-demo")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("ok") is True
        assert d.get("teams", 0) >= 3
        assert d.get("players", 0) >= 5

    def test_dashboard_after_seed(self, session):
        r = session.get(f"{API}/dashboard")
        assert r.status_code == 200
        d = r.json()
        assert d["total_jugadores"] >= 5
        assert isinstance(d.get("alertas"), list)


# ---------- Export -> Import round trip ----------
class TestExcelRoundTrip:
    exported_bytes = None

    def test_export_excel_returns_xlsx(self, session):
        r = session.get(f"{API}/export-excel")
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "spreadsheetml" in ct or "octet-stream" in ct
        assert len(r.content) > 1000  # non-trivial file
        # xlsx files start with PK (ZIP magic)
        assert r.content[:2] == b"PK"
        TestExcelRoundTrip.exported_bytes = r.content

    def test_clear_all_wipes(self, session):
        r = session.post(f"{API}/clear-all")
        assert r.status_code == 200
        assert r.json().get("ok") is True

        d = session.get(f"{API}/dashboard").json()
        assert d["total_jugadores"] == 0

    def test_import_excel_restores(self, session):
        assert TestExcelRoundTrip.exported_bytes is not None
        files = {"file": ("backup.xlsx", io.BytesIO(TestExcelRoundTrip.exported_bytes),
                          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        r = session.post(f"{API}/import-excel", files=files)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "imported" in body
        # players sheet should have rows after re-import
        assert body["imported"].get("players", 0) >= 5

    def test_dashboard_after_import(self, session):
        d = session.get(f"{API}/dashboard").json()
        assert d["total_jugadores"] >= 5


# ---------- Restore demo at the end so the app remains usable ----------
class TestZReseed:
    def test_final_reseed(self, session):
        r = session.post(f"{API}/seed-demo")
        assert r.status_code == 200
