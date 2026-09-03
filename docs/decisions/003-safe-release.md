# 003 — Publicación segura

## Contexto

Una publicación combina cambios de código, un build estático y, en ocasiones, el reinicio del backend. El repositorio también puede contener archivos locales sensibles o datos que nunca deben entrar en un commit ni participar en el despliegue.

## Decisión

La publicación autorizada se centraliza en `scripts/publish-safe.sh`. El comando se limita al repositorio canónico y a la rama `main`, sincroniza las guías y permite preparar únicamente rutas versionables explícitas. Rechaza `.env`, uploads, builds, copias, volcados, claves y hojas de cálculo privadas.

Antes de publicar ejecuta pruebas de backend y frontend, lint, comprobación de espacios y un build de producción temporal. Exige documentación cuando hay cambios funcionales, salvo el tráiler explícito `Docs: N/A — motivo`. Tras el commit y push, conserva el build anterior, publica mediante renombrado de directorios y comprueba el endpoint de salud. Solo reinicia el servicio backend si el commit afecta a `backend/`.

## Consecuencias

La publicación falla antes del commit si detecta un archivo fuera de alcance. El build anterior queda disponible en `frontend/.release-backups/`. Si falla la publicación o la salud, el script recupera ese build y, para cambios de backend, restaura una copia versionada del backend anterior y reinicia únicamente ese servicio. El modo `--dry-run` permite comprobar staging, build temporal y el plan de backup/rollback sin publicar.

## Riesgos y reversión

El mecanismo no sustituye una copia autorizada de datos: no toca MongoDB, uploads ni variables de entorno. Ante un fallo, el rollback automatizado restaura los artefactos locales; cualquier reversión del commit remoto requiere un procedimiento Git autorizado e independiente.
