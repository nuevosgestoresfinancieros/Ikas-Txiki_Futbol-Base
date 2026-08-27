# Informe de preparación para producción — Ikas-Txiki

Fecha: 2026-08-27
Alcance: exclusivamente `/var/www/ikastxiki`. No se desplegó código, no se reinició ningún servicio y no se atacó producción.

## Veredicto

**NO LISTA** para un lanzamiento con objetivo de 200 usuarios concurrentes.

La funcionalidad cubierta por la suite automatizada pasa tras una corrección pequeña, pero hay bloqueadores de seguridad, capacidad y operación: dependencias frontend con vulnerabilidades altas, un único proceso Uvicorn, ausencia de cabeceras de seguridad/rate limiting en Apache y ninguna prueba de carga válida hasta 200 VU sobre un entorno aislado.

## Arquitectura observada

- Frontend React/CRA servido estáticamente por Apache; cliente Axios con `withCredentials` y timeout de 20 s.
- API FastAPI + Motor/PyMongo + MongoDB. Cookies de sesión JWT `HttpOnly`, `Secure` y `SameSite=Strict`; expiración de 8 h.
- Apache redirige HTTP a HTTPS y hace proxy de `/api` y `/uploads` hacia Uvicorn en `127.0.0.1:8003`.
- Systemd ejecuta **un único** proceso `uvicorn server:app`; no hay Gunicorn, workers, límites de recursos ni configuración de graceful shutdown.
- MongoDB escucha en `0.0.0.0:27017`; validar firewall/ACL y restringirlo a localhost o red privada si no es imprescindible la exposición.
- Migraciones son scripts manuales; no existe versionado/ejecución automática de migraciones dentro del despliegue.

## Pruebas ejecutadas

| Prueba | Resultado | Evidencia |
|---|---:|---|
| Backend completo (MongoDB temporal) | 548 passed, 12 skipped | 12.30 s; las BBDD `ikas_txiki_phase10_*` se borran al terminar |
| Backend afectado por corrección | 46 passed | 6.70 s |
| Frontend | 26 suites, 159 tests passed | 8.05 s |
| ESLint frontend | Correcto | `yarn lint` |
| Build frontend | Correcto | artefactos generados en `frontend/build` |
| Dependencias Python instaladas | Correcto | `pip check`: sin requisitos rotos |
| Compilación Python | Correcta | `compileall` |
| Mypy / Flake8 / Black | No pasa | no hay configuración de calidad; numerosos errores/formatos pendientes |

Las pruebas backend cubren autenticación, RBAC/ámbito, operaciones CRUD, errores, importación, persistencia MongoDB, seguridad y PDF. Las pruebas HTTP se ejecutaron con credenciales ficticias y bases de datos temporales, nunca contra la base productiva.

## Corrección aplicada

**Alta — PDFs de convocatorias, autorizaciones, asistencia y actas devolvían 500.**

`backend/server.py` importaba `openpyxl.worksheet.table.Table` después de `reportlab.platypus.Table`, sobrescribiendo la clase usada para PDF. Se renombró el import de OpenPyXL a `OpenpyxlTable` y se actualizó su único uso en la exportación Excel. Se ajustó una aserción de importación histórica que contradecía las migraciones 005/007: `equipment_current` corresponde a la equipación principal (`dorsal`, `talla_camiseta`), no a `segunda_equipacion`.

Resultado de regresión posterior: 548 passed, 12 skipped.

## Seguridad y dependencias

### Bloqueadores

1. **Alta: 119 vulnerabilidades frontend (88 altas, 29 moderadas, 2 bajas)** según `yarn audit --groups dependencies` (1.490 paquetes). Afectan, entre otras, a React Router 7.15.0 (parches >=7.18.2) y Axios 1.16.0 (parche >=1.18.0). `react-scripts` 5 arrastra también dependencias vulnerables. Actualizar lockfile de forma controlada, ejecutar de nuevo test/lint/build/audit y revisar incompatibilidades.
2. **Alta: Apache no configura HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options` ni `Referrer-Policy`; tampoco límite de tamaño de petición ni rate limiting perimetral.** `mod_headers` y `mod_reqtimeout` están disponibles, pero no se usan en el virtualhost. El limitador de login es sólo memoria local, por IP/usuario, y no es suficiente frente a picos o múltiples workers.
3. **Alta: capacidad hasta 200 VU no demostrada.** No hay staging aislado. El VPS cuenta con 2 CPU y 3.8 GiB RAM y comparte Apache/MongoDB con otros servicios; el backend se ejecuta con un único Uvicorn worker. No es seguro ejecutar esta prueba de carga en este host mientras aloja producción.

### Hallazgos importantes

- HTTPS y redirección HTTP->HTTPS están presentes; la cookie de sesión se establece como HttpOnly/Secure/SameSite=Strict. CORS se configura por variable de entorno y no contiene comodín en el código observado. Variables requeridas están presentes; sus valores no se expusieron.
- No se hallaron `.env`, claves privadas o patrones habituales de secretos versionados; sólo se versionan plantillas `.env.example`.
- Los logs son texto local de Uvicorn/Apache. Faltan rotación/retención verificable, trazas/correlación, métricas, alertas y monitorización externa.
- `/api/health` verifica MongoDB con timeout; es apto como sonda básica. No hay prueba de readiness/liveness del proxy ni alerta configurada.
- El despliegue usa `git reset --hard origin/main`, instala y construye en el árbol activo y reinicia el backend. No hay release atómico, health check posterior, rollback automático ni aplicación controlada de migraciones.
- Las migraciones documentadas tienen modo dry-run, pero el script de despliegue no las invoca ni registra versión aplicada.
- Flake8 reporta numerosos incumplimientos (predominan E501; también imports no usados) y Black reformatearía 80 archivos. Mypy reporta errores de tipado. Son deuda de calidad, no se hicieron refactorizaciones masivas.
- FastAPI usa eventos `on_event`, actualmente deprecados; migrar a `lifespan` de forma planificada.

## Rendimiento y capacidad

No hay métricas p50/p95/p99, throughput ni tasa de error válidas hasta 200 VU: **prueba pendiente de un entorno aislado**. Se intentó preparar una instancia local con BBDD temporal, pero las tareas en segundo plano del entorno de ejecución se terminan al cerrar el comando; no se sustituyó por carga en el VPS productivo.

Capacidad objetivo hasta 200 VU: **no demostrada y no aprobada**. Un solo worker Python en 2 CPU, operaciones Mongo/Excel/PDF y rate limiting en memoria requieren ensayo aislado y dimensionamiento antes de afirmar que el sistema soporta 200 VU.

Prueba obligatoria en staging equivalente:

1. Desplegar release candidato con MongoDB de datos sintéticos y monitorización de CPU, RSS, conexiones Mongo, I/O, errores 4xx/5xx y logs.
2. Ejecutar rampa 25 -> 100 -> 200 VU, 10–15 min por escalón, con 70% navegación/API de lectura, 15% login, 10% escritura crítica y 5% exportaciones/PDF, usando cuentas y datos de prueba.
3. Criterios iniciales: errores <1%, p95 lectura <500 ms, p95 escritura <1 s, p99 <2 s, sin crecimiento sostenido de RSS ni saturación CPU/Mongo. Ajustar con evidencia de negocio.
4. Incluir reinicio de worker, caída simulada de Mongo, timeout de upstream, token caducado, payload inválido y ráfaga de login.

## Configuración y operaciones necesarias antes de despliegue

- Actualizar y fijar dependencias frontend vulnerables; adjuntar audit sin severidades alta/crítica aplicables.
- Sustituir Uvicorn directo por Gunicorn/Uvicorn workers, configurar número de workers tras ensayo, límites systemd (`MemoryMax`, `CPUQuota`, `NoNewPrivileges`, `ProtectSystem`, `PrivateTmp`), timeouts y reinicio gradual.
- Añadir en Apache cabeceras HSTS/CSP restrictiva/anti-frame/nosniff/referrer policy, `LimitRequestBody`, `RequestReadTimeout`, límites de proxy y rate limiting en borde para login/API. Validar CSP contra el frontend antes de activar `enforce`.
- Confirmar ACL/firewall de MongoDB y copias cifradas, restauración probada, RPO/RTO y retención. Evitar exposición pública de 27017.
- Implementar logs estructurados sin PII/secreto, IDs de correlación, métricas y alertas de disponibilidad, 5xx, latencia, recursos y backup.
- Definir pipeline de migraciones: backup, dry-run, aprobación, aplicación única, verificación y registro de versión.
- Cambiar despliegue a releases inmutables/atómicos con health check y rollback. No usar `git reset --hard` como mecanismo de release.

## Checklist de lanzamiento

- [ ] Audit frontend corregido y pruebas/lint/build verdes.
- [ ] Staging aislado ejecutó la rampa hasta 200 VU y cumplió los SLO acordados; esta prueba sigue pendiente y no certifica capacidad hasta completarse.
- [ ] Workers, proxy, rate limiting, cabeceras y límites de recursos aplicados y verificados.
- [ ] MongoDB privado, backup restaurado en ensayo y monitorización/alertas activas.
- [ ] Migraciones dry-run/aplicadas con backup y evidencia.
- [ ] Health check externo y smoke test post-release correctos.
- [ ] Plan de rollback comunicado y persona responsable disponible.

## Rollback breve

1. Mantener el release anterior y sus artefactos estáticos intactos.
2. Ante aumento de 5xx, p95/p99 o fallo de smoke: retirar tráfico/revertir symlink o release, reiniciar workers de forma controlada y verificar `/api/health`.
3. No revertir datos a ciegas: restaurar backup o ejecutar rollback de migración sólo si fue probado para la migración concreta.
4. Preservar logs/métricas del incidente y validar login, lectura, escritura y PDF tras la reversión.

## Comandos reproducibles

```bash
cd /var/www/ikastxiki
PHASE10_MONGO_URL=mongodb://127.0.0.1:27017 backend/venv/bin/python -m pytest backend/tests -q --junitxml=test_reports/pytest/backend-after-fix.xml
cd frontend && CI=true yarn test --watchAll=false --runInBand
cd frontend && yarn lint && yarn build
cd frontend && yarn audit --groups dependencies
backend/venv/bin/pip check
backend/venv/bin/python -m compileall -q backend
backend/venv/bin/python -m flake8 backend --exclude=venv,__pycache__,migrations

## Actualización de preparación de staging (2026-08-27)

### Dependencias

- Actualizadas sin salto mayor: `axios` 1.16.0 -> 1.18.0, `react-router-dom`/`react-router` 7.15.0 -> 7.18.2 y `postcss` 8.5.10 -> 8.5.23. React Router y Axios eran directas de runtime; PostCSS es directa de construcción.
- Validación en una copia temporal aislada: frontend 26 suites/159 tests, lint y build correctos. Backend: 548 passed, 12 skipped.
- El audit baja de 119 a 109 rutas vulnerables (89 altas, 19 moderadas, 1 baja). Persisten dependencias transitivas de `react-scripts` 5/Jest/Webpack (`form-data`, `js-yaml`, `ws`, `brace-expansion`, `shell-quote`, `body-parser`, `fast-uri`, `nanoid`, `svgo`, `webpack-dev-server` y PostCSS anidado). Son principalmente cadena de build/desarrollo; deben actualizarse sustituyendo/migrando el toolchain en una tarea separada, no mediante forzado de resoluciones incompatibles. Las vulnerabilidades runtime directas priorizadas han quedado actualizadas.

### Staging y seguridad añadidos (no activados)

- Añadidos `staging/backend.env.example`, unidad systemd aislada (Gunicorn/Uvicorn, 2 workers, puerto 18003, límites y reinicio controlado), virtualhost Apache HTTPS aislado y guía `staging/README.md`.
- Añadido `/api/metrics`, protegido por `X-Metrics-Token`, con CPU de proceso, RSS pico, carga, conexiones MongoDB, estados HTTP y latencias p50/p95/p99. Los logs de acceso son JSON y no incluyen cuerpos, cookies ni PII.
- Añadidos CORS con orígenes explícitos, cabeceras API, HSTS cuando llega `X-Forwarded-Proto=https`, rate limits configurables para login/API y configuración de borde en la plantilla Apache.
- El escenario existente `staging/load/k6-500.js` debe adaptarse al objetivo de 200 VU antes de ejecutarse en staging aislado. La prueba de capacidad hasta 200 VU sigue pendiente.

### Riesgos y aprobación pendiente

No se creó ni activó el host de staging: el VPS actual comparte 2 CPU/3.8 GiB con producción y no es un destino seguro para la prueba de capacidad hasta 200 VU. Requiere aprobación/provisión de un host o red aislada, dominio/certificado propios y secretos nuevos. También requiere decidir la migración de `react-scripts` para eliminar vulnerabilidades transitivas antes de producción.

Comandos de staging (sólo después de provisionar un host aislado):

```bash
cd /var/www/ikastxiki-staging
curl -fsS https://staging.ikastxiki.example:18443/api/health
curl -fsS -H "X-Metrics-Token: $METRICS_TOKEN" https://staging.ikastxiki.example:18443/api/metrics
# Tras adaptar el escenario al objetivo de 200 VU:
STAGING_BASE_URL=https://staging.ikastxiki.example:18443 STAGING_USER=... STAGING_PASSWORD=... k6 run staging/load/k6-500.js
```

## Prueba de capacidad backend local limitada (2026-08-27)

**Veredicto: no evaluable frente al objetivo de 200 usuarios concurrentes.** La ejecución se detuvo automáticamente en el primer escalón, 25 VU; no se intentaron escalones superiores.

- Aislamiento: checkout temporal, `127.0.0.1:18150`, sin Apache/DNS/TLS/puertos públicos, credenciales ficticias y MongoDB `ikas_txiki_capacity_20260827`. La base y la instancia fueron eliminadas/detenidas al finalizar.
- Límites aplicados: backend y generador fijados a un CPU de los dos disponibles (máximo práctico 50% host), `nice=19`, `RLIMIT_AS=768 MiB`, 1024 FD y 512 procesos. El límite inicial de 64 procesos no permitía iniciar los hilos de Motor para el usuario compartido; se elevó a 512 conservando los límites CPU/memoria/FD.
- Precheck producción: health 37,97 ms, CPU 0,2%, RSS 87,27 MiB; host CPU 3,39%, memoria disponible 2,33 GiB y disco 48,96%. Durante carga: health 3,23 ms, CPU 0,2%, RSS 87,27 MiB; host CPU 5,0%, memoria disponible 2,38 GiB y disco 48,96%. No se observó impacto.
- Escalón 25 VU: 30 respuestas HTTP registradas (200=25, 500=5) y 75 fallos de transporte/timeout contabilizados por separado; el umbral de error quedó claramente superado. p50=5978,75 ms, p95=6004,87 ms, p99=6005,90 ms. Se activaron p95/p99; no hubo reintentos.
- Evidencia conservada: `test_reports/capacity-local-20260827.json`.

Esta es una prueba de capacidad backend local limitada a 50% de CPU y 768 MiB; no valida TLS, Apache, DNS, red externa ni infraestructura pública. Investigar los HTTP 500 y timeout de ~6 s antes de volver a ejecutar desde 25 VU.

## Diagnóstico de fallo a 25 VU (2026-08-27)

- Reproducción privada limitada: 1 VU correcto; desde 5 VU aparecen HTTP 500/reset en dashboard, calendario y jugadores. A 10 VU se repite. Log y traza identifican `RuntimeError: can't start new thread` dentro de `motor` al ejecutar `cursor.to_list()`.
- Causa demostrada: `RLIMIT_NPROC=512` se aplica a todos los hilos del usuario compartido, no únicamente al proceso de prueba. Motor no puede ampliar su ejecutor; no es un timeout de MongoDB, PDF ni error funcional de los endpoints. A 1 VU login/dashboard/players/calendar/events/create respondieron 200 en 2,96–13,84 ms.
- La latencia de ~6 s del ensayo anterior coincide con el timeout de cliente configurado (5 s) más el scheduling/secuenciación del generador tras el agotamiento de hilos; no mide latencia normal del backend.
- Defecto independiente corregido en `staging/load/k6-500.js`: la ruta inexistente `/api/calendar` se sustituyó por `/api/calendar/events`. El escenario aún debe adaptarse a la rampa hasta 200 VU antes del ensayo aislado.
- Evidencia: `test_reports/capacity-diagnosis-20260827.json`. La reproducción no superó 10 VU; checkout, log, proceso y base MongoDB temporal fueron eliminados.

Recomendación: no usar `RLIMIT_NPROC` en un usuario compartido. Para una nueva prueba aislada, usar cgroup `TasksMax` en una cuenta de servicio exclusiva o, si no es posible, mantener límites de CPU/memoria/FD/afinidad y vigilar threads del proceso. Revalidar 1/5/10 VU antes de proponer 25+.

## Estado final de entrega (2026-08-27)

- Backend: `489 passed, 71 skipped` (`pytest backend/tests -q`).
- Frontend: `26` suites y `159` tests correctos; lint correcto; build de producción correcto.
- Capacidad: no certificada hasta 200 VU. La prueba de carga hasta 200 VU sigue pendiente de un entorno aislado; no existe staging aislado que permita realizarla de forma segura.
- La evaluación local de concurrencia mostró que `RLIMIT_AS=768 MiB` impedía a Motor crear hilos; no representa una certificación de infraestructura. Los intentos de 25 VU con k6 no iniciaron y no aportan métricas.
- Entrega funcional validada; la certificación de capacidad hasta 200 VU queda como riesgo/bloqueador operativo previo a declarar esa capacidad.

### Aclaración de cobertura de tests (2026-08-27)

- El total recolectado se mantiene en 560 pruebas. El resultado actual es `489 passed, 71 skipped`.
- Frente al resultado histórico `548 passed, 12 skipped`, las 59 omisiones adicionales son exactamente las pruebas históricas protegidas por `PHASE10_MONGO_URL`: `backend_test.py` (32), `test_phase2_modules.py` (20) y `test_phase3_data_mgmt.py` (7).
- La causa es que `PHASE10_MONGO_URL` no está configurada para una MongoDB temporal; no es una regresión ni un bloqueo de arranque. Las otras 12 omisiones también requieren BBDD temporales específicas (`EXERCISE_MONGO_URL`, `PHASE9_MONGO_URL`, `PHASE2_MONGO_URL`, `PHASE3_MATCH_MONGO_URL` y `PHASE8_MONGO_URL`).
- Para una cobertura completa antes de un cambio de alto riesgo, ejecutar esas suites contra BBDD temporales aisladas; para esta entrega, la suite disponible pasa sin fallos.
