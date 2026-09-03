# Guía para asistentes

## Estructura

- `frontend/` contiene la aplicación React; `frontend/src/` es código de interfaz.
- `backend/` contiene la API FastAPI, pruebas y recursos de servidor.
- `docs/` contiene documentación mantenida junto al cambio.
- `scripts/` y `.githooks/` contienen automatizaciones versionadas del repositorio.

## Comandos y pruebas

- Lee el README y los archivos relevantes antes de cambiar algo.
- Ejecuta únicamente las pruebas o comprobaciones pertinentes al alcance del cambio y comunica sus resultados.
- Ejecuta `scripts/sync-agent-guides.sh` tras cambiar esta guía y `scripts/check-agent-guides.sh` antes de entregar cambios relacionados.
- Ejecuta `git diff --check` para detectar errores de espacios cuando sea pertinente.

## Estilo y documentación

- Mantén los cambios pequeños, claros y coherentes con el estilo existente.
- Actualiza `docs/current-state.md` para cambios funcionales y `docs/architecture.md` para cambios transversales.
- Crea una decisión numerada en `docs/decisions/` para decisiones de datos, seguridad o autenticación.

## Seguridad y cambios ajenos

- No incluyas ni solicites contraseñas, tokens, secretos, cookies, enlaces privados, datos personales reales, exportaciones o copias de seguridad en código, documentación, mensajes o commits.
- Preserva cambios ajenos: inspecciona el estado de Git, no reviertas ni reformatees archivos no relacionados y no sobrescribas trabajo existente.
- No modifiques MongoDB, servicios, configuración de producción ni datos reales sin autorización explícita.
- No hagas commit, push, despliegue, reinicio de servicios ni actives hooks sin autorización explícita.
