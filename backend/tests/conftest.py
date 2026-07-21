"""Infraestructura aislada para las pruebas históricas de API.

Los módulos antiguos siguen usando HTTP real para conservar su cobertura de
serialización, cookies y multipart, pero arrancan un backend local por worker y
una base MongoDB temporal independiente. Nunca existe un fallback a Internet.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


BACKEND_DIR = Path(__file__).resolve().parents[1]
HISTORICAL_MODULES = {"backend_test.py", "test_phase2_modules.py", "test_phase3_data_mgmt.py"}


def _worker_number(worker_id: str) -> int:
    return 0 if worker_id == "master" else int(worker_id.removeprefix("gw"))


def _wait_for_backend(url: str, process: subprocess.Popen, log_path: Path) -> None:
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            tail = log_path.read_text(errors="replace")[-2000:] if log_path.exists() else ""
            raise RuntimeError(f"El backend histórico terminó antes de arrancar:\n{tail}")
        try:
            if requests.get(f"{url}/api/public/branding", timeout=0.5).status_code == 200:
                return
        except requests.RequestException:
            time.sleep(0.1)
    raise RuntimeError("El backend histórico local no respondió a tiempo")


@pytest.fixture(scope="session")
def historical_server(worker_id, tmp_path_factory):
    mongo_url = os.environ.get("PHASE10_MONGO_URL")
    if not mongo_url:
        pytest.skip("Las pruebas históricas requieren PHASE10_MONGO_URL apuntando a MongoDB temporal")
    worker_number = _worker_number(worker_id)
    port = 18120 + worker_number
    db_name = f"ikas_txiki_phase10_{worker_id}"
    run_dir = tmp_path_factory.mktemp(f"phase10-api-{worker_id}")
    log_path = run_dir / "backend.log"
    env = {
        **os.environ,
        "MONGO_URL": mongo_url,
        "DB_NAME": db_name,
        "JWT_SECRET": "phase10-local-fictitious-secret-000000000000",
        "ADMIN_USER": f"phase10_admin_{worker_id}",
        "ADMIN_PASSWORD": "phase10-admin-fictitious-password",
        "CORS_ORIGINS": f"http://127.0.0.1:{port}",
        "SMTP_HOST": "", "SMTP_FROM": "", "SMTP_USER": "", "SMTP_PASSWORD": "",
        "WHATSAPP_PROVIDER_URL": "", "WHATSAPP_TOKEN": "", "SMS_PROVIDER_URL": "", "SMS_TOKEN": "",
    }
    mongo = MongoClient(mongo_url, serverSelectionTimeoutMS=2000)
    mongo.drop_database(db_name)
    log_handle = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=BACKEND_DIR, env=env, stdout=log_handle, stderr=subprocess.STDOUT,
    )
    url = f"http://127.0.0.1:{port}"
    try:
        _wait_for_backend(url, process, log_path)
        yield {"url": url, "username": env["ADMIN_USER"], "password": env["ADMIN_PASSWORD"], "db_name": db_name}
    finally:
        process.terminate()
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill(); process.wait(timeout=3)
        log_handle.close()
        mongo.drop_database(db_name)
        mongo.close()
        shutil.rmtree(run_dir, ignore_errors=True)


class LocalApiSession:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()

    def _url(self, path: str) -> str:
        if path.startswith("http://") or path.startswith("https://"):
            raise AssertionError("Las pruebas históricas no pueden acceder a servicios externos")
        return f"{self.base_url}{path}"

    def get(self, path: str, **kwargs):
        return self.session.get(self._url(path), **kwargs)

    def post(self, path: str, **kwargs):
        return self.session.post(self._url(path), **kwargs)

    def put(self, path: str, **kwargs):
        return self.session.put(self._url(path), **kwargs)

    def delete(self, path: str, **kwargs):
        return self.session.delete(self._url(path), **kwargs)

    def close(self):
        self.session.close()


@pytest.fixture(scope="module")
def session(request, historical_server):
    if request.path.name not in HISTORICAL_MODULES:
        raise RuntimeError("La fixture HTTP histórica solo puede usarse en los tres módulos autorizados")
    client = LocalApiSession(historical_server["url"])
    login = client.post("/api/auth/login", json={
        "username": historical_server["username"], "password": historical_server["password"],
    })
    assert login.status_code == 200, login.text
    token = login.cookies.get("ikastxiki_session")
    client.session.cookies.clear()
    client.session.cookies.set("ikastxiki_session", token, secure=False, path="/")
    reset = client.post("/api/clear-all")
    assert reset.status_code == 200, reset.text
    try:
        yield client
    finally:
        client.post("/api/clear-all")
        client.close()
