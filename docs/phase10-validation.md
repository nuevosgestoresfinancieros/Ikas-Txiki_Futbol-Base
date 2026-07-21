# Fase 10 - estabilización y validación integral

## Pruebas históricas actualizadas

- `backend_test.py`, `test_phase2_modules.py` y `test_phase3_data_mgmt.py` ya no usan
  `ikas-futbol-base.preview.emergentagent.com`. Cada worker arranca un backend HTTP
  local, con credenciales ficticias y una base MongoDB temporal independiente.
- El cliente histórico rechaza cualquier URL HTTP absoluta, evitando que una prueba
  vuelva a salir a Internet por accidente.
- La distribución de pytest es `loadfile`: conserva el orden interno de los módulos
  históricos sin compartir estado entre workers.
- La expectativa antigua que aceptaba `enviado=true` desde el navegador se sustituyó
  por el comportamiento vigente: sin confirmación del proveedor, la comunicación
  permanece `pending`, sin `fecha_envio`.
- No se eliminó ninguna prueba ni se redujo ninguna aserción. Se añadieron comprobaciones
  de cabecera, firma y tamaño mínimo para los PDF de autorización y convocatoria.

## Resultado automatizado

- Backend: 177 superadas, 0 fallidas, 0 omitidas.
- Frontend: 55 superadas, 0 fallidas, 0 omitidas.
- Total: 232 superadas, 0 fallidas, 0 omitidas.
- Build optimizado de React: correcto.
- Migración `001_users_rbac.py`: ejecutada solo en modo informativo contra MongoDB
  temporal; no escribió datos.
- Compatibilidad: cubiertos estados históricos de convocatoria, JWT sin rol,
  usuarios inactivos, ámbitos de equipo/familia/jugador, importación idempotente y
  aislamiento de borradores.

## Validación visual local

Se revisaron con datos ficticios 15 rutas en 1440x900, 834x1112 y 390x844:
dashboard, jugadores, familias, equipos, equipamiento, entrenamientos, partidos,
convocatorias, autorizaciones, pagos, comunicaciones, inscripciones/importación,
configuración, usuarios y calendario.

- Sin desbordamiento horizontal del documento ni imágenes rotas.
- Navegación lateral, cabecera y navegación móvil visibles en su breakpoint.
- Formularios, filtros, tablas, estados vacíos/carga y modales mantienen nombre
  accesible en las comprobaciones específicas.
- Centro de notificaciones comprobado en móvil; consola sin errores ni advertencias.
- Castellano y euskera comprobados. Se corrigió la pantalla de equipamiento, que
  tenía textos fijos en castellano, y se añadieron etiquetas accesibles a sus controles.
- PDF de autorización y convocatoria: una página A4, contenido completo, texto
  seleccionable y presencia de castellano/euskera verificada mediante extracción.

Las capturas se generan en `/tmp/ikastxiki-phase10-screenshots` y no se versionan.
No contienen datos reales.

## Advertencias no bloqueantes

- Starlette avisa de la futura sustitución de `multipart` por `python_multipart`.
- FastAPI avisa de que `on_event("shutdown")` debe migrar a lifespan.
- Passlib usa `crypt`, módulo previsto para retirada en Python 3.13.
