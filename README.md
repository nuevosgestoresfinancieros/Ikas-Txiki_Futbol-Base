# ⚽ Ikas-Txiki - Futbol Base

Aplicación web integral para la **gestión de una escuela de fútbol base juvenil**. Permite dar de alta jugadores, gestionar familias, equipos, partidos, convocatorias, entrenamientos, pagos, autorizaciones y mucho más, desde un panel visual, rápido y fácil de usar en **móvil, tablet y ordenador**.

> Interfaz **bilingüe castellano / euskera**, diseño colorido e interactivo, buscador global y exportación/importación de datos en Excel.

---

## 📑 Índice
- [Características principales](#-características-principales)
- [Módulos](#-módulos)
- [Tecnologías](#-tecnologías)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Puesta en marcha](#-puesta-en-marcha)
- [Variables de entorno](#-variables-de-entorno)
- [Datos de ejemplo y copias de seguridad](#-datos-de-ejemplo-y-copias-de-seguridad)
- [API (endpoints principales)](#-api-endpoints-principales)
- [Guía rápida de uso](#-guía-rápida-de-uso)
- [Preguntas frecuentes](#-preguntas-frecuentes)

---

## ✨ Características principales

- **Panel principal** con tarjetas resumen (jugadores activos, inscripciones, documentación y pagos pendientes, próximos partidos y entrenamientos, alertas) y accesos rápidos.
- **Ficha de jugador completa** organizada por pestañas (Personal, Deportivo, Familia, Salud, Equipación, Documentación) con foto y **categoría automática por edad**.
- **Buscador global** disponible en todo momento (botón en el menú o atajo `Ctrl/Cmd + K`) que busca en jugadores, equipos, partidos, familias, inscripciones y pagos (insensible a acentos).
- **Pantalla de bienvenida** animada con la temática del club.
- **Bilingüe**: cambia entre castellano y euskera con un clic (se recuerda tu preferencia).
- **Diseño responsive** y colorido, pensado para usarse sin estrés desde el móvil en el campo.
- **Exportar / importar** toda la base de datos en **Excel (.xlsx)** y **datos de ejemplo** para probar.
- **Vistas imprimibles / PDF** para autorizaciones e informes.

---

## 🧩 Módulos

| Módulo | Qué permite |
|---|---|
| **Panel** | Resúmenes, alertas y accesos rápidos. |
| **Inscripciones** | Alta nueva o renovación, detección de hermanos, estados, y crear ficha de jugador desde la inscripción. |
| **Jugadores** | Ficha completa con foto, categoría automática, estado, dorsal, salud, equipación y documentación. Búsqueda y filtros. |
| **Familias** | Datos de contacto, preferencia de comunicación e hijos vinculados. |
| **Equipos** | Categoría, temporada, entrenadores, horarios, campo y plantilla. |
| **Entrenamientos** | Fecha/hora/campo y **control de asistencia** por jugador (presente, justificada, injustificada, lesión). |
| **Partidos** | Jornada, rival, local/visitante, tipo, estado y resultado. |
| **Convocatorias** | Convocar jugadores para un partido y confirmar asistencia. |
| **Estadísticas** | Goles, asistencias, minutos, tarjetas, valoración… por jugador y temporada. |
| **Cuotas y pagos** | Importe base, descuento por hermano, importe final automático, forma de pago y estado. |
| **Autorizaciones** | Plantillas (imagen, médica, desplazamientos, recogida, protección de datos…) con **vista imprimible/PDF**. |
| **Comunicación** | Avisos por equipo/categoría/individuales con historial. |
| **Informes** | Listados filtrables con **exportación a Excel/CSV** e impresión. |
| **Configuración** | Datos y logo del club, temporadas, campos, entrenadores, cuotas, categorías y gestión de la base de datos (Excel, demo, vaciar). |

---

## 🛠 Tecnologías

- **Frontend:** React, React Router, Tailwind CSS, shadcn/ui, lucide-react, Sonner (toasts). i18n propio (ES/EU).
- **Backend:** FastAPI (Python), Motor (MongoDB asíncrono), Pandas + openpyxl (Excel).
- **Base de datos:** MongoDB.
- **Gestor de paquetes frontend:** Yarn.

---

## 📁 Estructura del proyecto

```
/app
├── backend/
│   ├── server.py          # API FastAPI (todas las rutas con prefijo /api)
│   ├── requirements.txt
│   └── .env               # MONGO_URL, DB_NAME, CORS_ORIGINS
├── frontend/
│   ├── src/
│   │   ├── App.js         # Rutas + SplashScreen
│   │   ├── api.js         # Cliente axios (usa REACT_APP_BACKEND_URL)
│   │   ├── i18n.js        # Traducciones ES/EU
│   │   ├── components/    # Layout, GlobalSearch, SplashScreen, form, shared, ui/
│   │   └── pages/         # Dashboard, Players, Teams, Matches, ... Settings
│   ├── package.json
│   └── .env               # REACT_APP_BACKEND_URL
└── README.md
```

---

## 🚀 Puesta en marcha

Los servicios se gestionan con **supervisor** y se reinician solos al detectar cambios.

```bash
# Reiniciar servicios tras cambiar .env o instalar dependencias
sudo supervisorctl restart backend
sudo supervisorctl restart frontend

# Ver estado / logs
sudo supervisorctl status
tail -n 100 /var/log/supervisor/backend.*.log
tail -n 100 /var/log/supervisor/frontend.*.log
```

**Instalar dependencias** (si hace falta):

```bash
# Backend
cd /app/backend && pip install -r requirements.txt

# Frontend (SIEMPRE con yarn, nunca npm)
cd /app/frontend && yarn install
```

- Frontend interno: `http://localhost:3000`
- Backend interno: `http://0.0.0.0:8001` (las rutas externas se enrutan por `/api`)

---

## 🔐 Variables de entorno

**No modifiques las claves existentes.** Se inyectan desde el entorno.

`backend/.env`
```
MONGO_URL=...        # Conexión a MongoDB (no cambiar)
DB_NAME=...          # Nombre de la base de datos (no cambiar)
CORS_ORIGINS=*       # Orígenes permitidos
```

`frontend/.env`
```
REACT_APP_BACKEND_URL=https://<tu-app>.preview.emergentagent.com   # URL pública del backend (no cambiar)
```

> El frontend siempre llama a la API usando `REACT_APP_BACKEND_URL` + `/api`. El backend siempre usa `MONGO_URL`.

---

## 💾 Datos de ejemplo y copias de seguridad

Desde **Configuración → Datos y base de datos**:

- **Cargar datos de ejemplo**: rellena la app con equipos, jugadores, partidos, entrenamientos, etc. para probar.
- **Vaciar todo**: borra todos los registros para empezar a usarla de verdad.
- **Exportar a Excel**: descarga un `.xlsx` con una hoja por módulo (copia de seguridad).
- **Importar desde Excel**: sube un `.xlsx` (mismo formato que la exportación) para restaurar/migrar datos.

> Recomendación: tras la primera prueba, pulsa **Vaciar todo** y exporta periódicamente como copia de seguridad.

---

## 🔌 API (endpoints principales)

Todas las rutas llevan el prefijo **`/api`**.

| Recurso | Endpoints |
|---|---|
| Panel | `GET /api/dashboard` |
| Jugadores | `GET/POST /api/players`, `GET/PUT/DELETE /api/players/{id}` |
| Familias | `GET/POST /api/families`, `PUT/DELETE /api/families/{id}` |
| Equipos | `GET/POST /api/teams`, `GET/PUT/DELETE /api/teams/{id}` |
| Partidos | `GET/POST /api/matches`, `GET/PUT/DELETE /api/matches/{id}` |
| Convocatorias | `GET/POST /api/callups`, `GET/PUT/DELETE /api/callups/{id}` |
| Entrenamientos | `GET/POST /api/trainings`, `GET/PUT/DELETE /api/trainings/{id}` |
| Estadísticas | `GET/POST /api/stats`, `PUT/DELETE /api/stats/{id}` |
| Pagos | `GET/POST /api/payments`, `PUT/DELETE /api/payments/{id}` |
| Autorizaciones | `GET/POST /api/authorizations`, `PUT/DELETE /api/authorizations/{id}` |
| Inscripciones | `GET/POST /api/inscriptions`, `PUT/DELETE /api/inscriptions/{id}`, `POST /api/inscriptions/{id}/to-player` |
| Comunicación | `GET/POST /api/communications`, `PUT/DELETE /api/communications/{id}` |
| Configuración | `GET/PUT /api/settings`, `GET /api/categories` |
| Buscador | `GET /api/search?q=...` |
| Datos | `POST /api/seed-demo`, `POST /api/clear-all`, `GET /api/export-excel`, `POST /api/import-excel` |

**Ejemplo de prueba con cURL:**
```bash
API=$(grep REACT_APP_BACKEND_URL frontend/.env | cut -d '=' -f2)
curl -s "$API/api/dashboard"
curl -s "$API/api/search?q=benjamin"
```

---

## 📖 Guía rápida de uso

1. Al abrir, verás la **pantalla de bienvenida**; pulsa **Entrar** o espera unos segundos.
2. Ve a **Configuración** y rellena los **datos del club** y el **logo** (aparecerán en las autorizaciones imprimibles).
3. Crea tus **equipos** (Equipos → Nuevo equipo).
4. Da de alta **jugadores** (Jugadores → Nuevo jugador). La **categoría se calcula sola** según la fecha de nacimiento y puedes asignar equipo y dorsal.
5. Crea **partidos** y luego **convocatorias** para llamar a los jugadores.
6. Registra **entrenamientos** y pasa **asistencia**.
7. Gestiona **cuotas/pagos** y genera **autorizaciones** imprimibles.
8. Usa el **buscador global** (`Ctrl/Cmd + K`) para encontrar cualquier dato al instante.
9. Consulta **Informes** y expórtalos a Excel/PDF.

---

## ❓ Preguntas frecuentes

**¿Cómo cambio el idioma?** Con el selector **ES / EU** en la parte inferior del menú lateral.

**¿La categoría es automática?** Sí, se calcula por la fecha de nacimiento (Prebenjamín, Benjamín, Alevín, Infantil, Cadete, Juvenil).

**¿Cómo hago copia de seguridad?** Configuración → **Exportar a Excel**. Para restaurar, **Importar desde Excel**.

**¿Cómo empiezo de cero tras probar?** Configuración → **Vaciar todo**.

**¿Necesito usuario y contraseña?** En esta versión no hay inicio de sesión: se accede directamente al panel.

---

_Ikas-Txiki Manager · Gestión de fútbol base, sencilla y sin estrés._
