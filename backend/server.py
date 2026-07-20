from fastapi import FastAPI, APIRouter, HTTPException, UploadFile, File, Form, Depends, Cookie, Response, Request
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import io
import base64
import html as html_lib
import json
import logging
import math
import shutil
import time
from collections import defaultdict, deque
from pathlib import Path
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any
import uuid
import pandas as pd
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable, KeepTogether, Image as PdfImage
from datetime import datetime, timezone, date, timedelta
from openpyxl import Workbook
from pymongo.errors import DuplicateKeyError

from authz import (
    ROLES, ROLE_PERMISSIONS, current_user_context, enforce_permission, enforce_related_scope,
    has_permission, ids,
    merge_query, public_user, route_permission,
)
from dashboard_service import pending_callups, player_callup_status, prioritized_alerts, weekly_attendance
from attendance_service import (
    ATTENDANCE_STATES, attendance_history, attendance_rows, attendance_summary,
    attendance_trend, callup_attendance_comparison, player_percentages, repeated_absence_alerts,
)
from callup_service import (
    VALID_STATUSES, apply_response, is_late, normalize_callup, normalize_status,
    response_counts,
)
from calendar_service import (
    CALENDAR_TYPES, aggregate_calendar_events, calendar_to_ical,
    next_calendar_event, subscription_capability,
)
from portal_service import document_status, portal_attendance, portal_callups, safe_payment, safe_player, upcoming
from notification_service import dispatch_email, make_notification, notification_enabled, provider_configuration
from inscription_import_service import (
    SEASON as IMPORT_SEASON, SAFE_PLAYER_FIELDS, ImportValidationError,
    analyze_rows, decode_plan, encode_plan, encrypt_iban, family_key,
    file_sha256, identity_key, masked_iban, merge_nonempty, normalize_key,
    parse_excel,
)
from import_staging_service import (
    ALLOWED_RECORD_FIELDS, audit_event, draft_summary, effective_records, expiry, field_is_valid,
    prepare_records, public_draft, valid_iban as staging_valid_iban,
)


ROOT_DIR = Path(__file__).parent
UPLOADS_DIR = ROOT_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ── Auth config ──────────────────────────────────────────────
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = 8
ADMIN_USER = os.environ.get("ADMIN_USER")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET debe existir y tener al menos 32 caracteres")
if not ADMIN_USER or not ADMIN_PASSWORD or ADMIN_PASSWORD.lower() == "admin":
    raise RuntimeError("Configura ADMIN_USER y una ADMIN_PASSWORD segura en el entorno")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
LOGIN_WINDOW_SECONDS = 10 * 60
LOGIN_MAX_ATTEMPTS = 6
login_attempts = defaultdict(deque)

def create_access_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    return jwt.encode({**data, "exp": expire}, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def load_user(username: str) -> Optional[dict]:
    if username == ADMIN_USER:
        return {
            "id": "environment-admin", "username": username, "role": "admin",
            "active": True, "assigned_team_ids": [], "language": "es",
            "notification_preferences": {},
        }
    return await db["users"].find_one({"username": username}, {"_id": 0, "password_hash": 0})


async def get_current_user(request: Request):
    token = request.cookies.get("ikastxiki_session")
    if not token:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await load_user(username)
        if not user or not user.get("active", True):
            raise HTTPException(status_code=403, detail="Usuario inactivo o sin acceso")
        request.state.current_user = user
        current_user_context.set(user)
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Sesión expirada")

app = FastAPI(title="Ikas-Txiki Manager API")

# ── Auth endpoints ────────────────────────────────────────────
@app.post("/api/auth/login")
async def login(request: Request, response: Response, data: Dict[str, Any]):
    username = data.get("username", "").strip()
    password = data.get("password", "")
    client_ip = request.client.host if request.client else "unknown"
    attempt_key = f"{client_ip}:{username.lower()}"
    now = time.monotonic()
    attempts = login_attempts[attempt_key]
    while attempts and now - attempts[0] > LOGIN_WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera unos minutos e inténtalo de nuevo")

    # Verificar contra usuario admin del .env
    valid_user = username == ADMIN_USER and password == ADMIN_PASSWORD
    db_user = None
    # También buscar en colección users de MongoDB
    if not valid_user:
        db_user = await db["users"].find_one({"username": username})
        if db_user and db_user.get("active", True) and pwd_context.verify(password, db_user.get("password_hash", "")):
            valid_user = True
    if not valid_user:
        attempts.append(now)
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    login_attempts.pop(attempt_key, None)
    if db_user:
        await db["users"].update_one({"id": db_user["id"]}, {"$set": {"last_access_at": now_iso()}})
    token = create_access_token({"sub": username})
    response.set_cookie(
        key="ikastxiki_session",
        value=token,
        httponly=True,
        secure=True,
        samesite="strict",
        max_age=JWT_EXPIRE_HOURS * 3600,
        path="/",
    )
    user = await load_user(username)
    return {"ok": True, "user": public_user(user), "username": username}


@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="ikastxiki_session", path="/")
    return {"ok": True}


@app.get("/api/auth/me")
async def me(current_user: dict = Depends(get_current_user)):
    return public_user(current_user)


@app.get("/api/public/branding")
async def public_branding(response: Response):
    """Expone solo la identidad visual necesaria antes de iniciar sesión."""
    doc = await db.settings.find_one(
        {"id": "global"},
        {"_id": 0, "club_nombre": 1, "club_logo": 1, "temporada_actual": 1},
    )
    response.headers["Cache-Control"] = "public, max-age=300"
    return doc or {
        "club_nombre": "Ikas-Txiki",
        "club_logo": None,
        "temporada_actual": None,
    }


api_router = APIRouter(prefix="/api")


async def authorize_request(request: Request, user: dict = Depends(get_current_user)):
    resource, action = route_permission(request)
    enforce_permission(user, resource, action)
    return user


# ---------- Helpers ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


CATEGORIES = [
    {"name": "Prebenjamín", "min_age": 6, "max_age": 7},
    {"name": "Benjamín", "min_age": 8, "max_age": 9},
    {"name": "Alevín", "min_age": 10, "max_age": 11},
    {"name": "Infantil", "min_age": 12, "max_age": 13},
    {"name": "Cadete", "min_age": 14, "max_age": 15},
    {"name": "Juvenil", "min_age": 16, "max_age": 18},
]


def compute_category(birthdate: Optional[str]) -> Optional[str]:
    if not birthdate:
        return None
    try:
        bd = datetime.fromisoformat(birthdate).date() if "T" in birthdate or "-" in birthdate else None
        if bd is None:
            return None
    except Exception:
        try:
            bd = datetime.strptime(birthdate[:10], "%Y-%m-%d").date()
        except Exception:
            return None
    today = date.today()
    # Football season age: age reached during the season year
    season_year = today.year if today.month >= 7 else today.year - 1
    age = season_year - bd.year
    for c in CATEGORIES:
        if c["min_age"] <= age <= c["max_age"]:
            return c["name"]
    if age < 6:
        return "Querubín"
    return "Senior"


def clean(doc: dict) -> dict:
    doc.pop("_id", None)
    return doc


# ---------- Generic CRUD factory ----------
PLAYER_SCOPED_COLLECTIONS = {"payments", "authorizations", "stats", "equipment"}


async def user_player_ids(user: dict) -> list[str]:
    if user.get("role") == "player":
        return ids([user.get("player_id")])
    if user.get("role") == "family":
        explicit = ids(user.get("player_ids") or [])
        linked = await db.players.find(
            {"familia_id": user.get("family_id")}, {"_id": 0, "id": 1}
        ).to_list(100)
        return sorted(set(explicit + ids(row.get("id") for row in linked)))
    team_ids = ids(user.get("assigned_team_ids") or [])
    if team_ids:
        linked = await db.players.find(
            {"equipo_id": {"$in": team_ids}}, {"_id": 0, "id": 1}
        ).to_list(5000)
        return ids(row.get("id") for row in linked)
    return []


async def scope_for_collection(coll: str, user: Optional[dict] = None) -> Optional[dict]:
    user = user or current_user_context.get()
    if not user:
        return {"id": {"$in": []}}
    if coll == "notifications":
        return {"$or": [
            {"recipient_user_id": user.get("id")},
            {"recipient_username": user.get("username")},
        ]}
    if user.get("role") == "admin":
        return None
    role = user.get("role")
    team_ids = ids(user.get("assigned_team_ids") or [])
    player_ids = await user_player_ids(user)
    if role in {"coordinator", "coach"}:
        if coll == "teams":
            return {"id": {"$in": team_ids}}
        if coll in {"players", "matches", "trainings", "callups"}:
            return {"equipo_id": {"$in": team_ids}}
        if coll in PLAYER_SCOPED_COLLECTIONS or coll == "inscriptions":
            return {"player_id": {"$in": player_ids}}
        if coll == "families":
            family_ids = await db.players.distinct("familia_id", {"id": {"$in": player_ids}})
            return {"id": {"$in": ids(family_ids)}}
        if coll == "communications":
            return {"$or": [
                {"destinatario_tipo": "equipo", "destinatario_id": {"$in": team_ids}},
                {"destinatario_tipo": "individual", "destinatario_id": {"$in": player_ids}},
            ]}
        if coll == "club_events":
            return {"$or": [
                {"equipo_id": {"$in": team_ids}}, {"equipo_id": None}, {"equipo_id": {"$exists": False}},
            ]}
    if role in {"family", "player"}:
        if coll == "players":
            return {"id": {"$in": player_ids}}
        if coll == "families":
            return {"id": user.get("family_id")}
        team_ids = ids(await db.players.distinct("equipo_id", {"id": {"$in": player_ids}}))
        if coll == "teams":
            return {"id": {"$in": team_ids}}
        if coll in {"matches", "trainings"}:
            return {"equipo_id": {"$in": team_ids}}
        if coll == "callups":
            return {"convocados.player_id": {"$in": player_ids}}
        if coll in PLAYER_SCOPED_COLLECTIONS or coll == "inscriptions":
            return {"player_id": {"$in": player_ids}}
        if coll == "communications":
            targets = player_ids + ids([user.get("family_id")])
            return {"$or": [
                {"destinatario_tipo": "individual", "destinatario_id": {"$in": targets}},
                {"destinatario_tipo": "equipo", "destinatario_id": {"$in": team_ids}},
            ]}
        if coll == "club_events":
            return {"$or": [
                {"equipo_id": {"$in": team_ids}}, {"equipo_id": None}, {"equipo_id": {"$exists": False}},
            ]}
    return {"id": {"$in": []}}


async def ensure_data_scope(coll: str, data: dict) -> None:
    user = current_user_context.get()
    if not user or user.get("role") == "admin":
        return
    role = user.get("role")
    if role not in {"coordinator", "coach"}:
        raise HTTPException(status_code=403, detail="No puedes modificar datos de este módulo")
    team_ids = set(ids(user.get("assigned_team_ids") or []))
    if coll in {"teams", "players", "matches", "trainings", "callups"}:
        target = data.get("id") if coll == "teams" else data.get("equipo_id")
        if target not in team_ids:
            raise HTTPException(status_code=403, detail="El elemento no pertenece a tus equipos asignados")
    if coll == "club_events" and data.get("equipo_id") not in team_ids:
        raise HTTPException(status_code=403, detail="El evento no pertenece a tus equipos asignados")
    player_ids = set(await user_player_ids(user))
    if coll == "communications" and data.get("destinatario_tipo") == "categoria":
        category_team_ids = set(ids(await db.teams.distinct("id", {"categoria": data.get("destinatario_id")})))
        if not category_team_ids or not category_team_ids.issubset(team_ids):
            raise HTTPException(status_code=403, detail="La categoría contiene equipos fuera de tu ámbito")
        return
    if coll == "players" and data.get("familia_id"):
        family_scope = await scope_for_collection("families", user)
        if not await db.families.find_one(merge_query({"id": data["familia_id"]}, family_scope)):
            raise HTTPException(status_code=403, detail="La familia no pertenece a tu ámbito")
    enforce_related_scope(coll, data, team_ids, player_ids)
    if coll == "callups":
        if data.get("match_id") and not await db.matches.find_one({
            "id": data["match_id"], "equipo_id": {"$in": list(team_ids)},
        }):
            raise HTTPException(status_code=403, detail="El partido no pertenece a tu ámbito")
    if coll == "trainings" and data.get("callup_id"):
        if not await db.callups.find_one({"id": data["callup_id"], "equipo_id": {"$in": list(team_ids)}}):
            raise HTTPException(status_code=403, detail="La convocatoria no pertenece a tus equipos asignados")
    if coll in PLAYER_SCOPED_COLLECTIONS and data.get("player_id"):
        if data["player_id"] not in player_ids:
            raise HTTPException(status_code=403, detail="El jugador no pertenece a tu ámbito")


async def list_docs(coll: str, query: dict = None):
    scoped = merge_query(query, await scope_for_collection(coll))
    cursor = db[coll].find(scoped, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(5000)


async def notification_users(team_ids: Optional[list[str]] = None, player_ids: Optional[list[str]] = None,
                             family_ids: Optional[list[str]] = None, include_admins: bool = False) -> list[dict]:
    clauses = []
    if team_ids:
        clauses.append({"assigned_team_ids": {"$in": team_ids}})
    if player_ids:
        clauses.append({"player_id": {"$in": player_ids}})
    if family_ids:
        clauses.append({"family_id": {"$in": family_ids}})
    if include_admins:
        clauses.append({"role": "admin"})
    if not clauses:
        return []
    return await db.users.find({"active": {"$ne": False}, "$or": clauses}, {"_id": 0}).to_list(5000)


async def enqueue_notifications(users: list[dict], notification_type: str, title: str, message: str,
                                link: Optional[str] = None, priority: str = "normal",
                                related: Optional[dict] = None, dedupe_key: Optional[str] = None) -> int:
    created = 0
    for user in users:
        if not notification_enabled(user.get("notification_preferences") or {}, notification_type):
            continue
        document = make_notification(user, notification_type, title, message, link, priority, related,
                                     dedupe_key=dedupe_key)
        query = {"recipient_user_id": user.get("id"), "dedupe_key": dedupe_key} if dedupe_key else {"id": document["id"]}
        result = await db.notifications.update_one(query, {"$setOnInsert": document}, upsert=True)
        created += int(bool(result.upserted_id))
    return created


async def users_for_team_players(team_id: Optional[str], player_ids: Optional[list[str]] = None,
                                 include_admins: bool = False) -> list[dict]:
    ids_for_players = player_ids or []
    if team_id and not ids_for_players:
        ids_for_players = await db.players.distinct("id", {"equipo_id": team_id})
    family_ids = await db.players.distinct("familia_id", {"id": {"$in": ids_for_players}}) if ids_for_players else []
    return await notification_users([team_id] if team_id else [], ids(ids_for_players), ids(family_ids), include_admins)


async def get_doc(coll: str, _id: str):
    query = merge_query({"id": _id}, await scope_for_collection(coll))
    doc = await db[coll].find_one(query, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="No encontrado")
    return doc


async def insert_doc(coll: str, data: dict):
    await ensure_data_scope(coll, data)
    data["id"] = new_id()
    data["created_at"] = now_iso()
    data["updated_at"] = now_iso()
    await db[coll].insert_one(dict(data))
    return clean(data)


async def update_doc(coll: str, _id: str, data: dict):
    query = merge_query({"id": _id}, await scope_for_collection(coll))
    existing = await db[coll].find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="No encontrado")
    data = {k: v for k, v in data.items() if v is not None or k in data}
    data["updated_at"] = now_iso()
    await ensure_data_scope(coll, {**existing, **data})
    await db[coll].update_one(query, {"$set": data})
    return await get_doc(coll, _id)


async def delete_doc(coll: str, _id: str):
    query = merge_query({"id": _id}, await scope_for_collection(coll))
    res = await db[coll].delete_one(query)
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="No encontrado")
    return {"ok": True}


# ================= USERS / RBAC =================
class NotificationPreferences(BaseModel):
    in_app: bool = True
    email: bool = True
    callups: bool = True
    schedule_changes: bool = True
    payments: bool = True
    documents: bool = True


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    active: bool = True
    assigned_team_ids: List[str] = Field(default_factory=list)
    player_id: Optional[str] = None
    family_id: Optional[str] = None
    language: str = "es"
    notification_preferences: NotificationPreferences = Field(default_factory=NotificationPreferences)

    @field_validator("username")
    @classmethod
    def validate_username(cls, value: str):
        value = value.strip()
        if len(value) < 3 or not value.replace("_", "").replace("-", "").isalnum():
            raise ValueError("El usuario debe tener al menos 3 caracteres alfanuméricos")
        return value

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str):
        if len(value) < 12:
            raise ValueError("La contraseña debe tener al menos 12 caracteres")
        return value

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str):
        if value not in ROLES:
            raise ValueError("Rol no válido")
        return value

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: str):
        if value not in {"es", "eu"}:
            raise ValueError("Idioma no válido")
        return value


class UserUpdate(BaseModel):
    active: Optional[bool] = None
    assigned_team_ids: Optional[List[str]] = None
    player_id: Optional[str] = None
    family_id: Optional[str] = None
    language: Optional[str] = None
    notification_preferences: Optional[NotificationPreferences] = None

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: Optional[str]):
        if value is not None and value not in {"es", "eu"}:
            raise ValueError("Idioma no válido")
        return value


def validate_user_relationships(data: dict) -> None:
    role = data.get("role")
    if role == "player" and not data.get("player_id"):
        raise HTTPException(status_code=422, detail="El rol jugador requiere un jugador asociado")
    if role == "family" and not data.get("family_id"):
        raise HTTPException(status_code=422, detail="El rol familia requiere una familia asociada")
    if role in {"coordinator", "coach"} and not data.get("assigned_team_ids"):
        raise HTTPException(status_code=422, detail="El rol requiere al menos un equipo asignado")


@api_router.get("/users/permissions")
async def get_permission_matrix():
    return {
        role: {resource: sorted(actions) for resource, actions in resources.items()}
        for role, resources in ROLE_PERMISSIONS.items()
    }


@api_router.post("/users")
async def create_user(user: UserCreate):
    data = user.model_dump()
    validate_user_relationships(data)
    if data["username"] == ADMIN_USER or await db.users.find_one({"username": data["username"]}):
        raise HTTPException(status_code=409, detail="El nombre de usuario ya existe")
    password = data.pop("password")
    data.update({
        "id": new_id(), "password_hash": pwd_context.hash(password),
        "created_at": now_iso(), "updated_at": now_iso(), "last_access_at": None,
    })
    data["notification_preferences"] = dict(data["notification_preferences"])
    await db.users.insert_one(dict(data))
    return public_user(data)


@api_router.get("/users")
async def get_users():
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("username", 1).to_list(5000)
    return [public_user(user) for user in users]


@api_router.get("/users/{user_id}")
async def get_user(user_id: str):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="No encontrado")
    return public_user(user)


@api_router.put("/users/{user_id}")
async def edit_user(user_id: str, changes: UserUpdate):
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="No encontrado")
    data = changes.model_dump(exclude_unset=True)
    if data.get("notification_preferences") is not None:
        data["notification_preferences"] = dict(data["notification_preferences"])
    candidate = {**existing, **data}
    validate_user_relationships(candidate)
    data["updated_at"] = now_iso()
    await db.users.update_one({"id": user_id}, {"$set": data})
    return public_user(candidate)


@api_router.delete("/users/{user_id}")
async def deactivate_user(user_id: str):
    result = await db.users.update_one(
        {"id": user_id}, {"$set": {"active": False, "updated_at": now_iso()}}
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="No encontrado")
    return {"ok": True}


# ================= PLAYERS =================
class Player(BaseModel):
    # Datos del formulario
    fecha_inscripcion: Optional[str] = None
    email_formulario: Optional[str] = None
    nombre: str
    apellidos: Optional[str] = ""
    fecha_nacimiento: Optional[str] = None
    centro_escolar: Optional[str] = None
    # Progenitores
    progenitor1_nombre: Optional[str] = None
    progenitor1_telefono: Optional[str] = None
    progenitor1_email: Optional[str] = None
    progenitor2_nombre: Optional[str] = None
    progenitor2_telefono: Optional[str] = None
    progenitor2_email: Optional[str] = None
    domicilio: Optional[str] = None
    # Deportivos / administrativos
    foto: Optional[str] = None  # base64 data url
    categoria: Optional[str] = None
    equipo_id: Optional[str] = None
    dorsal: Optional[str] = None
    posicion: Optional[str] = None
    estado: str = "pendiente_documentacion"  # activo, baja, lesionado, pendiente_documentacion, en_prueba
    numero_licencia: Optional[str] = None
    fecha_alta: Optional[str] = None
    fecha_baja: Optional[str] = None
    nueva_incorporacion: bool = False
    segundo_hermano: bool = False
    hermano_vinculado: Optional[str] = None
    descuento: Optional[float] = 0
    observaciones: Optional[str] = None
    familia_id: Optional[str] = None
    # Salud
    alergias: Optional[str] = None
    enfermedades: Optional[str] = None
    medicacion: Optional[str] = None
    seguro_medico: Optional[str] = None
    contacto_emergencia: Optional[str] = None
    telefono_emergencia: Optional[str] = None
    observaciones_medicas: Optional[str] = None
    # Equipación
    talla_camiseta: Optional[str] = None
    talla_pantalon: Optional[str] = None
    talla_chandal: Optional[str] = None
    talla_medias: Optional[str] = None
    talla_calzado: Optional[str] = None
    equipacion_entregada: bool = False
    fecha_entrega_equipacion: Optional[str] = None
    observaciones_material: Optional[str] = None
    # Documentación
    doc_dni_jugador: bool = False
    doc_dni_tutor: bool = False
    doc_foto: bool = False
    doc_autorizacion: bool = False
    doc_justificante_pago: bool = False
    doc_ficha_federativa: bool = False
    estado_documental: str = "pendiente"  # completo, pendiente, incompleto
    fecha_revision_doc: Optional[str] = None
    observaciones_doc: Optional[str] = None


@api_router.post("/players")
async def create_player(player: Player):
    data = player.model_dump()
    if not data.get("fecha_inscripcion"):
        data["fecha_inscripcion"] = now_iso()
    if data.get("fecha_nacimiento"):
        data["categoria"] = compute_category(data["fecha_nacimiento"])
    return await insert_doc("players", data)


@api_router.get("/players")
async def get_players(equipo_id: Optional[str] = None, estado: Optional[str] = None,
                      categoria: Optional[str] = None, q: Optional[str] = None):
    query: Dict[str, Any] = {}
    if equipo_id:
        query["equipo_id"] = equipo_id
    if estado:
        query["estado"] = estado
    if categoria:
        query["categoria"] = categoria
    docs = await list_docs("players", query)
    if q:
        ql = q.lower()
        docs = [d for d in docs if ql in (f"{d.get('nombre','')} {d.get('apellidos','')}").lower()]
    return docs


@api_router.get("/players/{player_id}")
async def get_player(player_id: str):
    return await get_doc("players", player_id)


@api_router.put("/players/{player_id}")
async def edit_player(player_id: str, player: Player):
    data = player.model_dump()
    if data.get("fecha_nacimiento"):
        data["categoria"] = compute_category(data["fecha_nacimiento"])
    return await update_doc("players", player_id, data)


@api_router.delete("/players/{player_id}")
async def remove_player(player_id: str):
    return await delete_doc("players", player_id)


# ================= FAMILIES =================
class Family(BaseModel):
    progenitor1_nombre: Optional[str] = None
    progenitor1_telefono: Optional[str] = None
    progenitor1_email: Optional[str] = None
    progenitor2_nombre: Optional[str] = None
    progenitor2_telefono: Optional[str] = None
    progenitor2_email: Optional[str] = None
    domicilio: Optional[str] = None
    contacto_principal: Optional[str] = None
    preferencia_comunicacion: Optional[str] = "email"  # email, telefono, whatsapp
    observaciones: Optional[str] = None


@api_router.post("/families")
async def create_family(family: Family):
    return await insert_doc("families", family.model_dump())


@api_router.get("/families")
async def get_families():
    fams = await list_docs("families")
    players = await list_docs("players")
    for f in fams:
        linked = [p for p in players if p.get("familia_id") == f["id"]]
        f["num_hijos"] = len(linked)
        f["hijos"] = [{"id": p["id"], "nombre": f"{p.get('nombre','')} {p.get('apellidos','')}"} for p in linked]
    return fams


@api_router.get("/families/{family_id}")
async def get_family(family_id: str):
    return await get_doc("families", family_id)


@api_router.put("/families/{family_id}")
async def edit_family(family_id: str, family: Family):
    return await update_doc("families", family_id, family.model_dump())


@api_router.delete("/families/{family_id}")
async def remove_family(family_id: str):
    return await delete_doc("families", family_id)


# ================= TEAMS =================
class Team(BaseModel):
    nombre: str
    categoria: Optional[str] = None
    modalidad: Optional[str] = None
    temporada: Optional[str] = None
    entrenador: Optional[str] = None
    segundo_entrenador: Optional[str] = None
    delegado: Optional[str] = None
    dias_entrenamiento: Optional[str] = None
    horario: Optional[str] = None
    campo: Optional[str] = None
    limite_jugadores: Optional[int] = 20
    estado: str = "activo"  # activo, cerrado, pendiente


@api_router.post("/teams")
async def create_team(team: Team):
    return await insert_doc("teams", team.model_dump())


@api_router.get("/teams")
async def get_teams():
    teams = await list_docs("teams")
    players = await list_docs("players")
    for t in teams:
        t["num_jugadores"] = len([p for p in players if p.get("equipo_id") == t["id"]])
    return teams


@api_router.get("/teams/{team_id}")
async def get_team(team_id: str):
    team = await get_doc("teams", team_id)
    players = await list_docs("players", {"equipo_id": team_id})
    team["jugadores"] = players
    return team


@api_router.put("/teams/{team_id}")
async def edit_team(team_id: str, team: Team):
    return await update_doc("teams", team_id, team.model_dump())


@api_router.delete("/teams/{team_id}")
async def remove_team(team_id: str):
    return await delete_doc("teams", team_id)


# ================= MATCHES =================
class Match(BaseModel):
    temporada: Optional[str] = None
    jornada: Optional[str] = None
    fecha: Optional[str] = None
    hora: Optional[str] = None
    equipo_id: Optional[str] = None
    rival: Optional[str] = None
    condicion: str = "local"  # local, visitante
    campo: Optional[str] = None
    direccion_campo: Optional[str] = None
    tipo: str = "liga"  # liga, copa, amistoso, torneo
    estado: str = "programado"  # programado, jugado, aplazado, suspendido, cancelado
    resultado_propio: Optional[int] = None
    resultado_rival: Optional[int] = None
    observaciones: Optional[str] = None


@api_router.post("/matches")
async def create_match(match: Match):
    return await insert_doc("matches", match.model_dump())


@api_router.get("/matches")
async def get_matches(equipo_id: Optional[str] = None, estado: Optional[str] = None):
    query: Dict[str, Any] = {}
    if equipo_id:
        query["equipo_id"] = equipo_id
    if estado:
        query["estado"] = estado
    matches = await list_docs("matches", query)
    teams = {t["id"]: t["nombre"] for t in await list_docs("teams")}
    for m in matches:
        m["equipo_nombre"] = teams.get(m.get("equipo_id"), "—")
    return matches


@api_router.get("/matches/{match_id}")
async def get_match(match_id: str):
    return await get_doc("matches", match_id)


@api_router.put("/matches/{match_id}")
async def edit_match(match_id: str, match: Match):
    previous = await get_doc("matches", match_id)
    updated = await update_doc("matches", match_id, match.model_dump())
    changed = any(previous.get(field) != updated.get(field) for field in ("fecha", "hora", "campo"))
    if changed:
        users = await users_for_team_players(updated.get("equipo_id"))
        await enqueue_notifications(users, "schedule.changed", "Cambio de partido / Partida aldaketa",
                                    str(updated.get("rival") or "Partido"), "/partidos", "urgent",
                                    {"match_id": match_id}, f"schedule.changed:match:{match_id}:{updated.get('updated_at')}")
    return updated


@api_router.delete("/matches/{match_id}")
async def remove_match(match_id: str):
    return await delete_doc("matches", match_id)


# ================= UNIFIED CALENDAR =================
class ClubCalendarEvent(BaseModel):
    titulo: str
    tipo: str = "club_event"
    fecha: str
    hora: Optional[str] = None
    fecha_fin: Optional[str] = None
    hora_fin: Optional[str] = None
    equipo_id: Optional[str] = None
    lugar: Optional[str] = None
    descripcion: Optional[str] = None
    temporada: Optional[str] = None
    categoria: Optional[str] = None

    @field_validator("tipo")
    @classmethod
    def validate_type(cls, value: str):
        if value not in {"meeting", "club_event"}:
            raise ValueError("El tipo debe ser meeting o club_event")
        return value

    @field_validator("titulo")
    @classmethod
    def validate_title(cls, value: str):
        value = value.strip()
        if not value or len(value) > 160:
            raise ValueError("El título debe tener entre 1 y 160 caracteres")
        return value

    @field_validator("fecha", "fecha_fin")
    @classmethod
    def validate_date(cls, value: Optional[str]):
        if value:
            date.fromisoformat(value[:10])
        return value


async def calendar_payload(start: Optional[str] = None, end: Optional[str] = None,
                           equipo_id: Optional[str] = None, categoria: Optional[str] = None,
                           temporada: Optional[str] = None, tipo: Optional[str] = None):
    actor = current_user_context.get() or {}
    teams = await list_docs("teams")
    team_ids = {team.get("id") for team in teams if team.get("id")}
    if equipo_id and equipo_id not in team_ids:
        raise HTTPException(status_code=403, detail="El equipo solicitado no pertenece a tu ámbito")
    categories = {team.get("categoria") for team in teams if team.get("categoria")}
    seasons = {team.get("temporada") for team in teams if team.get("temporada")}
    if categoria and actor.get("role") != "admin" and categoria not in categories:
        raise HTTPException(status_code=403, detail="La categoría solicitada no pertenece a tu ámbito")
    if temporada and actor.get("role") != "admin" and seasons and temporada not in seasons:
        raise HTTPException(status_code=403, detail="La temporada solicitada no pertenece a tu ámbito")
    if tipo and tipo not in CALENDAR_TYPES:
        raise HTTPException(status_code=422, detail="Tipo de evento no válido")
    events = aggregate_calendar_events(
        await list_docs("matches"), await list_docs("trainings"), await list_docs("club_events"), teams,
        start, end, equipo_id, categoria, temporada, tipo,
    )
    return {
        "events": events,
        "filter_options": {
            "teams": [{"id": team.get("id"), "name": team.get("nombre"), "category": team.get("categoria"), "season": team.get("temporada")} for team in teams],
            "categories": sorted(categories), "seasons": sorted(seasons), "types": list(CALENDAR_TYPES),
        },
        "subscription": subscription_capability(),
    }


@api_router.get("/calendar/events")
async def get_calendar_events(start: Optional[str] = None, end: Optional[str] = None,
                              equipo_id: Optional[str] = None, categoria: Optional[str] = None,
                              temporada: Optional[str] = None, tipo: Optional[str] = None):
    return await calendar_payload(start, end, equipo_id, categoria, temporada, tipo)


@api_router.post("/calendar/club-events")
async def create_club_calendar_event(event: ClubCalendarEvent):
    return await insert_doc("club_events", event.model_dump())


@api_router.put("/calendar/club-events/{event_id}")
async def edit_club_calendar_event(event_id: str, event: ClubCalendarEvent):
    return await update_doc("club_events", event_id, event.model_dump())


@api_router.delete("/calendar/club-events/{event_id}")
async def delete_club_calendar_event(event_id: str):
    return await delete_doc("club_events", event_id)


@api_router.get("/calendar/export.ics")
async def export_calendar_ical(start: Optional[str] = None, end: Optional[str] = None,
                               equipo_id: Optional[str] = None, categoria: Optional[str] = None,
                               temporada: Optional[str] = None, tipo: Optional[str] = None):
    payload = await calendar_payload(start, end, equipo_id, categoria, temporada, tipo)
    content = calendar_to_ical(payload["events"])
    return Response(content=content, media_type="text/calendar; charset=utf-8", headers={
        "Content-Disposition": "attachment; filename=ikas-txiki-calendario.ics",
        "Cache-Control": "private, no-store",
    })


# ================= FAMILY / PLAYER PORTAL =================
@api_router.get("/portal")
async def get_portal():
    actor = current_user_context.get() or {}
    role = actor.get("role")
    if role not in {"family", "player"}:
        raise HTTPException(status_code=403, detail="El portal está reservado a familias y jugadores")

    raw_players = await list_docs("players")
    player_ids = {player.get("id") for player in raw_players if player.get("id")}
    teams = await list_docs("teams")
    team_map = {team.get("id"): team for team in teams}
    players = [{**safe_player(player), "team_name": team_map.get(player.get("equipo_id"), {}).get("nombre")} for player in raw_players]

    matches = await list_docs("matches")
    trainings = await list_docs("trainings")
    club_events = await list_docs("club_events")
    calendar_events = aggregate_calendar_events(matches, trainings, club_events, teams)
    callups = portal_callups(await list_docs("callups"), player_ids)
    match_map = {match.get("id"): match for match in matches}
    for callup in callups:
        match = match_map.get(callup.get("match_id"), {})
        callup["match"] = {
            key: match.get(key) for key in ("id", "fecha", "hora", "rival", "campo", "estado")
        }
        callup["team_name"] = team_map.get(callup.get("equipo_id"), {}).get("nombre")
        callup["deadline_expired"] = is_late(callup.get("response_deadline"))

    authorizations = []
    for authorization in await list_docs("authorizations"):
        authorizations.append({
            key: authorization.get(key) for key in (
                "id", "player_id", "tipo", "estado", "fecha_firma", "fecha_caducidad",
                "persona_autorizada", "observaciones",
            )
        } | {"has_signed_file": bool(authorization.get("archivo_firmado"))})

    communications = [{key: item.get(key) for key in (
        "id", "asunto", "mensaje", "canal", "fecha_envio", "created_at",
    )} for item in await list_docs("communications")]
    payments = [safe_payment(item) for item in await list_docs("payments")] if role == "family" else []

    return {
        "role": role,
        "players": players,
        "teams": [{key: team.get(key) for key in ("id", "nombre", "categoria", "temporada", "entrenador")} for team in teams],
        "schedule": upcoming(calendar_events),
        "next_activity": next_calendar_event(calendar_events),
        "callups": callups,
        "attendance": portal_attendance(trainings, player_ids),
        "payments": payments,
        "authorizations": authorizations,
        "documents": document_status(raw_players),
        "communications": communications[:20],
    }


# ================= CALLUPS (Convocatorias) =================
class ConvocadoItem(BaseModel):
    player_id: str
    estado: str = "pending"
    motivo: Optional[str] = None
    responded_at: Optional[str] = None
    responded_by_user_id: Optional[str] = None
    responded_by_username: Optional[str] = None
    responded_by_role: Optional[str] = None
    late: bool = False
    history: List[Dict[str, Any]] = Field(default_factory=list)

    @field_validator("estado")
    @classmethod
    def normalize_legacy_status(cls, value: str):
        normalized = normalize_status(value)
        if normalized not in VALID_STATUSES:
            raise ValueError("Estado no válido")
        return normalized


class Callup(BaseModel):
    match_id: str
    equipo_id: Optional[str] = None
    convocados: List[ConvocadoItem] = Field(default_factory=list)
    hora_quedada: Optional[str] = None
    lugar_quedada: Optional[str] = None
    material: Optional[str] = None
    mensaje_familias: Optional[str] = None
    response_deadline: Optional[str] = None
    player_self_response_allowed: bool = False


class CallupResponse(BaseModel):
    player_id: str
    status: str
    reason: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str):
        normalized = normalize_status(value)
        if normalized not in {"confirmed", "declined"}:
            raise ValueError("La respuesta debe ser confirmed o declined")
        return normalized


@api_router.post("/callups")
async def create_callup(callup: Callup):
    created = await insert_doc("callups", callup.model_dump())
    actor = current_user_context.get() or {}
    await db.internal_events.insert_one({
        "id": new_id(), "type": "callup.created", "callup_id": created["id"],
        "team_id": created.get("equipo_id"), "actor_user_id": actor.get("id"),
        "created_at": now_iso(), "delivered": False,
    })
    player_ids = ids(item.get("player_id") for item in created.get("convocados", []))
    users = await users_for_team_players(created.get("equipo_id"), player_ids)
    await enqueue_notifications(users, "callup.created", "Nueva convocatoria / Deialdi berria",
                                str(created.get("instrucciones") or "Ikas-Txiki"), "/convocatorias", "high",
                                {"callup_id": created["id"]}, f"callup.created:{created['id']}")
    return normalize_callup(created)


@api_router.get("/callups")
async def get_callups(estado: Optional[str] = None, q: Optional[str] = None):
    callups = await list_docs("callups")
    actor = current_user_context.get() or {}
    visible_player_ids = set(await user_player_ids(actor)) if actor.get("role") in {"family", "player"} else None
    matches = {m["id"]: m for m in await list_docs("matches")}
    teams = {t["id"]: t["nombre"] for t in await list_docs("teams")}
    players = {p["id"]: p for p in await list_docs("players")}
    wanted = normalize_status(estado) if estado else None
    for c in callups:
        normalized = normalize_callup(c)
        c.update(normalized)
        if visible_player_ids is not None:
            c["convocados"] = [item for item in c.get("convocados", []) if item.get("player_id") in visible_player_ids]
        m = matches.get(c.get("match_id"), {})
        c["match"] = m
        c["equipo_nombre"] = teams.get(c.get("equipo_id"), "—")
        for item in c.get("convocados", []):
            player = players.get(item.get("player_id"), {})
            item["nombre"] = f"{player.get('nombre', '')} {player.get('apellidos', '')}".strip()
            item["dorsal"] = player.get("dorsal")
        c["num_convocados"] = len(c.get("convocados", []))
        c["response_counts"] = response_counts(c.get("convocados", []))
        c["deadline_expired"] = is_late(c.get("response_deadline"))
    if wanted:
        callups = [c for c in callups if any(i.get("estado") == wanted for i in c.get("convocados", []))]
    if q:
        needle = q.casefold()
        callups = [c for c in callups if any(needle in i.get("nombre", "").casefold() for i in c.get("convocados", []))]
    return callups


@api_router.get("/callups/stats/summary")
async def get_callup_stats(temporada: Optional[str] = None, equipo_id: Optional[str] = None):
    actor = current_user_context.get() or {}
    if equipo_id and actor.get("role") in {"coordinator", "coach"} and equipo_id not in set(ids(actor.get("assigned_team_ids") or [])):
        raise HTTPException(status_code=403, detail="El equipo no pertenece a tu ámbito")
    query: Dict[str, Any] = {}
    if equipo_id:
        query["equipo_id"] = equipo_id
    callups = await list_docs("callups", query)
    matches = {m["id"]: m for m in await list_docs("matches")}
    if temporada:
        callups = [c for c in callups if matches.get(c.get("match_id"), {}).get("temporada") == temporada]
    totals = response_counts(item for c in callups for item in c.get("convocados", []))
    return {"callups": len(callups), "responses": totals, "team_id": equipo_id, "season": temporada}


@api_router.get("/callups/{callup_id}")
async def get_callup(callup_id: str):
    c = normalize_callup(await get_doc("callups", callup_id))
    actor = current_user_context.get() or {}
    if actor.get("role") in {"family", "player"}:
        visible_player_ids = set(await user_player_ids(actor))
        c["convocados"] = [item for item in c.get("convocados", []) if item.get("player_id") in visible_player_ids]
    players = {p["id"]: p for p in await list_docs("players")}
    for item in c.get("convocados", []):
        p = players.get(item["player_id"], {})
        item["nombre"] = f"{p.get('nombre','')} {p.get('apellidos','')}".strip()
        item["dorsal"] = p.get("dorsal")
        item["foto"] = p.get("foto")
    match = await db.matches.find_one({"id": c.get("match_id")}, {"_id": 0}) or {}
    team = await db.teams.find_one({"id": c.get("equipo_id")}, {"_id": 0}) or {}
    c["match"] = match
    c["equipo_nombre"] = team.get("nombre", "—")
    c["response_counts"] = response_counts(c.get("convocados", []))
    c["deadline_expired"] = is_late(c.get("response_deadline"))
    return c


@api_router.put("/callups/{callup_id}")
async def edit_callup(callup_id: str, callup: Callup):
    existing = await get_doc("callups", callup_id)
    actor = current_user_context.get() or {}
    previous_items = {item.get("player_id"): item for item in existing.get("convocados", [])}
    data = callup.model_dump()
    secured_items = []
    history_events = []
    for submitted in data.get("convocados", []):
        previous = previous_items.get(submitted.get("player_id"))
        if not previous:
            secured_items.append({**submitted, "history": []})
            continue
        old_status = normalize_status(previous.get("estado"))
        new_status = normalize_status(submitted.get("estado"))
        if old_status == new_status:
            secured_items.append({**submitted, "history": previous.get("history", []),
                                  "responded_at": previous.get("responded_at"),
                                  "responded_by_user_id": previous.get("responded_by_user_id"),
                                  "responded_by_username": previous.get("responded_by_username"),
                                  "responded_by_role": previous.get("responded_by_role")})
            continue
        changed_at = now_iso()
        change = {
            "previous_status": old_status, "new_status": new_status, "changed_at": changed_at,
            "changed_by_user_id": actor.get("id"), "changed_by_username": actor.get("username"),
            "relation": actor.get("role"), "reason": submitted.get("motivo") if new_status == "declined" else None,
            "late": is_late(data.get("response_deadline")),
        }
        secured_items.append({**submitted, "motivo": change["reason"], "responded_at": changed_at,
                              "responded_by_user_id": actor.get("id"),
                              "responded_by_username": actor.get("username"),
                              "responded_by_role": actor.get("role"), "late": change["late"],
                              "history": [*(previous.get("history") or []), change]})
        history_events.append((submitted.get("player_id"), change))
    data["convocados"] = secured_items
    updated = normalize_callup(await update_doc("callups", callup_id, data))
    if history_events:
        await db.internal_events.insert_many([{
            "id": new_id(), "type": "callup.response_updated", "callup_id": callup_id,
            "player_id": player_id, "actor_user_id": actor.get("id"), "history": change,
            "created_at": now_iso(), "delivered": False,
        } for player_id, change in history_events])
    return updated


@api_router.patch("/callups/{callup_id}/respond")
async def respond_callup(callup_id: str, response: CallupResponse):
    user = current_user_context.get() or {}
    callup = await get_doc("callups", callup_id)
    allowed_players = set(await user_player_ids(user))
    if response.player_id not in allowed_players:
        raise HTTPException(status_code=403, detail="No puedes responder por este jugador")
    if user.get("role") == "player" and not callup.get("player_self_response_allowed", False):
        raise HTTPException(status_code=403, detail="La respuesta directa del jugador no está autorizada")
    index = next((i for i, item in enumerate(callup.get("convocados", []))
                  if item.get("player_id") == response.player_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail="El jugador no está convocado")
    if is_late(callup.get("response_deadline")):
        await db.internal_events.update_one(
            {"type": "callup.deadline_expired", "callup_id": callup_id},
            {"$setOnInsert": {"id": new_id(), "type": "callup.deadline_expired",
                               "callup_id": callup_id, "created_at": now_iso(), "delivered": False}},
            upsert=True,
        )
        raise HTTPException(status_code=409, detail="El plazo de respuesta ha finalizado")
    old_status = normalize_status(callup["convocados"][index].get("estado"))
    updated, history = apply_response(
        callup["convocados"][index], response.status, response.reason,
        user, callup.get("response_deadline"),
    )
    await db.callups.update_one({"id": callup_id}, {"$set": {
        f"convocados.{index}": updated, "updated_at": now_iso(),
    }})
    event_type = "callup.response_updated" if old_status != "pending" else "callup.response_registered"
    await db.internal_events.insert_one({
        "id": new_id(), "type": event_type, "callup_id": callup_id,
        "player_id": response.player_id, "actor_user_id": user.get("id"),
        "history": history, "created_at": now_iso(), "delivered": False,
    })
    staff = await notification_users([callup.get("equipo_id")], include_admins=True)
    await enqueue_notifications(staff, "callup.response", "Respuesta de convocatoria / Deialdiaren erantzuna",
                                response.status, f"/convocatorias", "normal",
                                {"callup_id": callup_id, "player_id": response.player_id},
                                f"callup.response:{callup_id}:{response.player_id}:{updated.get('responded_at')}")
    return {"player_id": response.player_id, **updated}


@api_router.get("/callups/{callup_id}/pdf")
async def export_callup_pdf(callup_id: str):
    callup = await get_doc("callups", callup_id)
    match = await db.matches.find_one({"id": callup.get("match_id")}, {"_id": 0}) or {}
    team = await db.teams.find_one({"id": callup.get("equipo_id")}, {"_id": 0}) or {}
    settings = await db.settings.find_one({"id": "global"}, {"_id": 0}) or {}
    player_ids = [i.get("player_id") for i in callup.get("convocados", [])]
    rows = await db.players.find({"id": {"$in": player_ids}}, {"_id": 0}).to_list(500)
    players = {p["id"]: p for p in rows}
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=16*mm, leftMargin=16*mm,
                            topMargin=14*mm, bottomMargin=14*mm)
    styles = getSampleStyleSheet()
    title = ParagraphStyle("CallupTitle", parent=styles["Title"], fontSize=16, leading=19, alignment=TA_CENTER)
    story = [
        Paragraph(str(settings.get("club_nombre") or "Ikas-Txiki"), styles["Heading2"]),
        Paragraph("CONVOCATORIA / DEIALDIA", title), Spacer(1, 4*mm),
        Paragraph(f"<b>Equipo / Taldea:</b> {html_lib.escape(str(team.get('nombre') or '—'))}", styles["BodyText"]),
        Paragraph(f"<b>Partido / Partida:</b> {html_lib.escape(str(match.get('rival') or '—'))}", styles["BodyText"]),
        Paragraph(f"<b>Fecha y hora / Data eta ordua:</b> {match.get('fecha') or '—'} {match.get('hora') or ''}", styles["BodyText"]),
        Paragraph(f"<b>Lugar / Lekua:</b> {html_lib.escape(str(match.get('campo') or callup.get('lugar_quedada') or '—'))}", styles["BodyText"]),
        Spacer(1, 5*mm),
    ]
    table_data = [["Jugador / Jokalaria", "Estado / Egoera", "Motivo / Arrazoia"]]
    labels = {"pending": "Pendiente / Zain", "confirmed": "Confirmado / Baieztatuta", "declined": "Rechazado / Ukatuta"}
    for item in callup.get("convocados", []):
        player = players.get(item.get("player_id"), {})
        name = f"{player.get('nombre', '')} {player.get('apellidos', '')}".strip() or "—"
        table_data.append([name, labels[normalize_status(item.get("estado"))], item.get("motivo") or "—"])
    table = Table(table_data, colWidths=[78*mm, 49*mm, 48*mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), .4, colors.HexColor("#cbd5e1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"), ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
    ]))
    counts = response_counts(callup.get("convocados", []))
    story.extend([table, Spacer(1, 5*mm), Paragraph(
        f"<b>Resumen / Laburpena:</b> {counts['confirmed']} confirmados / baieztatuta · "
        f"{counts['declined']} rechazados / ukatuta · {counts['pending']} pendientes / zain",
        styles["BodyText"]), Paragraph(f"Generado / Sortuta: {datetime.now().strftime('%d/%m/%Y %H:%M')}", styles["BodyText"]),
    ])
    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="convocatoria_{callup_id}.pdf"'
    })


@api_router.delete("/callups/{callup_id}")
async def remove_callup(callup_id: str):
    return await delete_doc("callups", callup_id)


# ================= PAYMENTS =================
class Payment(BaseModel):
    player_id: Optional[str] = None
    concepto: Optional[str] = "Cuota temporada"
    importe_base: Optional[float] = 0
    descuento_hermano: Optional[float] = 0
    importe_final: Optional[float] = 0
    forma_pago: Optional[str] = None  # domiciliacion, transferencia, efectivo, bizum
    iban: Optional[str] = None
    iban_validado: bool = False
    estado: str = "pendiente"  # pendiente, pagado, parcial, devuelto
    fecha_pago: Optional[str] = None
    recibo_generado: bool = False
    observaciones: Optional[str] = None


@api_router.post("/payments")
async def create_payment(payment: Payment):
    data = payment.model_dump()
    base = data.get("importe_base") or 0
    desc = data.get("descuento_hermano") or 0
    data["importe_final"] = round(base - desc, 2)
    return await insert_doc("payments", data)


@api_router.get("/payments")
async def get_payments(estado: Optional[str] = None):
    query = {"estado": estado} if estado else {}
    payments = await list_docs("payments", query)
    players = {p["id"]: f"{p.get('nombre','')} {p.get('apellidos','')}".strip() for p in await list_docs("players")}
    for p in payments:
        p["player_nombre"] = players.get(p.get("player_id"), "—")
        p.pop("iban_encrypted", None)
        if p.get("iban_last4"):
            p["iban"] = masked_iban(p.get("iban_last4"))
    return payments


@api_router.put("/payments/{payment_id}")
async def edit_payment(payment_id: str, payment: Payment):
    data = payment.model_dump()
    base = data.get("importe_base") or 0
    desc = data.get("descuento_hermano") or 0
    data["importe_final"] = round(base - desc, 2)
    return await update_doc("payments", payment_id, data)


@api_router.delete("/payments/{payment_id}")
async def remove_payment(payment_id: str):
    return await delete_doc("payments", payment_id)


# ================= AUTHORIZATIONS =================
class Authorization(BaseModel):
    player_id: Optional[str] = None
    tipo: str = "general"  # general, imagen, medica, desplazamientos, recogida, proteccion_datos
    persona_autorizada: Optional[str] = None
    dni_autorizada: Optional[str] = None
    firmante: Optional[str] = None
    fecha_firma: Optional[str] = None
    fecha_caducidad: Optional[str] = None
    estado: str = "pendiente"  # pendiente, firmada, caducada
    archivo_firmado: Optional[str] = None  # ruta relativa al PDF firmado subido
    observaciones: Optional[str] = None


AUTHORIZATION_PDF_TYPES = {
    "general": {
        "es": "Autorización general de participación",
        "eu": "Parte hartzeko baimen orokorra",
        "text_es": "Autorizo a mi hijo/a a participar en todas las actividades deportivas, entrenamientos y partidos organizados por el club durante la temporada, así como a recibir la atención necesaria en caso de accidente leve.",
        "text_eu": "Nire seme-alabari klubak denboraldian antolatutako kirol-jarduera, entrenamendu eta partida guztietan parte hartzeko baimena ematen diot, baita istripu arin baten kasuan beharrezko arreta jasotzeko ere.",
    },
    "imagen": {
        "es": "Autorización de uso de imagen",
        "eu": "Irudia erabiltzeko baimena",
        "text_es": "Autorizo el uso de la imagen de mi hijo/a en fotografías y vídeos del club con fines informativos y de difusión de las actividades deportivas, sin contraprestación económica y respetando en todo momento la dignidad del menor.",
        "text_eu": "Nire seme-alabaren irudia klubaren argazki eta bideoetan erabiltzeko baimena ematen dut, kirol-jardueren berri emateko eta zabaltzeko, ordain ekonomikorik gabe eta adingabearen duintasuna une oro errespetatuz.",
    },
    "medica": {
        "es": "Autorización médica básica",
        "eu": "Oinarrizko mediku-baimena",
        "text_es": "Autorizo al club a tomar las medidas oportunas en caso de urgencia médica cuando no sea posible contactar con el/los tutor/es. Declaro estar informado/a del estado de salud de mi hijo/a y no tener conocimiento de impedimento médico para la práctica deportiva.",
        "text_eu": "Klubari baimena ematen diot larrialdi mediko baten aurrean beharrezko neurriak har ditzan, tutoreekin harremanetan jartzea ezinezkoa denean. Adierazten dut nire seme-alabaren osasun-egoeraren berri dudala eta ez dudala kirola egiteko eragozpen medikorik ezagutzen.",
    },
    "desplazamientos": {
        "es": "Autorización de desplazamientos",
        "eu": "Lekualdaketa baimena",
        "text_es": "Autorizo los desplazamientos de mi hijo/a en los vehículos del club o de otros progenitores/tutores a los distintos campos y localizaciones donde se disputen los partidos y actividades organizadas por el club.",
        "text_eu": "Nire seme-alabak klubeko ibilgailuetan edo beste guraso edo tutore batzuen ibilgailuetan bidaiatzeko baimena ematen dut, partidak eta klubak antolatutako jarduerak egiten diren zelai eta lekuetara joateko.",
    },
    "recogida": {
        "es": "Autorización para recogida por terceros",
        "eu": "Hirugarrenek jasotzeko baimena",
        "text_es": "Autorizo a la persona indicada a continuación a recoger a mi hijo/a tras los entrenamientos y partidos del club, en los casos en que yo no pueda hacerlo personalmente.",
        "text_eu": "Jarraian adierazitako pertsonari nire seme-alaba entrenamendu eta partiden ondoren jasotzeko baimena ematen diot, nik neuk jaso ezin dudanean.",
    },
    "proteccion_datos": {
        "es": "Protección de datos",
        "eu": "Datuen babesa",
        "text_es": "Doy mi consentimiento informado para el tratamiento de los datos personales de mi hijo/a conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD). Los datos serán utilizados exclusivamente para la gestión de las actividades del club y no serán cedidos a terceros sin consentimiento expreso.",
        "text_eu": "Nire seme-alabaren datu pertsonalak tratatzeko baimen informatua ematen dut, 2016/679 (EB) Erregelamenduaren (DBEO) eta 3/2018 Lege Organikoaren arabera. Datuak klubaren jarduerak kudeatzeko baino ez dira erabiliko, eta ez zaizkie hirugarrenei lagako berariazko baimenik gabe.",
    },
}


def build_authorization_pdf(auth: dict, player: dict, settings: dict, lang: str = "es") -> io.BytesIO:
    """Genera una autorización A4 vectorial sin depender del navegador."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=15 * mm, bottomMargin=15 * mm,
        title="Autorización Ikas-Txiki", author=settings.get("club_nombre") or "Ikas-Txiki",
    )
    styles = getSampleStyleSheet()
    normal = ParagraphStyle("AuthNormal", parent=styles["Normal"], fontName="Helvetica", fontSize=10, leading=15, textColor=colors.HexColor("#1f2937"))
    small = ParagraphStyle("AuthSmall", parent=normal, fontSize=8, leading=11, textColor=colors.HexColor("#6b7280"))
    title = ParagraphStyle("AuthTitle", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=19, alignment=TA_CENTER, spaceAfter=4, textColor=colors.HexColor("#111827"))
    club_style = ParagraphStyle("AuthClub", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=17, leading=20, textColor=colors.HexColor("#102A43"))
    esc = lambda value, fallback="": html_lib.escape(str(value if value not in (None, "") else fallback))

    club_name = settings.get("club_nombre") or "Ikas-Txiki"
    club_lines = [esc(settings.get("club_direccion")), esc(settings.get("club_email")), esc(settings.get("club_telefono"))]
    club_info = " · ".join(value for value in club_lines if value)
    header_cells = []
    logo = settings.get("club_logo") or ""
    if isinstance(logo, str) and logo.startswith("data:image") and "," in logo:
        try:
            header_cells.append(PdfImage(io.BytesIO(base64.b64decode(logo.split(",", 1)[1])), width=18 * mm, height=18 * mm))
        except Exception:
            header_cells.append(Spacer(18 * mm, 18 * mm))
    else:
        header_cells.append(Spacer(18 * mm, 18 * mm))
    header_cells.append(Paragraph(f"<b>{esc(club_name)}</b>{'<br/><font size=8>' + club_info + '</font>' if club_info else ''}", club_style))
    header = Table([header_cells], colWidths=[22 * mm, 150 * mm])
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))

    type_data = AUTHORIZATION_PDF_TYPES.get(auth.get("tipo"), {"es": auth.get("tipo") or "Autorización", "eu": auth.get("tipo") or "Baimena", "text": ""})
    type_label_es = type_data.get("es") or auth.get("tipo") or "Autorización"
    type_label_eu = type_data.get("eu") or auth.get("tipo") or "Baimena"
    player_name = f"{player.get('nombre', '')} {player.get('apellidos', '')}".strip() or "________________"
    season = settings.get("temporada_actual") or "2025-2026"
    story = [header, Spacer(1, 5 * mm), HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#102A43")), Spacer(1, 8 * mm)]
    story.extend([
        Paragraph(esc(type_label_es).upper(), title),
        Paragraph(esc(type_label_eu).upper(), ParagraphStyle("AuthTitleEu", parent=title, fontSize=12, leading=15)),
        Paragraph(f"Temporada / Denboraldia {esc(season)}", ParagraphStyle("Season", parent=small, alignment=TA_CENTER)),
        Spacer(1, 7 * mm),
    ])

    details = [
        [Paragraph("Padre/Madre/Tutor/a · Aita/Ama/Tutorea:", small), Paragraph(f"<b>{esc(auth.get('firmante'), '________________')}</b>", normal)],
        [Paragraph("Jugador/a · Jokalaria:", small), Paragraph(f"<b>{esc(player_name)}</b>", normal)],
        [Paragraph("Fecha de nacimiento · Jaioteguna:", small), Paragraph(esc((player.get("fecha_nacimiento") or "—")[:10]), normal)],
        [Paragraph("Categoría · Kategoria:", small), Paragraph(esc(player.get("categoria"), "—"), normal)],
    ]
    details_table = Table(details, colWidths=[52 * mm, 116 * mm], rowHeights=[9 * mm] * 4)
    details_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (1, 0), (1, -1), 0.5, colors.HexColor("#9ca3af")),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.extend([details_table, Spacer(1, 7 * mm)])

    consent = Table([[Paragraph(
        f"<b>AUTORIZO:</b><br/>{esc(type_data.get('text_es'))}<br/><br/>"
        f"<b>BAIMENA EMATEN DUT:</b><br/>{esc(type_data.get('text_eu'))}", normal
    )]], colWidths=[168 * mm])
    consent.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f3f4f6")), ("LINEBEFORE", (0, 0), (0, 0), 3, colors.HexColor("#102A43")), ("BOX", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    story.extend([consent, Spacer(1, 6 * mm)])

    if auth.get("tipo") == "recogida":
        pickup = Table([
            [Paragraph("Persona autorizada · Baimendutako pertsona:", small), Paragraph(f"<b>{esc(auth.get('persona_autorizada'), '________________')}</b>", normal)],
            [Paragraph("DNI / NIF · NAN / IFZ:", small), Paragraph(esc(auth.get("dni_autorizada"), "________________"), normal)],
        ], colWidths=[52 * mm, 116 * mm])
        pickup.setStyle(TableStyle([("LINEBELOW", (1, 0), (1, -1), 0.5, colors.HexColor("#9ca3af")), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
        story.extend([pickup, Spacer(1, 5 * mm)])
    if auth.get("observaciones"):
        story.extend([Paragraph(f"<b>Observaciones · Oharrak:</b> <i>{esc(auth.get('observaciones'))}</i>", normal), Spacer(1, 7 * mm)])

    signature_style = ParagraphStyle("Signature", parent=small, alignment=TA_CENTER)
    signatures = Table([
        ["", "", ""],
        [Paragraph("Firma del padre/madre/tutor/a<br/>Aita/ama/tutorearen sinadura", signature_style), Paragraph(f"Fecha · Data: {esc(auth.get('fecha_firma'), '____________')}", signature_style), Paragraph("Sello del club<br/>Klubaren zigilua", signature_style)],
    ], colWidths=[52 * mm, 52 * mm, 52 * mm], rowHeights=[18 * mm, 12 * mm], hAlign="CENTER")
    signatures.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, 0), 0.8, colors.HexColor("#111827")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6)]))
    story.extend([Spacer(1, 8 * mm), KeepTogether(signatures), Spacer(1, 10 * mm), HRFlowable(width="100%", thickness=0.4, color=colors.HexColor("#d1d5db")), Spacer(1, 2 * mm), Paragraph(f"{esc(club_name)} · Documento generado / Sortutako dokumentua: {date.today().strftime('%d/%m/%Y')} · RGPD/DBEO (UE/EB) 2016/679", ParagraphStyle("Footer", parent=small, alignment=TA_CENTER, fontSize=7))])
    doc.build(story)
    buffer.seek(0)
    return buffer


@api_router.post("/authorizations")
async def create_authorization(auth: Authorization):
    return await insert_doc("authorizations", auth.model_dump())


@api_router.get("/authorizations")
async def get_authorizations(estado: Optional[str] = None):
    query = {"estado": estado} if estado else {}
    auths = await list_docs("authorizations", query)
    players = {p["id"]: p for p in await list_docs("players")}
    for a in auths:
        p = players.get(a.get("player_id"), {})
        a["player_nombre"] = f"{p.get('nombre','')} {p.get('apellidos','')}".strip() or "—"
    return auths


@api_router.get("/authorizations/{auth_id}/pdf")
async def download_authorization_pdf(auth_id: str, lang: str = "es"):
    auth = await get_doc("authorizations", auth_id)
    player = await get_doc("players", auth.get("player_id"))
    settings = await get_settings()
    buffer = build_authorization_pdf(auth, player, settings, lang)
    filename = f"autorizacion_{auth_id}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api_router.put("/authorizations/{auth_id}")
async def edit_authorization(auth_id: str, auth: Authorization):
    return await update_doc("authorizations", auth_id, auth.model_dump())


@api_router.delete("/authorizations/{auth_id}")
async def remove_authorization(auth_id: str):
    return await delete_doc("authorizations", auth_id)

@api_router.post("/authorizations/{auth_id}/upload-signed")
async def upload_signed_authorization(auth_id: str, file: UploadFile = File(...)):
    """Recibe un PDF firmado, lo guarda en disco y marca la autorización como firmada."""
    auth = await get_doc("authorizations", auth_id)
    # Eliminar archivo anterior si existe
    if auth.get("archivo_firmado"):
        old_path = UPLOADS_DIR / auth["archivo_firmado"]
        if old_path.exists():
            old_path.unlink()
    # Guardar nuevo archivo
    ext = Path(file.filename).suffix if file.filename else ".pdf"
    filename = f"auth_{auth_id}{ext}"
    file_path = UPLOADS_DIR / filename
    with open(file_path, "wb") as out:
        shutil.copyfileobj(file.file, out)
    # Actualizar documento
    await db["authorizations"].update_one(
        {"id": auth_id},
        {"$set": {"archivo_firmado": filename, "estado": "firmada", "updated_at": now_iso()}}
    )
    return {"ok": True, "archivo_firmado": filename}


@api_router.get("/authorizations/{auth_id}/signed-file")
async def get_signed_authorization(auth_id: str):
    """Devuelve el PDF firmado almacenado para una autorización."""
    auth = await get_doc("authorizations", auth_id)
    if not auth.get("archivo_firmado"):
        raise HTTPException(status_code=404, detail="No hay archivo firmado para esta autorización")
    file_path = UPLOADS_DIR / auth["archivo_firmado"]
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        filename=f"autorizacion_firmada_{auth_id}.pdf"
    )


@api_router.delete("/authorizations/{auth_id}/signed-file")
async def delete_signed_authorization(auth_id: str):
    """Elimina el PDF firmado de una autorización y la vuelve a estado pendiente."""
    auth = await get_doc("authorizations", auth_id)
    if auth.get("archivo_firmado"):
        file_path = UPLOADS_DIR / auth["archivo_firmado"]
        if file_path.exists():
            file_path.unlink()
    await db["authorizations"].update_one(
        {"id": auth_id},
        {"$set": {"archivo_firmado": None, "estado": "pendiente", "updated_at": now_iso()}}
    )
    return {"ok": True}


# ================= INSCRIPTIONS =================
class Inscription(BaseModel):
    tipo: str = "alta"  # alta, renovacion
    nombre: str
    apellidos: Optional[str] = ""
    fecha_nacimiento: Optional[str] = None
    email_formulario: Optional[str] = None
    centro_escolar: Optional[str] = None
    progenitor1_nombre: Optional[str] = None
    progenitor1_telefono: Optional[str] = None
    progenitor1_email: Optional[str] = None
    progenitor2_nombre: Optional[str] = None
    progenitor2_telefono: Optional[str] = None
    progenitor2_email: Optional[str] = None
    domicilio: Optional[str] = None
    nueva_incorporacion: bool = True
    estado: str = "recibida"  # recibida, revisada, aceptada, pendiente, rechazada
    categoria: Optional[str] = None
    temporada: Optional[str] = None
    equipo_id: Optional[str] = None
    modalidad: Optional[str] = None
    equipamiento_items: List[str] = Field(default_factory=list)
    player_id: Optional[str] = None  # set when converted to player
    observaciones: Optional[str] = None


def _detect_siblings(insc: dict, players: list) -> list:
    keys = [insc.get("progenitor1_telefono"), insc.get("progenitor2_telefono"),
            insc.get("progenitor1_email"), insc.get("progenitor2_email"), insc.get("domicilio")]
    keys = [k for k in keys if k]
    matches = []
    for p in players:
        pvals = [p.get("progenitor1_telefono"), p.get("progenitor2_telefono"),
                 p.get("progenitor1_email"), p.get("progenitor2_email"), p.get("domicilio")]
        pvals = [v for v in pvals if v]
        if any(k in pvals for k in keys):
            matches.append({"id": p["id"], "nombre": f"{p.get('nombre','')} {p.get('apellidos','')}".strip()})
    return matches


@api_router.post("/inscriptions")
async def create_inscription(insc: Inscription):
    data = insc.model_dump()
    if data.get("fecha_nacimiento"):
        data["categoria"] = compute_category(data["fecha_nacimiento"])
    return await insert_doc("inscriptions", data)


@api_router.get("/inscriptions")
async def get_inscriptions(estado: Optional[str] = None):
    query = {"estado": estado} if estado else {}
    inscs = await list_docs("inscriptions", query)
    players = await list_docs("players")
    for i in inscs:
        i["posibles_hermanos"] = _detect_siblings(i, players)
    return inscs


@api_router.put("/inscriptions/{insc_id}")
async def edit_inscription(insc_id: str, insc: Inscription):
    data = insc.model_dump()
    if data.get("fecha_nacimiento"):
        data["categoria"] = compute_category(data["fecha_nacimiento"])
    return await update_doc("inscriptions", insc_id, data)


@api_router.delete("/inscriptions/{insc_id}")
async def remove_inscription(insc_id: str):
    return await delete_doc("inscriptions", insc_id)


@api_router.post("/inscriptions/{insc_id}/to-player")
async def inscription_to_player(insc_id: str):
    insc = await get_doc("inscriptions", insc_id)
    if insc.get("player_id"):
        raise HTTPException(status_code=400, detail="Ya tiene ficha de jugador")
    pdata = Player(
        nombre=insc.get("nombre"), apellidos=insc.get("apellidos") or "",
        fecha_nacimiento=insc.get("fecha_nacimiento"), email_formulario=insc.get("email_formulario"),
        centro_escolar=insc.get("centro_escolar"), domicilio=insc.get("domicilio"),
        progenitor1_nombre=insc.get("progenitor1_nombre"), progenitor1_telefono=insc.get("progenitor1_telefono"),
        progenitor1_email=insc.get("progenitor1_email"), progenitor2_nombre=insc.get("progenitor2_nombre"),
        progenitor2_telefono=insc.get("progenitor2_telefono"), progenitor2_email=insc.get("progenitor2_email"),
        nueva_incorporacion=insc.get("nueva_incorporacion", True), estado="pendiente_documentacion",
        fecha_inscripcion=insc.get("created_at"),
    ).model_dump()
    if pdata.get("fecha_nacimiento"):
        pdata["categoria"] = compute_category(pdata["fecha_nacimiento"])
    player = await insert_doc("players", pdata)
    await db.inscriptions.update_one({"id": insc_id}, {"$set": {"player_id": player["id"], "estado": "aceptada"}})
    return player


# ================= SAFE INSCRIPTION EXCEL IMPORT =================
class ImportPlanRequest(BaseModel):
    plan_token: str


class ImportConfirmRequest(ImportPlanRequest):
    confirmed: bool = False
    decisions: Dict[str, str] = Field(default_factory=dict)


class StagingRecordUpdate(BaseModel):
    field: str
    value: Any = None


class StagingBulkUpdate(BaseModel):
    record_ids: List[str]
    field: str
    value: str
    confirm_suggestion: bool = False


class StagingDuplicateDecision(BaseModel):
    decision: str


class StagingOctoberSelection(BaseModel):
    record_ids: List[str]


class StagingIncidentResolution(BaseModel):
    resolution: str


class StagingConfirmRequest(BaseModel):
    confirmed: bool = False


IMPORT_COLLECTIONS = ("teams", "families", "players", "inscriptions", "payments")


async def _import_existing() -> dict:
    return {
        name: await db[name].find({}, {"_id": 0}).to_list(20000)
        for name in IMPORT_COLLECTIONS
    }


def _public_analysis(analysis: dict, token: str) -> dict:
    return {
        "season": analysis["season"], "summary": analysis["summary"],
        "unique_count": analysis["unique_count"], "blocking_errors": analysis["blocking_errors"],
        "unresolved_conflicts": analysis["unresolved_conflicts"], "duplicate_file": analysis["duplicate_file"],
        "rows": analysis["public_rows"], "issues": analysis["issues"], "plan_token": token,
    }


def _clean_doc(document: Optional[dict]) -> Optional[dict]:
    if document is None:
        return None
    return {key: value for key, value in document.items() if key != "_id"}


def _build_import_operations(analysis: dict, existing: dict, job_id: str,
                             decisions: Dict[str, str]) -> list[dict]:
    now = now_iso()
    maps = {name: {str(doc.get("id")): _clean_doc(doc) for doc in existing[name]} for name in IMPORT_COLLECTIONS}
    team_by_name = {normalize_key(doc.get("nombre")): doc for doc in maps["teams"].values()}
    family_by_key = {family_key(doc): doc for doc in maps["families"].values()}
    player_by_key = {str(doc.get("import_identity_key") or identity_key(doc)): doc for doc in maps["players"].values()}
    inscription_by_key = {
        (doc.get("import_identity_key"), doc.get("temporada")): doc
        for doc in maps["inscriptions"].values() if doc.get("import_identity_key")
    }
    payment_by_key = {
        (doc.get("player_id"), doc.get("temporada")): doc
        for doc in maps["payments"].values() if doc.get("temporada")
    }
    operations: Dict[tuple, dict] = {}

    def schedule(collection: str, before: Optional[dict], after: dict) -> None:
        key = (collection, after["id"])
        if key in operations:
            operations[key]["after"] = _clean_doc(after)
        else:
            operations[key] = {"collection": collection, "id": after["id"],
                               "before": _clean_doc(before), "after": _clean_doc(after)}
        maps[collection][after["id"]] = after

    family_fields = {
        "progenitor1_nombre", "progenitor1_telefono", "progenitor1_email",
        "progenitor2_nombre", "progenitor2_telefono", "progenitor2_email",
        "domicilio", "observaciones",
    }
    inscription_fields = set(SAFE_PLAYER_FIELDS) | {"tipo", "equipamiento_items"}
    for result in analysis["rows"]:
        if result.get("status") in {"error", "duplicate"}:
            continue
        if result.get("status") == "conflict":
            if decisions.get(result.get("conflict_id")) != "skip":
                raise HTTPException(status_code=409, detail="Todos los conflictos requieren una decisión explícita")
            continue
        row = result["record"]
        team_key = normalize_key(row.get("equipo"))
        team = team_by_name.get(team_key)
        if not team:
            team = {
                "id": new_id(), "nombre": row["equipo"], "categoria": row["categoria"],
                "modalidad": row["modalidad"], "temporada": analysis["season"],
                "limite_jugadores": 18 if row["modalidad"] == "F7" else 25,
                "estado": "activo", "created_at": now, "updated_at": now,
            }
            schedule("teams", None, team); team_by_name[team_key] = team

        fkey = family_key(row)
        family = family_by_key.get(fkey)
        family_before = family
        if family:
            family = merge_nonempty(family, row, family_fields)
            family["updated_at"] = now
        else:
            family = merge_nonempty({"id": new_id(), "created_at": now}, row, family_fields)
            family.update({"contacto_principal": "progenitor1", "preferencia_comunicacion": "email", "updated_at": now})
        if family != family_before:
            schedule("families", family_before, family)
        family_by_key[fkey] = family

        pkey = row["import_identity_key"]
        player = player_by_key.get(pkey)
        player_before = player
        player = merge_nonempty(player or {"id": new_id(), "created_at": now}, row, SAFE_PLAYER_FIELDS)
        current_equipment = list(player.get("equipamiento_items") or [])
        for item in row.get("equipamiento_items") or []:
            if item.casefold() not in {value.casefold() for value in current_equipment}:
                current_equipment.append(item)
        player.update({
            "equipo_id": team["id"], "familia_id": family["id"], "equipamiento_items": current_equipment,
            "import_identity_key": pkey, "import_job_id": job_id, "updated_at": now,
        })
        player.setdefault("estado", "pendiente_documentacion")
        player.setdefault("fecha_inscripcion", now)
        if player != player_before:
            schedule("players", player_before, player)
        player_by_key[pkey] = player

        ikey = (pkey, analysis["season"])
        inscription = inscription_by_key.get(ikey)
        inscription_before = inscription
        inscription = merge_nonempty(inscription or {"id": new_id(), "created_at": now}, row, inscription_fields)
        inscription.update({
            "temporada": analysis["season"], "equipo_id": team["id"], "familia_id": family["id"],
            "player_id": player["id"], "modalidad": row["modalidad"], "import_identity_key": pkey,
            "import_job_id": job_id, "estado": inscription.get("estado", "recibida"), "updated_at": now,
        })
        if inscription != inscription_before:
            schedule("inscriptions", inscription_before, inscription)
        inscription_by_key[ikey] = inscription

        protected_bank = row.get("_bank") or {}
        if row.get("iban") or protected_bank.get("iban_encrypted"):
            pay_key = (player["id"], analysis["season"])
            payment = payment_by_key.get(pay_key)
            payment_before = payment
            payment = dict(payment or {"id": new_id(), "created_at": now, "estado": "pendiente",
                                       "concepto": f"Cuota temporada {analysis['season']}"})
            payment.update({
                "player_id": player["id"], "temporada": analysis["season"], "forma_pago": "domiciliacion",
                **(protected_bank if protected_bank.get("iban_encrypted") else encrypt_iban(row["iban"], JWT_SECRET)),
                "iban": None, "import_job_id": job_id, "updated_at": now,
            })
            schedule("payments", payment_before, payment); payment_by_key[pay_key] = payment
    return list(operations.values())


async def _apply_operations(operations: list[dict], reverse: bool = False) -> None:
    sequence = list(reversed(operations)) if reverse else operations
    applied = []
    try:
        for operation in sequence:
            target = operation["before"] if reverse else operation["after"]
            if target is None:
                await db[operation["collection"]].delete_one({"id": operation["id"]})
            else:
                await db[operation["collection"]].replace_one({"id": operation["id"]}, target, upsert=True)
            applied.append(operation)
    except Exception:
        for operation in reversed(applied):
            target = operation["after"] if reverse else operation["before"]
            if target is None:
                await db[operation["collection"]].delete_one({"id": operation["id"]})
            else:
                await db[operation["collection"]].replace_one({"id": operation["id"]}, target, upsert=True)
        raise


@api_router.get("/inscription-imports/template")
async def download_inscription_template():
    path = ROOT_DIR / "templates" / "plantilla_inscripciones_2026-2027.xlsx"
    if not path.exists():
        raise HTTPException(status_code=503, detail="Plantilla no disponible")
    return FileResponse(path, filename=path.name,
                        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@api_router.post("/inscription-imports/analyze")
async def analyze_inscription_import(file: UploadFile = File(...), season: str = Form(...)):
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Solo se admiten archivos .xlsx")
    content = await file.read()
    digest = file_sha256(content)
    try:
        rows = parse_excel(content)
        duplicate = bool(await db.import_locks.find_one({"_id": f"{season}:{digest}"}))
        analysis = analyze_rows(rows, season, await _import_existing(), digest, duplicate)
        token = encode_plan({"season": season, "file_sha256": digest, "rows": rows,
                             "generated_at": now_iso()}, JWT_SECRET)
        return _public_analysis(analysis, token)
    except ImportValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _decode_and_check_plan(plan_token: str) -> dict:
    try:
        return decode_plan(plan_token, JWT_SECRET)
    except ImportValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.post("/inscription-imports/error-report")
async def inscription_import_error_report(request: ImportPlanRequest):
    plan = _decode_and_check_plan(request.plan_token)
    duplicate = bool(await db.import_locks.find_one({"_id": f"{plan['season']}:{plan['file_sha256']}"}))
    analysis = analyze_rows(plan["rows"], plan["season"], await _import_existing(), plan["file_sha256"], duplicate)
    workbook = Workbook(); sheet = workbook.active; sheet.title = "Errores"
    sheet.append(["Fila", "Estado", "Gravedad", "Código", "Mensaje"])
    for issue in analysis["issues"]:
        sheet.append([issue.get("row"), issue.get("status"), issue.get("severity"), issue.get("code"), issue.get("message")])
    buffer = io.BytesIO(); workbook.save(buffer); buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=informe_importacion.xlsx"})


@api_router.post("/inscription-imports/confirm")
async def confirm_inscription_import(request: ImportConfirmRequest):
    if request.confirmed is not True:
        raise HTTPException(status_code=422, detail="La importación requiere confirmación expresa")
    plan = _decode_and_check_plan(request.plan_token)
    lock_id = f"{plan['season']}:{plan['file_sha256']}"
    existing = await _import_existing()
    duplicate = bool(await db.import_locks.find_one({"_id": lock_id}))
    analysis = analyze_rows(plan["rows"], plan["season"], existing, plan["file_sha256"], duplicate)
    if analysis["blocking_errors"]:
        raise HTTPException(status_code=409, detail="La importación contiene errores graves")
    if any(request.decisions.get(item.get("conflict_id")) != "skip" for item in analysis["rows"] if item.get("status") == "conflict"):
        raise HTTPException(status_code=409, detail="Todos los conflictos requieren una decisión explícita")
    actor = current_user_context.get() or {}
    job_id = new_id()
    operations = _build_import_operations(analysis, existing, job_id, request.decisions)
    try:
        await db.import_locks.insert_one({"_id": lock_id, "job_id": job_id, "created_at": now_iso()})
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Este archivo ya fue importado") from exc
    job = {"id": job_id, "season": plan["season"], "file_sha256": plan["file_sha256"],
           "status": "applying", "summary": analysis["summary"], "operations": operations,
           "created_by_user_id": actor.get("id"), "created_at": now_iso(), "updated_at": now_iso()}
    try:
        await db.inscription_import_jobs.insert_one(job)
        await _apply_operations(operations)
        await db.inscription_import_jobs.update_one({"id": job_id}, {"$set": {"status": "applied", "updated_at": now_iso()}})
    except Exception as exc:
        await db.import_locks.delete_one({"_id": lock_id})
        await db.inscription_import_jobs.update_one({"id": job_id}, {"$set": {"status": "failed", "updated_at": now_iso()}}, upsert=False)
        raise HTTPException(status_code=500, detail="La importación fue revertida sin cambios parciales") from exc
    return {"ok": True, "job_id": job_id, "status": "applied", "operations": len(operations), "summary": analysis["summary"]}


@api_router.get("/inscription-imports/history")
async def inscription_import_history():
    jobs = await db.inscription_import_jobs.find({}, {"_id": 0, "operations": 0, "created_by_user_id": 0}).sort("created_at", -1).to_list(100)
    for job in jobs:
        job["file_sha256"] = f"{job.get('file_sha256', '')[:12]}…"
    return jobs


@api_router.post("/inscription-imports/{job_id}/undo")
async def undo_inscription_import(job_id: str):
    job = await db.inscription_import_jobs.find_one({"id": job_id}, {"_id": 0})
    if not job or job.get("status") != "applied":
        raise HTTPException(status_code=409, detail="La importación no existe o ya fue deshecha")
    for operation in job.get("operations") or []:
        current = _clean_doc(await db[operation["collection"]].find_one({"id": operation["id"]}))
        if current != operation.get("after"):
            raise HTTPException(status_code=409, detail="No se puede deshacer: existen cambios posteriores")
    await _apply_operations(job.get("operations") or [], reverse=True)
    actor = current_user_context.get() or {}
    await db.inscription_import_jobs.update_one({"id": job_id}, {"$set": {
        "status": "undone", "undone_at": now_iso(), "undone_by_user_id": actor.get("id"), "updated_at": now_iso(),
    }})
    await db.import_locks.delete_one({"_id": f"{job['season']}:{job['file_sha256']}"})
    return {"ok": True, "job_id": job_id, "status": "undone"}


# ================= IMPORT PREPARATION / STAGING =================
def _staging_ttl_hours() -> int:
    try:
        return max(1, min(int(os.environ.get("IMPORT_STAGING_TTL_HOURS", "168")), 24 * 90))
    except ValueError:
        return 168


async def _ensure_staging_indexes() -> None:
    await db.import_staging.create_index("expires_at", expireAfterSeconds=0, name="expires_at_ttl")
    await db.import_staging.create_index([("status", 1), ("updated_at", -1)], name="status_updated")
    await db.import_staging.create_index("source_sha256", name="source_sha256")


async def _staging_doc(draft_id: str) -> dict:
    draft = await db.import_staging.find_one({"id": draft_id})
    if not draft:
        raise HTTPException(status_code=404, detail="El borrador no existe o ha caducado")
    return draft


def _staging_actor() -> Optional[str]:
    return (current_user_context.get() or {}).get("id")


@api_router.post("/inscription-imports/staging")
async def create_import_staging(file: UploadFile = File(...), season: str = Form(...)):
    if season != IMPORT_SEASON:
        raise HTTPException(status_code=422, detail=f"La temporada permitida es {IMPORT_SEASON}")
    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Solo se admiten archivos .xlsx")
    content = await file.read()
    digest = file_sha256(content)
    await _ensure_staging_indexes()
    previous = await db.import_staging.find_one({"source_sha256": digest, "season": season, "status": "draft"})
    if previous:
        return public_draft(previous)
    try:
        rows = parse_excel(content)
    except ImportValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    records, duplicates, incidents = prepare_records(rows, JWT_SECRET)
    now = datetime.now(timezone.utc)
    draft = {
        "id": new_id(), "season": season, "status": "draft", "source_sha256": digest,
        "records": records, "duplicates": duplicates, "incidents": incidents,
        "audit": [audit_event(_staging_actor(), "draft_created", {"rows": len(records)})],
        "created_by_user_id": _staging_actor(), "created_at": now, "updated_at": now,
        "expires_at": expiry(_staging_ttl_hours()),
    }
    await db.import_staging.insert_one(draft)
    return public_draft(draft)


@api_router.get("/inscription-imports/staging")
async def list_import_staging():
    await _ensure_staging_indexes()
    drafts = await db.import_staging.find({"status": "draft"}).sort("updated_at", -1).to_list(100)
    return [public_draft(item, include_records=False) for item in drafts]


@api_router.get("/inscription-imports/staging/{draft_id}")
async def get_import_staging(draft_id: str):
    return public_draft(await _staging_doc(draft_id))


@api_router.patch("/inscription-imports/staging/{draft_id}/records/{record_id}")
async def update_staging_record(draft_id: str, record_id: str, request: StagingRecordUpdate):
    draft = await _staging_doc(draft_id)
    if request.field == "iban":
        normalized = normalize_key(request.value)
        raw = str(request.value or "").replace(" ", "").upper()
        if normalized and not staging_valid_iban(raw):
            raise HTTPException(status_code=422, detail="El IBAN no es válido; no se guardó")
        bank = encrypt_iban(raw, JWT_SECRET) if raw else {}
        update_path = "records.$.bank"
        value = {"status": "valid", **bank} if bank else {"status": "pending", "iban_encrypted": None, "iban_last4": None}
        issue_field = "bank"
    elif request.field in ALLOWED_RECORD_FIELDS - {"equipamiento_items"}:
        update_path, value, issue_field = f"records.$.{request.field}", str(request.value or "").strip(), request.field
        if request.field == "modalidad":
            value = value.upper()
            if value not in {"", "F7", "F11"}:
                raise HTTPException(status_code=422, detail="La modalidad debe ser F7 o F11")
        candidate = dict(next((row for row in draft.get("records", []) if row.get("id") == record_id), {}))
        candidate[request.field] = value
        if not field_is_valid(candidate, request.field):
            raise HTTPException(status_code=422, detail="El valor no tiene un formato válido")
    else:
        raise HTTPException(status_code=422, detail="Campo no editable")
    now = datetime.now(timezone.utc)
    event = audit_event(_staging_actor(), "record_updated", {"record_id": record_id, "field": request.field})
    result = await db.import_staging.update_one(
        {"id": draft_id, "records.id": record_id},
        {"$set": {update_path: value, "updated_at": now, "expires_at": expiry(_staging_ttl_hours())}, "$push": {"audit": event}},
    )
    if not result.modified_count:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    if value not in (None, ""):
        await db.import_staging.update_many(
            {"id": draft_id}, {"$set": {"incidents.$[issue].resolution": "corrected"}},
            array_filters=[{"issue.record_id": record_id, "issue.field": issue_field}],
        )
    return public_draft(await _staging_doc(draft_id))


@api_router.post("/inscription-imports/staging/{draft_id}/bulk")
async def bulk_update_staging(draft_id: str, request: StagingBulkUpdate):
    if request.field not in {"equipo", "categoria", "modalidad"}:
        raise HTTPException(status_code=422, detail="Asignación masiva no permitida para este campo")
    value = request.value.strip()
    if request.field == "modalidad":
        value = value.upper()
        if value not in {"F7", "F11"}:
            raise HTTPException(status_code=422, detail="La modalidad debe ser F7 o F11")
        if not request.confirm_suggestion:
            raise HTTPException(status_code=422, detail="La sugerencia de modalidad requiere confirmación expresa")
    draft = await _staging_doc(draft_id)
    selected = set(request.record_ids)
    if not selected or not selected.issubset({row["id"] for row in draft.get("records", [])}):
        raise HTTPException(status_code=422, detail="Selección de registros no válida")
    now = datetime.now(timezone.utc)
    await db.import_staging.update_one(
        {"id": draft_id},
        {"$set": {
            "records.$[row]." + request.field: value,
            **({"records.$[row].suggestion_confirmed": True} if request.field == "modalidad" else {}),
            "incidents.$[issue].resolution": "corrected", "updated_at": now,
            "expires_at": expiry(_staging_ttl_hours()),
        }, "$push": {"audit": audit_event(_staging_actor(), "bulk_updated", {
            "field": request.field, "records": len(selected),
        })}},
        array_filters=[{"row.id": {"$in": list(selected)}}, {"issue.record_id": {"$in": list(selected)}, "issue.field": request.field}],
    )
    return public_draft(await _staging_doc(draft_id))


@api_router.post("/inscription-imports/staging/{draft_id}/duplicates/{group_id}")
async def resolve_staging_duplicate(draft_id: str, group_id: str, request: StagingDuplicateDecision):
    allowed = {"keep_first", "keep_second", "merge", "different_people"}
    if request.decision not in allowed:
        raise HTTPException(status_code=422, detail="Decisión de duplicado no válida")
    result = await db.import_staging.update_one(
        {"id": draft_id, "duplicates.id": group_id},
        {"$set": {"duplicates.$.decision": request.decision, "updated_at": datetime.now(timezone.utc),
                  "expires_at": expiry(_staging_ttl_hours())},
         "$push": {"audit": audit_event(_staging_actor(), "duplicate_resolved", {"group_id": group_id, "decision": request.decision})}},
    )
    if not result.modified_count:
        raise HTTPException(status_code=404, detail="Duplicado no encontrado")
    return public_draft(await _staging_doc(draft_id))


@api_router.post("/inscription-imports/staging/{draft_id}/october")
async def select_staging_october(draft_id: str, request: StagingOctoberSelection):
    draft = await _staging_doc(draft_id)
    requested = set(request.record_ids)
    valid_ids = {row["id"] for row in effective_records(draft) if row.get("tipo") == "renovacion"}
    if len(requested) > 54 or not requested.issubset(valid_ids):
        raise HTTPException(status_code=422, detail="La selección de octubre admite exactamente hasta 54 registros válidos")
    records = draft.get("records", [])
    for row in records:
        row["selected_october"] = row["id"] in requested
    await db.import_staging.update_one({"id": draft_id}, {"$set": {
        "records": records, "updated_at": datetime.now(timezone.utc), "expires_at": expiry(_staging_ttl_hours()),
    }, "$push": {"audit": audit_event(_staging_actor(), "october_selection", {"count": len(requested)})}})
    return public_draft(await _staging_doc(draft_id))


@api_router.patch("/inscription-imports/staging/{draft_id}/incidents/{incident_id}")
async def resolve_staging_incident(draft_id: str, incident_id: str, request: StagingIncidentResolution):
    if request.resolution not in {"corrected", "not_applicable"}:
        raise HTTPException(status_code=422, detail="Resolución no válida")
    draft = await _staging_doc(draft_id)
    incident = next((item for item in draft.get("incidents", []) if item.get("id") == incident_id), None)
    if not incident:
        raise HTTPException(status_code=404, detail="Incidencia no encontrada")
    if incident.get("blocking") and request.resolution == "not_applicable":
        raise HTTPException(status_code=422, detail="Una incidencia obligatoria debe corregirse")
    record = next((row for row in draft.get("records", []) if row.get("id") == incident.get("record_id")), {})
    if request.resolution == "corrected" and not field_is_valid(record, incident.get("field")):
        raise HTTPException(status_code=422, detail="Corrige el valor antes de cerrar la incidencia")
    await db.import_staging.update_one(
        {"id": draft_id, "incidents.id": incident_id},
        {"$set": {"incidents.$.resolution": request.resolution, "updated_at": datetime.now(timezone.utc),
                  "expires_at": expiry(_staging_ttl_hours())},
         "$push": {"audit": audit_event(_staging_actor(), "incident_resolved", {"incident_id": incident_id, "resolution": request.resolution})}},
    )
    return public_draft(await _staging_doc(draft_id))


@api_router.delete("/inscription-imports/staging/{draft_id}")
async def delete_import_staging(draft_id: str):
    result = await db.import_staging.delete_one({"id": draft_id, "status": "draft"})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="El borrador no existe")
    return {"ok": True}


@api_router.post("/inscription-imports/staging/{draft_id}/confirm")
async def confirm_import_staging(draft_id: str, request: StagingConfirmRequest):
    if request.confirmed is not True:
        raise HTTPException(status_code=422, detail="La importación requiere confirmación expresa")
    draft = await _staging_doc(draft_id)
    summary = draft_summary(draft)
    if not summary["can_import"]:
        raise HTTPException(status_code=409, detail="El borrador mantiene bloqueos pendientes")
    rows = []
    for record in effective_records(draft):
        row = {key: value for key, value in record.items() if key in ALLOWED_RECORD_FIELDS}
        row["_row"] = record.get("source_row")
        if record.get("identity_override"):
            row["external_id"] = record["identity_override"]
        bank = record.get("bank") or {}
        if bank.get("status") == "valid":
            row["_bank"] = {"iban_encrypted": bank.get("iban_encrypted"), "iban_last4": bank.get("iban_last4")}
        rows.append(row)
    existing = await _import_existing()
    analysis = analyze_rows(rows, draft["season"], existing, draft["source_sha256"], False)
    if analysis["blocking_errors"] or analysis["unresolved_conflicts"]:
        raise HTTPException(status_code=409, detail="La validación final ha detectado bloqueos")
    lock_id = f"{draft['season']}:{draft['source_sha256']}"
    job_id = new_id()
    operations = _build_import_operations(analysis, existing, job_id, {})
    try:
        await db.import_locks.insert_one({"_id": lock_id, "job_id": job_id, "created_at": now_iso()})
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Este archivo ya fue importado") from exc
    job = {"id": job_id, "season": draft["season"], "file_sha256": draft["source_sha256"],
           "status": "applying", "summary": analysis["summary"], "operations": operations,
           "created_by_user_id": _staging_actor(), "staging_id": draft_id,
           "created_at": now_iso(), "updated_at": now_iso()}
    try:
        await db.inscription_import_jobs.insert_one(job)
        await _apply_operations(operations)
        await db.inscription_import_jobs.update_one({"id": job_id}, {"$set": {"status": "applied", "updated_at": now_iso()}})
        await db.import_staging.update_one({"id": draft_id}, {"$set": {"status": "imported", "updated_at": datetime.now(timezone.utc)},
                                                                  "$unset": {"records": "", "incidents": "", "duplicates": ""}})
    except Exception as exc:
        await db.import_locks.delete_one({"_id": lock_id})
        await db.inscription_import_jobs.update_one({"id": job_id}, {"$set": {"status": "failed", "updated_at": now_iso()}})
        raise HTTPException(status_code=500, detail="La importación fue revertida sin cambios parciales") from exc
    return {"ok": True, "job_id": job_id, "status": "applied", "operations": len(operations)}


# ================= TRAININGS =================
class AsistenciaItem(BaseModel):
    player_id: str
    estado: str = "presente"  # presente, justificada, injustificada, lesion
    motivo: Optional[str] = None

    @field_validator("estado")
    @classmethod
    def validate_estado(cls, value: str):
        if value not in ATTENDANCE_STATES:
            raise ValueError("Estado de asistencia no válido")
        return value


class Training(BaseModel):
    fecha: Optional[str] = None
    hora: Optional[str] = None
    equipo_id: Optional[str] = None
    campo: Optional[str] = None
    asistencia: List[AsistenciaItem] = []
    ejercicios: Optional[str] = None
    observaciones: Optional[str] = None
    callup_id: Optional[str] = None


async def attendance_data(desde: Optional[str] = None, hasta: Optional[str] = None,
                          equipo_id: Optional[str] = None, player_id: Optional[str] = None):
    """Devuelve datos ya acotados por la identidad autenticada, nunca por el cliente."""
    actor = current_user_context.get() or {}
    trainings = await list_docs("trainings")
    players = await list_docs("players")
    teams = await list_docs("teams")
    allowed_players = {player.get("id") for player in players if player.get("id")}
    if player_id:
        if player_id not in allowed_players:
            raise HTTPException(status_code=403, detail="El jugador solicitado no pertenece a tu ámbito")
        allowed_players = {player_id}
    if equipo_id:
        allowed_teams = {team.get("id") for team in teams}
        if equipo_id not in allowed_teams:
            raise HTTPException(status_code=403, detail="El equipo solicitado no pertenece a tu ámbito")
        trainings = [training for training in trainings if training.get("equipo_id") == equipo_id]
        allowed_players = {player.get("id") for player in players if player.get("equipo_id") == equipo_id and player.get("id") in allowed_players}
    # Las familias y jugadores ven exclusivamente sus filas, incluso si el entrenamiento tiene más asistentes.
    if actor.get("role") in {"family", "player"}:
        trainings = [{**training, "asistencia": [row for row in training.get("asistencia", []) if row.get("player_id") in allowed_players]}
                     for training in trainings]
    return trainings, players, teams, allowed_players


@api_router.get("/attendance/summary")
async def get_attendance_summary(desde: Optional[str] = None, hasta: Optional[str] = None,
                                 equipo_id: Optional[str] = None, categoria: Optional[str] = None,
                                 player_id: Optional[str] = None, periodo: str = "weekly"):
    trainings, players, teams, allowed_players = await attendance_data(desde, hasta, equipo_id, player_id)
    if categoria:
        team_ids = {team.get("id") for team in teams if team.get("categoria") == categoria}
        trainings = [training for training in trainings if training.get("equipo_id") in team_ids]
        allowed_players = {player.get("id") for player in players if player.get("equipo_id") in team_ids and player.get("id") in allowed_players}
    threshold_doc = await db.settings.find_one({"id": SETTINGS_ID}, {"_id": 0, "attendance_alert_threshold": 1}) or {}
    threshold = threshold_doc.get("attendance_alert_threshold", 3)
    rows = attendance_rows(trainings, allowed_players, desde, hasta)
    names = {player.get("id"): f"{player.get('nombre', '')} {player.get('apellidos', '')}".strip() for player in players}
    alerts = [{**alert, "player_name": names.get(alert["player_id"], "—")} for alert in repeated_absence_alerts(trainings, threshold, allowed_players, desde, hasta)]
    return {
        "summary": attendance_summary(trainings, allowed_players, desde, hasta),
        "trend": attendance_trend(trainings, allowed_players, periodo if periodo in {"weekly", "monthly"} else "weekly", desde, hasta),
        "players": [{"player_id": pid, "player_name": names.get(pid, "—"), **stats} for pid, stats in player_percentages(trainings, allowed_players, desde, hasta).items()],
        "alerts": alerts,
        "callup_comparison": callup_attendance_comparison(trainings, await list_docs("callups"), allowed_players),
        "recent": sorted(rows, key=lambda row: row.get("fecha") or "", reverse=True)[:12],
    }


def attendance_export_pdf(summary: dict, lang: str) -> io.BytesIO:
    labels = {
        "es": ("Informe de asistencia", "Periodo", "Presentes", "Justificadas", "Injustificadas", "Lesiones", "Porcentaje de presencia"),
        "eu": ("Asistentzia-txostena", "Aldia", "Bertaratutakoak", "Justifikatuak", "Justifikatu gabeak", "Lesioak", "Bertaratze-ehunekoa"),
    }
    title, period, present, justified, unjustified, injury, percentage = labels.get(lang, labels["es"])
    data = summary["summary"]
    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm)
    styles = getSampleStyleSheet()
    story = [Paragraph(title + " / " + labels["eu" if lang == "es" else "es"][0], styles["Title"]), Spacer(1, 8 * mm)]
    story.append(Table([[period, f"{data.get('desde') or '—'} — {data.get('hasta') or '—'}"],
                        [present, data["presente"]], [justified, data["justificada"]],
                        [unjustified, data["injustificada"]], [injury, data["lesion"]], [percentage, f"{data['porcentaje_presencia']}%"]],
                       colWidths=[75 * mm, 85 * mm], style=TableStyle([
                           ("GRID", (0, 0), (-1, -1), .35, colors.HexColor("#CBD5E1")),
                           ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F9")),
                           ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"), ("PADDING", (0, 0), (-1, -1), 7),
                       ])))
    document.build(story)
    buffer.seek(0)
    return buffer


@api_router.get("/attendance/export.pdf")
async def export_attendance_pdf(desde: Optional[str] = None, hasta: Optional[str] = None,
                                equipo_id: Optional[str] = None, player_id: Optional[str] = None, lang: str = "es"):
    summary = await get_attendance_summary(desde, hasta, equipo_id, None, player_id)
    return StreamingResponse(attendance_export_pdf(summary, "eu" if lang == "eu" else "es"), media_type="application/pdf",
                             headers={"Content-Disposition": "attachment; filename=asistencia.pdf"})


@api_router.get("/attendance/export.xlsx")
async def export_attendance_excel(desde: Optional[str] = None, hasta: Optional[str] = None,
                                  equipo_id: Optional[str] = None, player_id: Optional[str] = None):
    summary = await get_attendance_summary(desde, hasta, equipo_id, None, player_id)
    buffer = io.BytesIO()
    pd.DataFrame(summary["players"]).to_excel(buffer, index=False)
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": "attachment; filename=asistencia.xlsx"})


@api_router.post("/trainings")
async def create_training(tr: Training):
    payload = tr.model_dump()
    payload["attendance_history"] = []
    payload["attendance_updated_by"] = None
    return await insert_doc("trainings", payload)


@api_router.get("/trainings")
async def get_trainings(equipo_id: Optional[str] = None):
    query = {"equipo_id": equipo_id} if equipo_id else {}
    trs = await list_docs("trainings", query)
    teams = {t["id"]: t["nombre"] for t in await list_docs("teams")}
    for tr in trs:
        tr["equipo_nombre"] = teams.get(tr.get("equipo_id"), "—")
        a = tr.get("asistencia", [])
        tr["presentes"] = len([x for x in a if x.get("estado") == "presente"])
        tr["total_asistencia"] = len(a)
    return trs


@api_router.get("/trainings/{tr_id}")
async def get_training(tr_id: str):
    tr = await get_doc("trainings", tr_id)
    players = {p["id"]: p for p in await list_docs("players")}
    for item in tr.get("asistencia", []):
        p = players.get(item["player_id"], {})
        item["nombre"] = f"{p.get('nombre','')} {p.get('apellidos','')}".strip()
    return tr


@api_router.put("/trainings/{tr_id}")
async def edit_training(tr_id: str, tr: Training):
    existing = await get_doc("trainings", tr_id)
    payload = tr.model_dump()
    actor = current_user_context.get() or {}
    changes = attendance_history(existing.get("asistencia", []), payload.get("asistencia", []), actor)
    payload["attendance_history"] = [*(existing.get("attendance_history") or []), *changes]
    if changes:
        payload["attendance_updated_by"] = {"id": actor.get("id"), "role": actor.get("role"), "at": now_iso()}
    updated = await update_doc("trainings", tr_id, payload)
    schedule_changed = any(existing.get(field) != updated.get(field) for field in ("fecha", "hora", "campo"))
    if schedule_changed:
        users = await users_for_team_players(updated.get("equipo_id"))
        await enqueue_notifications(users, "schedule.changed", "Cambio de entrenamiento / Entrenamendu aldaketa",
                                    str(updated.get("campo") or "Entrenamiento"), "/entrenamientos", "urgent",
                                    {"training_id": tr_id}, f"schedule.changed:training:{tr_id}:{updated.get('updated_at')}")
    return updated


@api_router.delete("/trainings/{tr_id}")
async def remove_training(tr_id: str):
    return await delete_doc("trainings", tr_id)


# ================= STATS =================
class PlayerStats(BaseModel):
    player_id: str
    temporada: Optional[str] = None
    partidos_convocado: Optional[int] = 0
    partidos_jugados: Optional[int] = 0
    minutos: Optional[int] = 0
    goles: Optional[int] = 0
    asistencias: Optional[int] = 0
    amarillas: Optional[int] = 0
    rojas: Optional[int] = 0
    porterias_cero: Optional[int] = 0
    posicion: Optional[str] = None
    valoracion: Optional[int] = None
    observaciones: Optional[str] = None


@api_router.post("/stats")
async def create_stats(stats: PlayerStats):
    return await insert_doc("stats", stats.model_dump())


@api_router.get("/stats")
async def get_stats(player_id: Optional[str] = None):
    query = {"player_id": player_id} if player_id else {}
    rows = await list_docs("stats", query)
    players = {p["id"]: f"{p.get('nombre','')} {p.get('apellidos','')}".strip() for p in await list_docs("players")}
    for r in rows:
        r["player_nombre"] = players.get(r.get("player_id"), "—")
    return rows


@api_router.put("/stats/{stats_id}")
async def edit_stats(stats_id: str, stats: PlayerStats):
    return await update_doc("stats", stats_id, stats.model_dump())


@api_router.delete("/stats/{stats_id}")
async def remove_stats(stats_id: str):
    return await delete_doc("stats", stats_id)


# ================= NOTIFICATIONS =================
async def generate_user_reminders(user: dict) -> None:
    now = datetime.now(timezone.utc)
    until = now + timedelta(hours=48)
    for collection, notification_type, link, label in (
        ("matches", "match.upcoming", "/partidos", "Partido próximo / Hurrengo partida"),
        ("trainings", "training.upcoming", "/entrenamientos", "Entrenamiento próximo / Hurrengo entrenamendua"),
    ):
        for item in await list_docs(collection):
            try:
                moment = datetime.fromisoformat(f"{item.get('fecha')}T{item.get('hora') or '00:00'}").replace(tzinfo=timezone.utc)
            except (TypeError, ValueError):
                continue
            if now <= moment <= until:
                detail = item.get("rival") or item.get("ejercicios") or item.get("campo") or "Ikas-Txiki"
                await enqueue_notifications([user], notification_type, label, str(detail), link, "high",
                                            {"id": item.get("id")}, f"{notification_type}:{item.get('id')}:{user.get('id')}")

    player_ids = set(await user_player_ids(user))
    for callup in await list_docs("callups"):
        pending = [row for row in callup.get("convocados", [])
                   if row.get("estado") in {"pending", "pendiente"}
                   and (not player_ids or row.get("player_id") in player_ids)]
        if pending:
            await enqueue_notifications([user], "callup.pending", "Convocatoria pendiente / Deialdia zain",
                                        f"{len(pending)} respuesta(s) pendiente(s)", "/convocatorias", "high",
                                        {"callup_id": callup.get("id")}, f"callup.pending:{callup.get('id')}:{user.get('id')}")

    if user.get("role") in {"family", "player"} and player_ids:
        for payment in await list_docs("payments") if user.get("role") == "family" else []:
            if payment.get("estado") in {"pendiente", "parcial", "devuelto"}:
                await enqueue_notifications([user], "payment.pending", "Pago pendiente / Ordainketa zain",
                                            str(payment.get("concepto") or "Cuota"), "/portal", "high",
                                            {"payment_id": payment.get("id")}, f"payment.pending:{payment.get('id')}:{user.get('id')}")
        for player in await list_docs("players"):
            if player.get("estado_documental") != "completo":
                await enqueue_notifications([user], "document.pending", "Documentación pendiente / Dokumentazioa zain",
                                            f"{player.get('nombre', '')} {player.get('apellidos', '')}".strip(), "/portal", "normal",
                                            {"player_id": player.get("id")}, f"document.pending:{player.get('id')}:{user.get('id')}")
        for authorization in await list_docs("authorizations"):
            if authorization.get("estado") == "pendiente":
                await enqueue_notifications([user], "authorization.pending", "Autorización pendiente / Baimena zain",
                                            str(authorization.get("tipo") or "Autorización"), "/portal", "normal",
                                            {"authorization_id": authorization.get("id")},
                                            f"authorization.pending:{authorization.get('id')}:{user.get('id')}")


@api_router.get("/notifications")
async def get_notifications(unread_only: bool = False):
    user = current_user_context.get() or {}
    await generate_user_reminders(user)
    notifications = await list_docs("notifications", {"read_at": None} if unread_only else None)
    now = now_iso()
    notifications = [item for item in notifications if not item.get("expires_at") or item["expires_at"] > now]
    return {"items": notifications, "unread": sum(1 for item in notifications if not item.get("read_at"))}


@api_router.patch("/notifications/{notification_id}/read")
async def read_notification(notification_id: str):
    query = merge_query({"id": notification_id}, await scope_for_collection("notifications"))
    result = await db.notifications.update_one(query, {"$set": {"read_at": now_iso()}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notificación no encontrada")
    return {"ok": True}


@api_router.patch("/notifications/read-all")
async def read_all_notifications():
    query = merge_query({"read_at": None}, await scope_for_collection("notifications"))
    result = await db.notifications.update_many(query, {"$set": {"read_at": now_iso()}})
    return {"ok": True, "updated": result.modified_count}


@api_router.patch("/notifications/preferences")
async def update_notification_preferences(preferences: NotificationPreferences):
    user = current_user_context.get() or {}
    if not user.get("id"):
        raise HTTPException(status_code=422, detail="El usuario administrativo debe existir en la colección users")
    result = await db.users.update_one(
        {"$or": [{"id": user["id"]}, {"username": user.get("username")}]},
        {"$set": {"notification_preferences": preferences.model_dump(), "updated_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=422, detail="El usuario debe existir en la colección users")
    return {"ok": True, "notification_preferences": preferences.model_dump()}


@api_router.get("/notifications/providers")
async def notification_providers():
    return provider_configuration()


# ================= COMMUNICATIONS =================
class Communication(BaseModel):
    destinatario_tipo: str = "equipo"  # equipo, categoria, individual
    destinatario_id: Optional[str] = None
    destinatario_nombre: Optional[str] = None
    canal: str = "email"  # email, whatsapp
    asunto: Optional[str] = None
    mensaje: Optional[str] = None
    enviado: bool = False
    fecha_envio: Optional[str] = None
    prioridad: str = "normal"

    @field_validator("canal")
    @classmethod
    def validate_channel(cls, value: str):
        if value not in {"email", "whatsapp", "sms"}:
            raise ValueError("Canal no válido")
        return value

    @field_validator("prioridad")
    @classmethod
    def validate_priority(cls, value: str):
        if value not in {"low", "normal", "high", "urgent"}:
            raise ValueError("Prioridad no válida")
        return value


async def communication_targets(data: dict) -> tuple[list[dict], list[str]]:
    target_type = data.get("destinatario_tipo")
    target_id = data.get("destinatario_id")
    team_ids: list[str] = []
    player_ids: list[str] = []
    family_ids: list[str] = []
    if target_type == "equipo" and target_id:
        team_ids = [target_id]
        player_ids = ids(await db.players.distinct("id", {"equipo_id": target_id}))
    elif target_type == "categoria" and target_id:
        team_ids = ids(await db.teams.distinct("id", {"categoria": target_id}))
        player_ids = ids(await db.players.distinct("id", {"equipo_id": {"$in": team_ids}}))
    elif target_type == "individual" and target_id:
        if await db.players.find_one({"id": target_id}):
            player_ids = [target_id]
        elif await db.families.find_one({"id": target_id}):
            family_ids = [target_id]
    if player_ids:
        family_ids = sorted(set(family_ids + ids(await db.players.distinct("familia_id", {"id": {"$in": player_ids}}))))
    users = await notification_users(team_ids, player_ids, family_ids)
    emails = set()
    async for player in db.players.find({"id": {"$in": player_ids}}, {"_id": 0, "email_formulario": 1, "progenitor1_email": 1, "progenitor2_email": 1}):
        emails.update(value for value in (player.get("email_formulario"), player.get("progenitor1_email"), player.get("progenitor2_email")) if value)
    async for family in db.families.find({"id": {"$in": family_ids}}, {"_id": 0, "progenitor1_email": 1, "progenitor2_email": 1}):
        emails.update(value for value in (family.get("progenitor1_email"), family.get("progenitor2_email")) if value)
    return users, sorted(emails)


@api_router.post("/communications")
async def create_communication(comm: Communication):
    data = comm.model_dump()
    data.update({"enviado": False, "fecha_envio": None, "estado_envio": "pending", "error_envio": None})
    created = await insert_doc("communications", data)
    users, emails = await communication_targets(data)
    await enqueue_notifications(
        users, "communication.created", "Nueva comunicación / Komunikazio berria",
        str(data.get("asunto") or "Ikas-Txiki"), "/comunicacion", data.get("prioridad") or "normal",
        {"communication_id": created["id"]}, f"communication.created:{created['id']}",
    )
    logs = []
    if data.get("canal") == "email":
        if emails:
            logs = [dispatch_email(email, data.get("asunto") or "Ikas-Txiki", data.get("mensaje") or "") for email in emails]
        else:
            logs = [{"id": new_id(), "channel": "email", "recipient": None, "provider": "smtp",
                     "status": "pending", "error": "recipient_missing", "created_at": now_iso(), "sent_at": None}]
    else:
        provider = provider_configuration().get(data.get("canal"), {"configured": False, "provider": "optional"})
        logs = [{"id": new_id(), "channel": data.get("canal"), "recipient": None,
                 "provider": provider["provider"], "status": "pending",
                 "error": "provider_optional_not_activated" if provider["configured"] else "provider_not_configured",
                 "created_at": now_iso(), "sent_at": None}]
    for log in logs:
        log["communication_id"] = created["id"]
    if logs:
        await db.delivery_logs.insert_many(logs)
    state = "sent" if logs and all(log["status"] == "sent" for log in logs) else (
        "failed" if any(log["status"] == "failed" for log in logs) else "pending"
    )
    await db.communications.update_one({"id": created["id"]}, {"$set": {
        "enviado": state == "sent", "estado_envio": state,
        "fecha_envio": now_iso() if state == "sent" else None,
        "error_envio": next((log["error"] for log in logs if log.get("error")), None),
        "delivery_log_ids": [log["id"] for log in logs],
    }})
    return await get_doc("communications", created["id"])


@api_router.get("/communications")
async def get_communications():
    return await list_docs("communications")


@api_router.put("/communications/{comm_id}")
async def edit_communication(comm_id: str, comm: Communication):
    data = comm.model_dump()
    data.pop("enviado", None)
    data.pop("fecha_envio", None)
    return await update_doc("communications", comm_id, data)


@api_router.delete("/communications/{comm_id}")
async def remove_communication(comm_id: str):
    return await delete_doc("communications", comm_id)


# ================= SETTINGS / CONFIG =================
class Settings(BaseModel):
    club_nombre: Optional[str] = "Ikas-Txiki"
    club_logo: Optional[str] = None
    club_direccion: Optional[str] = None
    club_email: Optional[str] = None
    club_telefono: Optional[str] = None
    temporada_actual: Optional[str] = None
    temporadas: List[str] = []
    campos: List[str] = []
    entrenadores: List[str] = []
    cuota_base: Optional[float] = 0
    descuento_hermano: Optional[float] = 0
    attendance_alert_threshold: int = Field(default=3, ge=1, le=20)


SETTINGS_ID = "global"


@api_router.get("/settings")
async def get_settings():
    doc = await db.settings.find_one({"id": SETTINGS_ID}, {"_id": 0})
    if not doc:
        default = Settings().model_dump()
        default["id"] = SETTINGS_ID
        default["categories"] = CATEGORIES
        await db.settings.insert_one(dict(default))
        return clean(default)
    doc["categories"] = CATEGORIES
    return doc


@api_router.put("/settings")
async def update_settings(settings: Settings):
    data = settings.model_dump()
    data["id"] = SETTINGS_ID
    await db.settings.update_one({"id": SETTINGS_ID}, {"$set": data}, upsert=True)
    return await get_settings()


@api_router.get("/categories")
async def get_categories():
    return CATEGORIES


@api_router.get("/compute-category")
async def api_compute_category(fecha_nacimiento: str):
    return {"categoria": compute_category(fecha_nacimiento)}


# ================= DASHBOARD =================
@api_router.get("/dashboard")
async def dashboard(
    temporada: Optional[str] = None,
    categoria: Optional[str] = None,
    equipo_id: Optional[str] = None,
):
    user = current_user_context.get() or {}
    role = user.get("role", "player")

    async def permitted_docs(collection: str, resource: str):
        return await list_docs(collection) if has_permission(user, resource, "read") else []

    all_teams = await permitted_docs("teams", "teams")
    allowed_team_ids = {team.get("id") for team in all_teams if team.get("id")}
    if equipo_id and equipo_id not in allowed_team_ids:
        raise HTTPException(status_code=403, detail="El equipo solicitado no pertenece a tu ámbito")
    if categoria and role != "admin" and not any(team.get("categoria") == categoria for team in all_teams):
        raise HTTPException(status_code=403, detail="La categoría solicitada no pertenece a tu ámbito")
    allowed_seasons = {team.get("temporada") for team in all_teams if team.get("temporada")}
    if temporada and role != "admin" and allowed_seasons and temporada not in allowed_seasons:
        raise HTTPException(status_code=403, detail="La temporada solicitada no pertenece a tu ámbito")

    teams = [
        team for team in all_teams
        if (not equipo_id or team.get("id") == equipo_id)
        and (not categoria or team.get("categoria") == categoria)
        and (not temporada or team.get("temporada") == temporada)
    ]
    selected_team_ids = {team.get("id") for team in teams if team.get("id")}
    team_names = {team["id"]: team.get("nombre", "—") for team in teams}

    players = [
        player for player in await permitted_docs("players", "players")
        if (not selected_team_ids or player.get("equipo_id") in selected_team_ids)
        and (not categoria or player.get("categoria") == categoria)
    ] if (teams or not any((equipo_id, categoria, temporada))) else []
    selected_player_ids = {player.get("id") for player in players if player.get("id")}

    matches = [
        match for match in await permitted_docs("matches", "matches")
        if (not selected_team_ids or match.get("equipo_id") in selected_team_ids)
        and (not temporada or match.get("temporada") == temporada)
    ] if (teams or not any((equipo_id, categoria, temporada))) else []
    trainings = [
        training for training in await permitted_docs("trainings", "trainings")
        if not selected_team_ids or training.get("equipo_id") in selected_team_ids
    ] if (teams or not any((equipo_id, categoria, temporada))) else []
    club_events = [
        event for event in await permitted_docs("club_events", "calendar")
        if (not selected_team_ids or not event.get("equipo_id") or event.get("equipo_id") in selected_team_ids)
        and (not temporada or not event.get("temporada") or event.get("temporada") == temporada)
        and (not categoria or not event.get("categoria") or event.get("categoria") == categoria)
    ] if (teams or not any((equipo_id, categoria, temporada))) else []
    callups = [
        callup for callup in await permitted_docs("callups", "callups")
        if not selected_team_ids or callup.get("equipo_id") in selected_team_ids
    ] if (teams or not any((equipo_id, categoria, temporada))) else []

    payments = [
        payment for payment in await permitted_docs("payments", "payments")
        if not selected_player_ids or payment.get("player_id") in selected_player_ids
    ] if players else []
    auths = [
        authorization for authorization in await permitted_docs("authorizations", "authorizations")
        if not selected_player_ids or authorization.get("player_id") in selected_player_ids
    ] if players else []
    all_inscriptions = await permitted_docs("inscriptions", "inscriptions")
    inscriptions = all_inscriptions if role == "admin" and not any((equipo_id, categoria, temporada)) else [
        inscription for inscription in all_inscriptions
        if inscription.get("player_id") in selected_player_ids
    ]
    communications = await permitted_docs("communications", "communications")
    communication_targets = selected_player_ids | set(ids([user.get("family_id"), user.get("player_id")]))
    if role != "admin" or any((equipo_id, categoria, temporada)):
        communications = [
            communication for communication in communications
            if (
                communication.get("destinatario_tipo") == "equipo"
                and communication.get("destinatario_id") in selected_team_ids
            ) or (
                communication.get("destinatario_tipo") == "individual"
                and communication.get("destinatario_id") in communication_targets
            ) or (
                role == "admin" and communication.get("destinatario_tipo") == "categoria"
                and (not categoria or communication.get("destinatario_id") == categoria)
            )
        ]

    activos = [p for p in players if p.get("estado") == "activo"]
    pendientes_doc = [p for p in players if p.get("estado_documental") != "completo"]
    nuevas_inscripciones = [p for p in players if p.get("nueva_incorporacion")]
    inscripciones_pendientes = [p for p in players if p.get("estado") in ("pendiente_documentacion", "en_prueba")]
    pagos_pendientes = [p for p in payments if p.get("estado") in ("pendiente", "parcial")]
    auth_pendientes = [a for a in auths if a.get("estado") == "pendiente"]

    today = date.today().isoformat()
    proximos_partidos = sorted(
        [m for m in matches if m.get("fecha") and m.get("fecha") >= today and m.get("estado") == "programado"],
        key=lambda m: (m.get("fecha"), m.get("hora") or "")
    )[:5]
    for m in proximos_partidos:
        m["equipo_nombre"] = team_names.get(m.get("equipo_id"), "—")

    proximos_entrenamientos = sorted(
        [tr for tr in trainings if tr.get("fecha") and tr.get("fecha") >= today],
        key=lambda tr: (tr.get("fecha"), tr.get("hora") or "")
    )[:5]
    for tr in proximos_entrenamientos:
        tr["equipo_nombre"] = team_names.get(tr.get("equipo_id"), "—")

    insc_pendientes = [i for i in inscriptions if i.get("estado") in ("recibida", "pendiente", "revisada")]
    nuevas_insc = [i for i in inscriptions if i.get("tipo") == "alta" and not i.get("player_id")]

    pending_communications = [communication for communication in communications if not communication.get("enviado")]
    failed_communications = [
        communication for communication in communications
        if communication.get("estado") == "error" or communication.get("error_envio")
    ]
    latest_communications = sorted(
        communications,
        key=lambda communication: communication.get("fecha_envio") or communication.get("created_at") or "",
        reverse=True,
    )[:5]
    attendance = weekly_attendance(trainings, selected_player_ids or None)
    attendance_detail = attendance_summary(trainings, selected_player_ids or None)
    attendance_settings = await db.settings.find_one({"id": SETTINGS_ID}, {"_id": 0, "attendance_alert_threshold": 1}) or {}
    attendance_alerts = repeated_absence_alerts(
        trainings, attendance_settings.get("attendance_alert_threshold", 3), selected_player_ids or None,
    )
    scoped_callup_players = selected_player_ids if role in {"family", "player"} else None
    callup_pending = pending_callups(callups, scoped_callup_players)
    callup_status = player_callup_status(callups, selected_player_ids) if role in {"family", "player"} else []
    calendar_events = aggregate_calendar_events(matches, trainings, club_events, teams)
    next_event = next_calendar_event(calendar_events)
    if next_event:
        next_event = {**next_event, "fecha_hora": f"{next_event['fecha']}T{next_event.get('hora') or '00:00'}:00+00:00"}
    incidents = [
        {"tipo": kind, "id": item.get("id"), "equipo_id": item.get("equipo_id"), "mensaje": item.get("observaciones")}
        for kind, rows in (("partido", matches), ("entrenamiento", trainings))
        for item in rows if item.get("observaciones")
    ][:5]

    alertas = []
    if failed_communications:
        alertas.append({"tipo": "error_comunicacion", "mensaje": f"{len(failed_communications)} comunicaciones fallidas"})
    if callup_pending["total"]:
        alertas.append({"tipo": "convocatoria", "mensaje": f"{callup_pending['total']} convocatorias pendientes de respuesta"})
    if pagos_pendientes:
        alertas.append({"tipo": "pago", "mensaje": f"{len(pagos_pendientes)} pagos pendientes"})
    if pendientes_doc:
        alertas.append({"tipo": "doc", "mensaje": f"{len(pendientes_doc)} jugadores con documentación incompleta"})
    if auth_pendientes:
        alertas.append({"tipo": "auth", "mensaje": f"{len(auth_pendientes)} autorizaciones pendientes de firma"})
    if insc_pendientes:
        alertas.append({"tipo": "inscripcion", "mensaje": f"{len(insc_pendientes)} inscripciones por revisar"})

    if pending_communications:
        alertas.append({"tipo": "comunicacion", "mensaje": f"{len(pending_communications)} comunicaciones pendientes"})
    if attendance_alerts:
        alertas.append({"tipo": "asistencia", "mensaje": f"{len(attendance_alerts)} alertas de asistencia"})

    available = [player for player in players if player.get("estado") == "activo"]
    absent = [player for player in players if player.get("estado") in {"lesionado", "baja"}]
    children = [
        {
            "id": player.get("id"), "nombre": player.get("nombre"),
            "apellidos": player.get("apellidos"), "equipo_id": player.get("equipo_id"),
            "categoria": player.get("categoria"), "estado": player.get("estado"),
        }
        for player in players
    ] if role == "family" else []

    return {
        "role": role,
        "scope": {"team_ids": sorted(selected_team_ids), "player_ids": sorted(selected_player_ids)},
        "filters": {"temporada": temporada, "categoria": categoria, "equipo_id": equipo_id},
        "filter_options": {
            "temporadas": sorted({team.get("temporada") for team in all_teams if team.get("temporada")}),
            "categorias": sorted({team.get("categoria") for team in all_teams if team.get("categoria")}),
            "equipos": [
                {"id": team.get("id"), "nombre": team.get("nombre"), "categoria": team.get("categoria"), "temporada": team.get("temporada")}
                for team in all_teams
            ],
        },
        "jugadores_activos": len(activos),
        "total_jugadores": len(players),
        "nuevas_inscripciones": len(nuevas_insc),
        "inscripciones_pendientes": len(insc_pendientes),
        "documentacion_pendiente": len(pendientes_doc),
        "pagos_pendientes": len(pagos_pendientes),
        "importe_pendiente": round(sum((p.get("importe_final") or 0) for p in pagos_pendientes), 2),
        "autorizaciones_pendientes": len(auth_pendientes),
        "proximos_partidos": proximos_partidos,
        "proximos_entrenamientos": proximos_entrenamientos,
        "siguiente_actividad": next_event,
        "ultimas_comunicaciones": latest_communications,
        "comunicaciones_pendientes": len(pending_communications),
        "comunicaciones_fallidas": len(failed_communications),
        "asistencia_semanal": attendance,
        "asistencia_resumen": attendance_detail,
        "alertas_asistencia": attendance_alerts,
        "convocatorias_pendientes": callup_pending,
        "estado_convocatorias": callup_status,
        "jugadores_disponibles": len(available),
        "jugadores_ausentes": len(absent),
        "hijos": children,
        "incidencias": incidents,
        "alertas": prioritized_alerts(alertas),
    }


@api_router.get("/search")
async def global_search(q: str):
    import unicodedata

    def _norm(s):
        s = str(s or "").lower()
        return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")

    ql = _norm(q).strip()
    if not ql or len(ql) < 1:
        return []
    results = []

    teams = {t["id"]: t.get("nombre", "—") for t in await list_docs("teams")}

    players = await list_docs("players")
    for p in players:
        hay = _norm(f"{p.get('nombre','')} {p.get('apellidos','')} {p.get('dorsal','')} {p.get('posicion','')} {p.get('categoria','')} {p.get('numero_licencia','')} {p.get('progenitor1_telefono','')} {p.get('progenitor1_nombre','')} {p.get('email_formulario','')}")
        if ql in hay:
            results.append({"type": "player", "id": p["id"],
                            "title": f"{p.get('nombre','')} {p.get('apellidos','')}".strip(),
                            "subtitle": f"{p.get('categoria') or '—'} · {teams.get(p.get('equipo_id'), 'Sin equipo')}",
                            "route": "/jugadores"})

    for t in await list_docs("teams"):
        hay = _norm(f"{t.get('nombre','')} {t.get('categoria','')} {t.get('entrenador','')} {t.get('campo','')}")
        if ql in hay:
            results.append({"type": "team", "id": t["id"], "title": t.get("nombre", "—"),
                            "subtitle": f"{t.get('categoria') or '—'} · {t.get('entrenador') or ''}", "route": "/equipos"})

    for m in await list_docs("matches"):
        hay = _norm(f"{m.get('rival','')} {teams.get(m.get('equipo_id'),'')} {m.get('tipo','')} {m.get('jornada','')} {m.get('fecha','')}")
        if ql in hay:
            results.append({"type": "match", "id": m["id"],
                            "title": f"{teams.get(m.get('equipo_id'),'—')} vs {m.get('rival') or '—'}",
                            "subtitle": f"{m.get('fecha') or ''} · {m.get('hora') or ''}", "route": "/partidos"})

    for f in await list_docs("families"):
        hay = _norm(f"{f.get('progenitor1_nombre','')} {f.get('progenitor2_nombre','')} {f.get('progenitor1_telefono','')} {f.get('progenitor1_email','')} {f.get('contacto_principal','')} {f.get('domicilio','')}")
        if ql in hay:
            results.append({"type": "family", "id": f["id"],
                            "title": f.get("progenitor1_nombre") or f.get("contacto_principal") or "Familia",
                            "subtitle": f.get("progenitor1_telefono") or f.get("domicilio") or "", "route": "/familias"})

    for i in await list_docs("inscriptions"):
        hay = _norm(f"{i.get('nombre','')} {i.get('apellidos','')} {i.get('progenitor1_telefono','')} {i.get('email_formulario','')}")
        if ql in hay:
            results.append({"type": "inscription", "id": i["id"],
                            "title": f"{i.get('nombre','')} {i.get('apellidos','')}".strip(),
                            "subtitle": f"{i.get('estado','')} · {i.get('categoria') or ''}", "route": "/inscripciones"})

    player_names = {p["id"]: f"{p.get('nombre','')} {p.get('apellidos','')}".strip() for p in players}
    for pay in await list_docs("payments"):
        pname = player_names.get(pay.get("player_id"), "")
        hay = _norm(f"{pname} {pay.get('concepto','')} {pay.get('estado','')} {pay.get('forma_pago','')}")
        if ql in hay:
            results.append({"type": "payment", "id": pay["id"],
                            "title": pname or pay.get("concepto", "Pago"),
                            "subtitle": f"{pay.get('importe_final',0)} € · {pay.get('estado','')}", "route": "/pagos"})

    return results[:40]


@api_router.get("/")
async def root():
    return {"message": "Ikas-Txiki Manager API"}


# ================= DEMO SEED / CLEAR =================
ALL_COLLECTIONS = ["players", "families", "teams", "matches", "callups", "payments",
                   "authorizations", "inscriptions", "trainings", "stats", "communications"]


@api_router.post("/clear-all")
async def clear_all():
    for c in ALL_COLLECTIONS:
        await db[c].delete_many({})
    return {"ok": True}


@api_router.post("/seed-demo")
async def seed_demo():
    # wipe first to keep idempotent
    for c in ALL_COLLECTIONS:
        await db[c].delete_many({})

    from datetime import timedelta
    today = date.today()

    # Settings
    await db.settings.update_one({"id": SETTINGS_ID}, {"$set": {
        "id": SETTINGS_ID, "club_nombre": "Ikas-Txiki Futbol Eskola",
        "club_direccion": "Kiroldegia, Donostia", "club_email": "info@ikastxiki.eus",
        "club_telefono": "943 000 000", "temporada_actual": "2025-2026",
        "temporadas": ["2024-2025", "2025-2026"], "campos": ["Campo Municipal", "Anoeta B", "Pista cubierta"],
        "entrenadores": ["Mikel Agirre", "Jon Etxeberria", "Ane Garmendia"],
        "cuota_base": 180, "descuento_hermano": 30,
    }}, upsert=True)

    # Teams
    teams_def = [
        {"nombre": "Benjamín A", "categoria": "Benjamín", "entrenador": "Mikel Agirre", "horario": "L-X 17:30", "campo": "Campo Municipal"},
        {"nombre": "Alevín A", "categoria": "Alevín", "entrenador": "Jon Etxeberria", "horario": "M-J 18:00", "campo": "Anoeta B"},
        {"nombre": "Infantil A", "categoria": "Infantil", "entrenador": "Ane Garmendia", "horario": "M-J 19:00", "campo": "Campo Municipal"},
    ]
    teams = []
    for td in teams_def:
        t = await insert_doc("teams", Team(temporada="2025-2026", estado="activo", **td).model_dump())
        teams.append(t)

    # Families + Players
    players_def = [
        ("Unai", "Goikoetxea", "2016-03-12", 0, "Delantero", "9", "activo", "600111001", "unai.fam@mail.eus", "Calle Mayor 1"),
        ("Ane", "Lizarraga", "2016-07-05", 0, "Centrocampista", "8", "activo", "600111002", "ane.fam@mail.eus", "Av. Libertad 3"),
        ("Iker", "Mendizabal", "2015-11-20", 0, "Portero", "1", "lesionado", "600111003", "iker.fam@mail.eus", "Calle Río 5"),
        ("Maddi", "Sarriegi", "2014-02-18", 1, "Defensa", "4", "activo", "600111004", "maddi.fam@mail.eus", "Plaza Nueva 7"),
        ("Julen", "Aranburu", "2014-09-30", 1, "Delantero", "11", "activo", "600111005", "julen.fam@mail.eus", "Calle Sol 9"),
        ("Nora", "Etxeberria", "2013-05-14", 2, "Centrocampista", "10", "activo", "600111006", "nora.fam@mail.eus", "Av. Mar 2"),
        ("Aitor", "Goikoetxea", "2013-12-01", 2, "Defensa", "3", "pendiente_documentacion", "600111001", "unai.fam@mail.eus", "Calle Mayor 1"),
        ("Leire", "Otaegi", "2015-08-22", 0, "Delantera", "7", "en_prueba", "600111008", "leire.fam@mail.eus", "Calle Norte 4"),
    ]
    players = []
    for (nombre, ape, fnac, tidx, pos, dorsal, estado, tel, email, dom) in players_def:
        pdata = Player(
            nombre=nombre, apellidos=ape, fecha_nacimiento=fnac, equipo_id=teams[tidx]["id"],
            posicion=pos, dorsal=dorsal, estado=estado, progenitor1_telefono=tel,
            progenitor1_email=email, progenitor1_nombre=f"Familia {ape}", domicilio=dom,
            estado_documental="completo" if estado == "activo" else "pendiente",
            fecha_alta=str(today - timedelta(days=120)),
        ).model_dump()
        pdata["categoria"] = compute_category(fnac)
        p = await insert_doc("players", pdata)
        players.append(p)

    # Families
    for ape, tel, email, dom in [("Goikoetxea", "600111001", "unai.fam@mail.eus", "Calle Mayor 1"),
                                  ("Etxeberria", "600111006", "nora.fam@mail.eus", "Av. Mar 2")]:
        await insert_doc("families", Family(progenitor1_nombre=f"Familia {ape}", progenitor1_telefono=tel,
                                             progenitor1_email=email, domicilio=dom, contacto_principal=f"Familia {ape}",
                                             preferencia_comunicacion="whatsapp").model_dump())

    # Matches
    matches_def = [
        (teams[0]["id"], "C.D. Antiguoko", str(today + timedelta(days=3)), "10:00", "local", "liga", "programado", None, None, "1"),
        (teams[1]["id"], "Easo S.D.", str(today + timedelta(days=5)), "11:30", "visitante", "liga", "programado", None, None, "2"),
        (teams[2]["id"], "Real Sociedad B", str(today - timedelta(days=4)), "12:00", "local", "liga", "jugado", 3, 1, "1"),
    ]
    matches = []
    for (eid, rival, fecha, hora, cond, tipo, estado, rp, rr, jor) in matches_def:
        m = await insert_doc("matches", Match(equipo_id=eid, rival=rival, fecha=fecha, hora=hora, condicion=cond,
                                               tipo=tipo, estado=estado, resultado_propio=rp, resultado_rival=rr,
                                               jornada=jor, temporada="2025-2026", campo="Campo Municipal").model_dump())
        matches.append(m)

    # Trainings
    t0_players = [p for p in players if p["equipo_id"] == teams[0]["id"]]
    await insert_doc("trainings", Training(
        equipo_id=teams[0]["id"], campo="Campo Municipal", fecha=str(today + timedelta(days=1)), hora="17:30",
        asistencia=[{"player_id": p["id"], "estado": "presente"} for p in t0_players],
        ejercicios="Rondos + tiro a puerta").model_dump())
    t1_players = [p for p in players if p["equipo_id"] == teams[1]["id"]]
    await insert_doc("trainings", Training(
        equipo_id=teams[1]["id"], campo="Anoeta B", fecha=str(today - timedelta(days=2)), hora="18:00",
        asistencia=[{"player_id": p["id"], "estado": "presente" if i % 2 == 0 else "justificada"} for i, p in enumerate(t1_players)],
        ejercicios="Pase y control").model_dump())

    # Callup for first match
    await insert_doc("callups", Callup(
        match_id=matches[0]["id"], equipo_id=teams[0]["id"],
        convocados=[{"player_id": p["id"], "estado": "confirmado"} for p in t0_players],
        hora_quedada="09:15", lugar_quedada="Vestuarios Campo Municipal",
        material="Botas + agua", mensaje_familias="Convocatoria para el partido del fin de semana.").model_dump())

    # Payments
    for i, p in enumerate(players[:5]):
        estado = ["pagado", "pendiente", "pagado", "parcial", "pendiente"][i]
        await insert_doc("payments", Payment(player_id=p["id"], concepto="Cuota temporada", importe_base=180,
                                              descuento_hermano=30 if i in (3, 4) else 0, estado=estado,
                                              forma_pago="domiciliacion").model_dump())

    # Authorizations
    for i, p in enumerate(players[:4]):
        await insert_doc("authorizations", Authorization(player_id=p["id"], tipo=["general", "imagen", "medica", "desplazamientos"][i],
                                                          firmante=f"Familia {p['apellidos']}", estado="firmada" if i < 2 else "pendiente",
                                                          fecha_firma=str(today - timedelta(days=30)) if i < 2 else None).model_dump())

    # Inscriptions (pending)
    for nombre, ape, fnac, tel in [("Oihan", "Beristain", "2017-04-10", "600222001"),
                                    ("Irati", "Zubizarreta", "2016-10-02", "600222002")]:
        idata = Inscription(nombre=nombre, apellidos=ape, fecha_nacimiento=fnac, progenitor1_telefono=tel,
                            progenitor1_nombre=f"Familia {ape}", estado="recibida", tipo="alta").model_dump()
        idata["categoria"] = compute_category(fnac)
        await insert_doc("inscriptions", idata)

    # Stats
    for p in [players[5], players[0]]:
        await insert_doc("stats", PlayerStats(player_id=p["id"], temporada="2025-2026", partidos_convocado=8,
                                               partidos_jugados=7, minutos=420, goles=5, asistencias=3,
                                               amarillas=1, valoracion=8, posicion=p["posicion"]).model_dump())

    # Communications
    await insert_doc("communications", Communication(destinatario_tipo="equipo", destinatario_id=teams[0]["id"],
                                                      destinatario_nombre=teams[0]["nombre"], canal="whatsapp",
                                                      asunto="Entrenamiento del lunes", mensaje="Recordad traer botas de tacos.",
                                                      enviado=True, fecha_envio=now_iso()).model_dump())

    return {"ok": True, "teams": len(teams), "players": len(players), "matches": len(matches)}



# ================= EQUIPMENT =================

@api_router.get("/equipment")
async def get_equipment(equipo_id: Optional[str] = None, entregada: Optional[str] = None):
    """Devuelve todos los jugadores con sus datos de equipación."""
    query: Dict[str, Any] = {}
    if equipo_id:
        query["equipo_id"] = equipo_id
    if entregada is not None:
        query["equipacion_entregada"] = (entregada.lower() == "true")
    players = await list_docs("players", query)
    teams = {t["id"]: t["nombre"] for t in await list_docs("teams")}
    result = []
    for p in players:
        result.append({
            "id": p["id"],
            "nombre": p.get("nombre", ""),
            "apellidos": p.get("apellidos", ""),
            "categoria": p.get("categoria"),
            "equipo_id": p.get("equipo_id"),
            "equipo_nombre": teams.get(p.get("equipo_id"), "—"),
            "dorsal": p.get("dorsal"),
            "talla_camiseta": p.get("talla_camiseta"),
            "talla_pantalon": p.get("talla_pantalon"),
            "talla_chandal": p.get("talla_chandal"),
            "talla_medias": p.get("talla_medias"),
            "talla_calzado": p.get("talla_calzado"),
            "equipacion_entregada": p.get("equipacion_entregada", False),
            "fecha_entrega_equipacion": p.get("fecha_entrega_equipacion"),
            "observaciones_material": p.get("observaciones_material"),
            "estado": p.get("estado"),
        })
    return result


@api_router.put("/equipment/{player_id}")
async def update_equipment(player_id: str, data: Dict[str, Any]):
    """Actualiza solo los campos de equipación de un jugador."""
    allowed = {
        "dorsal", "talla_camiseta", "talla_pantalon", "talla_chandal",
        "talla_medias", "talla_calzado", "equipacion_entregada",
        "fecha_entrega_equipacion", "observaciones_material"
    }
    update = {k: v for k, v in data.items() if k in allowed}
    return await update_doc("players", player_id, update)


# ================= EXCEL IMPORT / EXPORT =================
EXPORT_COLLECTIONS = ALL_COLLECTIONS + ["settings"]


def _flatten_for_excel(doc: dict) -> dict:
    out = {}
    for k, v in doc.items():
        if k == "_id":
            continue
        if isinstance(v, (list, dict)):
            out[k] = json.dumps(v, ensure_ascii=False)
        else:
            out[k] = v
    return out


def _unflatten_from_excel(row: dict) -> dict:
    out = {}
    for k, v in row.items():
        if v is None:
            continue
        if isinstance(v, float) and math.isnan(v):
            continue
        if isinstance(v, str):
            s = v.strip()
            if s == "":
                continue
            if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
                try:
                    out[k] = json.loads(s)
                    continue
                except Exception:
                    pass
            out[k] = v
        else:
            out[k] = v
    return out


@api_router.get("/export-excel")
async def export_excel():
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        wrote_any = False
        for coll in EXPORT_COLLECTIONS:
            docs = await db[coll].find({}, {"_id": 0}).to_list(10000)
            rows = [_flatten_for_excel(d) for d in docs]
            df = pd.DataFrame(rows)
            df.to_excel(writer, sheet_name=coll[:31], index=False)
            wrote_any = True
        if not wrote_any:
            pd.DataFrame().to_excel(writer, sheet_name="empty", index=False)
    buffer.seek(0)
    fname = f"ikastxiki_backup_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@api_router.post("/import-excel")
async def import_excel(file: UploadFile = File(...)):
    content = await file.read()
    try:
        sheets = pd.read_excel(io.BytesIO(content), sheet_name=None)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"No se pudo leer el archivo Excel: {e}")

    summary = {}
    for coll, df in sheets.items():
        if coll not in EXPORT_COLLECTIONS:
            continue
        records = df.to_dict(orient="records")
        cleaned = [_unflatten_from_excel(r) for r in records]
        cleaned = [c for c in cleaned if c]
        if coll == "settings":
            for c in cleaned:
                c["id"] = SETTINGS_ID
                await db.settings.update_one({"id": SETTINGS_ID}, {"$set": c}, upsert=True)
            summary[coll] = len(cleaned)
            continue
        await db[coll].delete_many({})
        for c in cleaned:
            if not c.get("id"):
                c["id"] = new_id()
            c.setdefault("created_at", now_iso())
            c["updated_at"] = now_iso()
        if cleaned:
            await db[coll].insert_many(cleaned)
        summary[coll] = len(cleaned)
    return {"ok": True, "imported": summary}


app.include_router(api_router, dependencies=[Depends(authorize_request)])

cors_origins = os.environ.get('CORS_ORIGINS', 'https://ikasfutbase.cibermedida.es').split(',')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
