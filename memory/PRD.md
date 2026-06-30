# Ikas-Txiki Manager — PRD

## Problema original
App web profesional para gestionar una escuela de fútbol base juvenil (Ikas-Txiki): alta de niños, equipos, partidos, convocatorias, autorizaciones y pagos. Operativa, visual, bilingüe ES/EU, responsive.

## Decisiones del usuario
- Sin login (acceso directo al panel).
- Módulos núcleo MVP: Panel, Jugadores, Familias, Equipos, Partidos, Convocatorias, Pagos + Autorizaciones (PDF imprimible).
- Idioma: castellano + euskera (toggle).
- Sin datos demo (vacío para uso real).

## Arquitectura
- Backend: FastAPI + MongoDB (motor), rutas con prefijo `/api`, ids uuid string. `server.py` con CRUD de players, families, teams, matches, callups, payments, authorizations, settings + endpoints dashboard, categories, compute-category.
- Frontend: React + react-router + shadcn/ui + Tailwind. i18n propio (ES/EU) en `i18n.js`. Sidebar navy, fuentes Outfit/Manrope, azul cielo deportivo.

## Implementado (29 jun 2026)
- **Fase 1**: Panel, Jugadores (ficha por pestañas + categoría automática + foto + salud/equipación/documentación), Familias, Equipos, Partidos, Convocatorias, Cuotas/Pagos, Autorizaciones (PDF imprimible), Configuración. Bilingüe ES/EU.
- **Fase 2** (módulos que faltaban): **Inscripciones** (alta/renovación, detección de hermanos, crear ficha de jugador desde inscripción, estados), **Entrenamientos** (asistencia por jugador: presente/justificada/injustificada/lesión, ejercicios), **Estadísticas deportivas** (por jugador/temporada), **Comunicación** (avisos por equipo/categoría/individual, email/WhatsApp, historial), **Informes/Listados** (6 informes con filtros + exportación CSV/Excel + impresión PDF). Panel ampliado con próximos entrenamientos e inscripciones pendientes.
- Validado: 49/49 tests backend + flujos frontend al 100%.

## Backlog (siguientes fases)
- P1: Vinculación automática completa de hermanos (familia_id auto + descuento auto al dar de alta segundo hijo).
- P2: Usuarios y permisos / login por roles. Confirmación de lectura real en Comunicación (envío email/WhatsApp real vía integración).
- P3: Pulido a11y (DialogDescription) y date pickers shadcn en lugar de inputs nativos.

## Próximas acciones

## Fase 3 (29 jun 2026)
- **Datos de ejemplo**: botón "Cargar datos de ejemplo" en Configuración (POST /api/seed-demo) crea 3 equipos, 8 jugadores, partidos, entrenamientos, convocatoria, pagos, autorizaciones, inscripciones, estadísticas y un aviso. Botón "Vaciar todo" (POST /api/clear-all).
- **Importar/Exportar base de datos en Excel**: GET /api/export-excel (xlsx con una hoja por módulo + settings), POST /api/import-excel (reemplaza datos desde xlsx). Campos lista/dict se serializan a JSON en celdas. Round-trip verificado. Botones en Configuración → "Datos y base de datos". Requiere openpyxl (en requirements.txt).
