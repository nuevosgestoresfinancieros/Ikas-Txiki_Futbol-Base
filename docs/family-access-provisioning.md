# Accesos familiares y aprovisionamiento

## Estado seguro de despliegue

El sistema se entrega con dos barreras independientes:

- `settings.family_access_provisioning.mode = manual` por defecto.
- `FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED` ausente o distinto de `1` impide que
  el worker y las acciones de invitación entreguen correos.

No se debe habilitar ninguna barrera durante la publicación inicial.

## Preflight de migración

El comando predeterminado es de solo lectura y solo imprime agregados:

```bash
cd /var/www/ikastxiki/backend
venv/bin/python migrations/009_family_access_provisioning.py
```

La aplicación de infraestructura requiere una autorización separada y una
confirmación literal. Crea índices y fija el modo manual; no etiqueta ni cambia
cuentas o familias históricas:

```bash
venv/bin/python migrations/009_family_access_provisioning.py \
  --apply --confirm PREPARE-FAMILY-ACCESS-INFRASTRUCTURE
```

Si hay correos normalizados duplicados, `--apply` se bloquea antes de crear el
índice único. Esos casos se revisan sin revelar la cuenta propietaria.

## Activar el modo automático

1. Confirmar que la migración estructural fue aprobada y aplicada.
2. Mantener `FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED` desactivado.
3. Realizar un preflight desde Familias y revisar sus agregados.
4. Probar creación y reconciliación con un proveedor SMTP simulado.
5. Obtener autorización operativa separada.
6. Configurar `FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED=1` solo en el proceso del
   worker autorizado.
7. En Familias, activar el modo escribiendo exactamente
   `ACTIVAR APROVISIONAMIENTO AUTOMÁTICO`.
8. Supervisar cola, casos a revisar y auditoría.

Desactivar primero el modo funcional y después detener el worker. Las cuentas
ya creadas no se eliminan ni modifican.

## Lanzar una campaña

1. Pulsar **Crear preflight**. Esta operación no escribe en MongoDB.
2. Revisar únicamente el resumen agregado.
3. Obtener autorización para la campaña concreta.
4. Confirmar escribiendo `CONFIRMAR APROVISIONAMIENTO`.
5. La confirmación vuelve a calcular la huella; si cambió, no crea la campaña.
6. Ejecutar el worker autorizado. Los trabajos son reclamados con lease y clave
   idempotente.
7. Pausar o reanudar desde la campaña si fuese necesario.

Nunca se reintenta automáticamente una entrega cuyo resultado SMTP sea
incierto. Pasa a revisión para evitar duplicar invitaciones.

## Backup y rollback

Antes del despliegue:

- backup verificado de las colecciones `users`, `families`, `settings`,
  `internal_events` y `delivery_logs`;
- exportar también las nuevas colecciones de campañas, jobs y límites si ya
  existen;
- guardar el artefacto backend/frontend anterior y su checksum;
- validar restauración en un entorno aislado.

Rollback funcional:

1. cambiar el modo a `manual`;
2. retirar `FAMILY_ACCESS_EMAIL_DELIVERY_ENABLED` del worker;
3. detener el worker, sin reiniciar la aplicación hasta aprobación;
4. restaurar el artefacto anterior;
5. conservar cuentas e invitaciones creadas para revisión: no borrarlas;
6. los índices y colecciones nuevas son compatibles con el código anterior y
   no necesitan eliminarse durante un rollback urgente.

