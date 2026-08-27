# Handover

## Instalación
- Backend: entorno virtual y `backend/requirements.txt`; configurar variables en un archivo fuera del repositorio.
- Frontend: `yarn --cwd frontend install --frozen-lockfile` y `yarn --cwd frontend build`.

## Operación y mantenimiento
- Supervisar health, métricas protegidas y logs; mantener copias de MongoDB y uploads.
- Ejecutar las suites antes de cada entrega: pytest, tests frontend, lint y build.

## Riesgos conocidos
- La prueba de capacidad hasta 200 VU sigue pendiente de un entorno aislado con cuentas/datos sintéticos y observabilidad; no hay certificación ni afirmación de que el sistema soporte 200 VU.
- No aplicar `RLIMIT_AS` de 768 MiB al backend: puede impedir que Motor cree hilos.
- Los límites de login forman parte de producción y deben probarse en un escenario de abuso separado.
