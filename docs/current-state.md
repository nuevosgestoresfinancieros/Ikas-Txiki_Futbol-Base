# Estado funcional actual

Este documento describe únicamente información que puede verificarse en el repositorio. Debe actualizarse junto con cambios funcionales relevantes.

## Componentes activos observables

- Un frontend React está ubicado en `frontend/`.
- Una API FastAPI está ubicada en `backend/`.
- La configuración y la documentación del proyecto identifican MongoDB como base de datos.
- El README del repositorio enumera módulos de gestión deportiva, familias, equipos, entrenamientos, partidos, convocatorias, pagos, autorizaciones, comunicación, informes y configuración.
- La pantalla de Equipos organiza visualmente los registros por temporada, mediante tarjetas, filtros de búsqueda/categoría y una vista de plantilla que mantiene el equipo y sus jugadores dentro de la temporada seleccionada. Incluye «Crear temporada siguiente»: copia equipos y plantillas en registros nuevos, conserva una ficha única por jugador mediante `team_memberships` y permite cambiar la nueva temporada sin borrar el histórico anterior. Los equipos sin temporada se muestran en un bloque separado para su revisión.
- `scripts/publish-safe.sh` valida, prepara y publica cambios de código de forma controlada; admite `--dry-run` para validar sin commit, push, cambio de build ni reinicio de servicios.

## Limitaciones conocidas

- Este documento no certifica el estado de despliegues, servicios externos, datos almacenados ni entornos que no estén presentes en el repositorio.
- La disponibilidad, los permisos efectivos y el comportamiento de integraciones deben verificarse en el entorno correspondiente antes de afirmarlos.
- No se incluyen credenciales, tokens, enlaces privados, datos personales, exportaciones ni detalles operativos sensibles.

## Mantenimiento

Al modificar comportamiento de usuario, módulos, interfaces de API, flujos de datos o limitaciones conocidas, actualiza este documento con hechos comprobables y una referencia al cambio. Elimina o corrige información que deje de poder verificarse. Para decisiones de datos, seguridad o autenticación, añade además una decisión numerada en `docs/decisions/`.

## Accesos familiares e invitaciones

- Las cuentas familiares independientes se vinculan mediante family_id y family_contact_slot; cada progenitor puede usar un correo distinto.
- La cuenta se guarda antes del intento de correo. Las invitaciones solo persisten un digest, mantienen hasta tres enlaces pendientes no caducados y se activan mediante `/activar?token=...`; los enlaces antiguos `/login?invitation=...` siguen redirigiendo.
- delivery_logs usa estados sent, pending, failed o delivered_unknown y conserva recipient, status, error, created_at, sent_at, message_id, user_id y purpose, sin tokens ni contraseñas.
- Un envío sin destinatario se registra como pending con error recipient_missing; un formato inválido distinto sigue siendo failed/recipient_invalid.
- La ficha de Familias ofrece envío puntual por progenitor únicamente a administradores con `families:edit` y `users:administer`. La acción exige una ficha ya guardada, «Dar acceso a la aplicación» marcado, correo válido y confirmado explícitamente; cambiar el correo desmarca esa confirmación. Si hay cambios pendientes, la tarjeta ofrece «Guardar ficha para enviar» y refresca los accesos tras guardar, sin enviar mientras la persistencia no haya terminado. Muestra confirmación con correo enmascarado y solo informa «Invitación enviada» cuando la respuesta devuelve `delivery: sent`. Los estados `pending` y `failed` muestran el motivo sin afirmar entrega y permiten reintentar cuando procede. El modo automático y el envío masivo no se activan desde esta ficha.
- Para un correo válido aún no confirmado se muestra «Enviar invitación» desactivado con la explicación correspondiente y, cuando la ficha ya está guardada, «Confirmar correo y guardar» para que un administrador confirme explícitamente ese dato sin editar el resto de la familia. Las cuentas activas, bloqueadas, duplicadas o en conflicto no ofrecen una acción de invitación; una cuenta activa se remite a «Usuarios y permisos → Seguridad» sin mostrar un aviso de confirmación de correo fuera de contexto.
- El administrador del entorno es una cuenta de solo lectura calculada desde .env; se presenta como activa y no se crea en MongoDB.

## Onboarding familiar de autorizaciones

- Al crear, activar o cargar el portal de una cuenta familiar, el backend crea de forma idempotente seis autorizaciones por cada jugador vinculado: `general`, `imagen`, `medica`, `desplazamientos`, `recogida` y `proteccion_datos`.
- El portal familiar devuelve un resumen `authorization_onboarding` por hijo/a, con el progreso y el estado efectivo de cada documento. Un estado `firmada` sin evidencia almacenada se presenta como pendiente.
- La familia puede descargar el PDF bilingüe, seleccionar el progenitor que figura en la autorización, subir PDF/JPG/PNG/WEBP o dibujar una firma electrónica sencilla con consentimiento, modalidad, fecha, usuario, tamaño, MIME y hash. El progenitor seleccionado aparece tanto en el bloque de datos como en el bloque de firma del documento. La evidencia queda fuera de MongoDB; MongoDB conserva únicamente metadatos y una ruta generada por el servidor. La firma electrónica solo puede realizarla la cuenta del progenitor conectado; en una subida en papel puede figurar el otro progenitor, manteniendo separada la cuenta que aporta el archivo.
- La pantalla administrativa de autorizaciones carga las fichas familiares permitidas y ofrece el mismo selector de progenitor por jugador (incluidos registros importados con correo pero sin nombre); el nombre nunca se introduce como texto libre y el `parent_slot` se valida de nuevo en el backend al recibir el documento.
- Las acciones familiares de recepción usan exclusivamente `authorizations:submit` y el alcance se vuelve a comprobar mediante `player_id`; editar, borrar o cancelar sigue siendo administrativo. El reenvío masivo de invitaciones familiares pendientes también es solo administrativo y devuelve contadores `sent`, `pending` y `failed`.
- Tras activar una cuenta, la interfaz enlaza a `/login?activated=1` y, después del login familiar, abre `/portal?onboarding=1`. Posponerlo no bloquea el portal y deja un aviso hasta completar todos los documentos.
