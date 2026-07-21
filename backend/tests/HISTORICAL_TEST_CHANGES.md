# Actualización de pruebas históricas — Fase 10

No se ha eliminado ninguna prueba ni se han relajado sus comprobaciones funcionales.

## Infraestructura

- Se eliminó el fallback a `ikas-futbol-base.preview.emergentagent.com` de los tres módulos históricos.
- Cada worker ejecuta un backend HTTP local, credenciales ficticias y una base MongoDB temporal independiente.
- El cliente rechaza expresamente cualquier URL absoluta para impedir accesos externos accidentales.
- La base se vacía antes y después de cada módulo y se elimina al cerrar la sesión de pruebas.
- La distribución cambió de `loadscope` a `loadfile`: las clases de un mismo archivo comparten los IDs que crean,
  sin perder paralelismo entre archivos.

## Expectativa funcional retirada

`test_create_communication_marked_sent` pasó a llamarse
`test_create_communication_remains_pending_without_provider`.

Antes enviaba `enviado=true` desde el navegador y esperaba que el backend lo aceptase. Ese comportamiento fue retirado
por seguridad en la Fase 7. Ahora comprueba que, sin proveedor configurado:

- `enviado` permanece en `false`;
- `estado_envio` es `pending`;
- `fecha_envio` permanece vacía.

Esto conserva y refuerza la cobertura: una comunicación solo consta como enviada cuando el proveedor confirma la entrega.
