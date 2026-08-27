# Deployment checklist

## Antes
- [ ] Copia de seguridad verificable de MongoDB y `uploads`.
- [ ] Variables: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD`, `CORS_ORIGINS`, SMTP y `METRICS_TOKEN`.
- [ ] Confirmar que no se despliegan `.env`, `test_reports/`, `staging/` ni datos sintéticos.
- [ ] Mantener bloqueada la declaración de capacidad: la prueba hasta 200 VU sigue pendiente de un entorno aislado y no demuestra que el sistema soporte 200 VU.

## Despliegue
- [ ] Aplicar migraciones en dry-run y revisar el resultado.
- [ ] Construir frontend: `yarn --cwd frontend build`.
- [ ] Normalizar permisos públicos inmediatamente después del build: directorios `755` y archivos `644` dentro de `frontend/build`; verificar `build/index.html` y `build/static` antes de recargar Apache.
- [ ] Instalar requisitos bloqueados y reiniciar el servicio backend.

## Después
- [ ] Comprobar `/api/health`, autenticación y flujo crítico.
- [ ] Consultar `/api/metrics` con token y revisar logs.
- [ ] Verificar backup y monitorización.

## Rollback
- [ ] Detener la versión nueva, restaurar artefacto previo y reiniciar.
- [ ] Restaurar MongoDB/uploads solo si la migración o datos lo requieren.
- [ ] Validar health y registrar el incidente.
