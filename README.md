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
- **Acceso seguro** mediante cookie HttpOnly, protección frente a intentos repetidos y rutas privadas.
- **Navegación adaptativa**: menú agrupado en escritorio y accesos principales en la parte inferior del móvil.
- **Interfaz accesible** con foco visible, controles táctiles amplios, movimiento reducido y mensajes de error claros.
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
.
├── backend/
│   ├── server.py             # API FastAPI, rutas con prefijo /api
│   ├── requirements.txt
│   ├── .env.example          # Plantilla de variables, sin secretos reales
│   └── templates/            # Plantillas funcionales de importación
├── frontend/
│   ├── src/
│   │   ├── App.js
│   │   ├── api.js            # Cliente axios: usa REACT_APP_BACKEND_URL o /api
│   │   ├── i18n.js
│   │   ├── components/
│   │   └── pages/
│   ├── public/               # PWA, iconos y manifest
│   ├── package.json
│   └── .env.example          # Plantilla de configuración frontend
├── deploy.sh                 # Despliegue actual en VPS
├── .gitignore
└── README.md
```

---

## 🚀 Puesta en marcha

### Desarrollo local

```bash
# Backend
cd backend
cp .env.example .env
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001

# Frontend
cd ../frontend
cp .env.example .env
yarn install
yarn start
```

- Frontend interno: `http://localhost:3000`
- Backend interno: `http://localhost:8001`

### Producción actual en VPS

El despliegue actual se realiza con `deploy.sh` en el servidor. El script:

1. actualiza `main` desde GitHub;
2. instala dependencias del frontend;
3. construye el frontend;
4. reinicia el backend;
5. recarga Apache.

```bash
cd /var/www/ikastxiki
sudo bash deploy.sh
```

No migres a otro proveedor sin planificar antes variables, dominio, CORS, MongoDB y almacenamiento de archivos subidos.

---

## 🔐 Variables de entorno

Nunca subas archivos `.env` reales a GitHub. Usa `.env.example` como plantilla y configura los valores reales solo en tu equipo, VPS o proveedor de despliegue.

`backend/.env`
```
MONGO_URL=...                 # Conexión a MongoDB
DB_NAME=...                   # Nombre de la base de datos
CORS_ORIGINS=...              # Orígenes permitidos, separados por comas
JWT_SECRET=...                # Clave aleatoria de al menos 32 caracteres
ADMIN_USER=...                # Usuario administrador inicial
ADMIN_PASSWORD=...            # Contraseña segura; nunca debe ser "admin"
SMTP_HOST=...                 # Opcional: servidor SMTP
SMTP_FROM=...                 # Opcional: remitente de correo
SMTP_USER=...                 # Opcional
SMTP_PASSWORD=...             # Opcional
```

`frontend/.env`
```
REACT_APP_BACKEND_URL=http://localhost:8001
```

En producción con Apache sirviendo frontend y API bajo el mismo dominio, `REACT_APP_BACKEND_URL` puede quedar vacío para usar `/api`.

### Seguridad antes de publicar en GitHub

- Mantén el repositorio **privado**.
- No subas `.env`, Excel privados, backups, bases de datos, exportaciones ni archivos de `uploads`.
- Si alguna clave real estuvo hardcodeada o subida alguna vez, rótala antes de considerar el repositorio seguro.
- Revisa `git status` antes de cada commit.
- La plantilla versionada `backend/templates/plantilla_inscripciones_2026-2027.xlsx` es funcional; no contiene una base de datos real.

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
| Datos | `POST /api/seed-demo`, `POST /api/clear-all`, `GET /api/export-excel`, `GET /api/export-csv`, `POST /api/import-excel` |

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

**¿Necesito usuario y contraseña?** Sí. Todas las rutas de gestión están protegidas y la sesión se mantiene mediante una cookie HttpOnly durante 8 horas.

---

_Ikas-Txiki Manager · Gestión de fútbol base, sencilla y sin estrés._
