# Staging aislado

Esta configuración es una plantilla; no está instalada ni activa. Requiere un checkout separado en `/var/www/ikastxiki-staging`, dominio y certificado distintos, y nunca debe reutilizar `.env`, `uploads`, MongoDB ni artefactos de producción.

## Preparación

1. Crear checkout/usuario de servicio aislado y copiar `staging/backend.env.example` a `/etc/ikastxiki/staging.env` con secretos nuevos.
2. Crear únicamente la base `ikas_txiki_staging`; cargar datos sintéticos y aplicar migraciones primero en dry-run.
3. Instalar requisitos en el venv de staging, construir frontend con `REACT_APP_BACKEND_URL=` y revisar el virtualhost `staging/apache/ikastxiki-staging.conf`.
4. Instalar la unidad `staging/systemd/ikastxiki-staging-backend.service`, ejecutar `systemctl daemon-reload`, habilitar y arrancar sólo `ikastxiki-staging-backend` tras aprobación.

## Verificación y limpieza

```bash
curl -fsS https://staging.ikastxiki.example:18443/api/health
curl -fsS -H "X-Metrics-Token: $METRICS_TOKEN" https://staging.ikastxiki.example:18443/api/metrics
STAGING_BASE_URL=https://staging.ikastxiki.example:18443 STAGING_USER=... STAGING_PASSWORD=... k6 run staging/load/k6-500.js
systemctl stop ikastxiki-staging-backend
mongosh "$MONGO_URL" --eval 'db.getSiblingDB("ikas_txiki_staging").dropDatabase()'
```

Antes de la carga, comprobar que `STAGING_BASE_URL` no es el dominio de producción. Guardar la salida de k6 y muestrear `/api/metrics` cada 5 s; registra RSS pico, CPU de proceso, carga del host, conexiones MongoDB, estados HTTP y p50/p95/p99.

## Dimensionamiento inicial

La unidad usa dos workers para un host dedicado de 2 vCPU/4 GiB. En el VPS actual compartido no debe activarse ni usarse para 500 VU: provisionar un host aislado equivalente y ajustar con los resultados. Los límites por proceso evitan fugas prolongadas; un rate limiter en memoria se aplica por worker, por lo que el borde (Apache/WAF/Redis) debe imponer la cuota global si se escala horizontalmente.

## Criterio de aprobación

Rampa completa 25/100/250/500 VU sin errores >=1%, p95 <500 ms, p99 <2 s, CPU sostenida <75%, RSS sin crecimiento sostenido, conexiones MongoDB dentro de capacidad y recuperación correcta de un reinicio controlado de un worker.
