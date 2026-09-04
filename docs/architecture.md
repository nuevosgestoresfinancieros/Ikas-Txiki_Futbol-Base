# Arquitectura

Ikas-Txiki está organizado como una aplicación web con un frontend React, una API backend con FastAPI y MongoDB como almacenamiento de datos.

## Separación de responsabilidades

- `frontend/` contiene la interfaz React, sus componentes, rutas y cliente de API. No debe acceder directamente a MongoDB ni contener secretos.
- `backend/` contiene la API FastAPI, la lógica de servidor, validaciones y el acceso a datos mediante MongoDB. Las credenciales se obtienen de variables de entorno, nunca del código ni de la documentación.
- MongoDB conserva los datos operativos. Las operaciones de importación, exportación, restauración y borrado requieren especial cautela y procedimientos verificables.

## Calidad y publicación segura

Los cambios se prueban en la capa afectada antes de integrarse: pruebas de backend para la API y pruebas de frontend para la interfaz cuando existan. Los cambios transversales deben revisar la compatibilidad entre API, interfaz, permisos y datos.

La publicación se realiza solo con autorización explícita. Antes de ella se revisan los cambios, las variables de entorno, las migraciones o transformaciones de datos, las copias de seguridad y el plan de reversión. No se incluyen secretos, datos personales reales, exportaciones ni copias de producción en el repositorio.

`scripts/publish-safe.sh` es el procedimiento único de publicación local. Exige el directorio raíz y `main`, sincroniza las guías, limita el staging a rutas versionables y rechaza secretos, datos y artefactos. Ejecuta pruebas completas, lint, comprobación del diff y un build temporal. Tras commit y push correctos intercambia los directorios de build mediante renombrado, conserva el anterior en `frontend/.release-backups/` y recupera ese build ante un fallo. Solo reinicia `ikastxiki-backend.service` cuando el commit afecta a `backend/`; no administra Apache, MongoDB, uploads ni variables de entorno.

Las fichas de jugadores son canónicas y las pertenencias a equipos por
temporada se almacenan separadamente en `team_memberships`. La operación de
crear una temporada copia equipos y pertenencias, no personas ni familias;
mantiene el `equipo_id` del jugador como asignación más reciente para la
compatibilidad de los módulos existentes y usa la pertenencia cuando se
consulta una temporada histórica.

La equipación sigue la misma separación temporal sin duplicar la ficha personal:
`players.equipacion_por_temporada` guarda instantáneas parciales por clave de
temporada. `GET /api/equipment?temporada=...` compone la respuesta con esa
instantánea y con los datos de la pertenencia; si no existe un dato temporal,
usa el valor legado de `players` para conservar compatibilidad. Las ediciones
con temporada escriben únicamente la instantánea seleccionada. Al crear una
temporada nueva se copia la equipación disponible de la temporada de origen,
dejando después sus cambios aislados.

## Ciclo de vida de invitaciones

La provisión familiar y la administración de usuarios comparten el contrato de entrega SMTP. Primero se guarda la cuenta y el digest de la invitación; después se intenta enviar el mensaje. El resultado se registra con message_id y un purpose explícito. Los errores de transporte no deshacen el alta y permiten reenviar. La ficha de Familias ofrece un guardado explícito desde la tarjeta cuando hay cambios pendientes y una confirmación explícita del correo cuando aún no está confirmada, pero el envío solo se habilita tras confirmar la persistencia. La URL pública de activación entra por `/activar?token=...`; los enlaces heredados `/login?invitation=...` siguen redirigiendo al formulario. El token permanece válido mientras no caduque, se use o se cancele.

## Autorizaciones familiares

`authorization_service.ensure_family_authorizations` es el punto común de provisión, activación y compatibilidad de cuentas antiguas. La combinación `(player_id, tipo)` tiene una migración de índice único parcial preparada en `backend/migrations/010_family_authorization_indexes.py`; su preflight es de solo lectura y la aplicación exige confirmación explícita después de revisar duplicados históricos.

Las familias leen únicamente jugadores y autorizaciones dentro de su `family_id`. El portal expone únicamente los progenitores de esa familia y sus slots, sin correos ni credenciales; la pantalla administrativa obtiene los nombres desde las fichas familiares permitidas para ofrecer la misma selección por jugador. Para recibir una autorización solo pueden usar las rutas específicas `upload-signed` y `sign`, mapeadas a la acción `submit`; no reciben permisos CRUD genéricos. Las subidas se validan por MIME y firma binaria, se guardan con nombre generado bajo `backend/uploads/` y se registra únicamente evidencia técnica y de auditoría. La firma electrónica sencilla genera un PDF de evidencia, exige consentimiento y solo permite firmar electrónicamente al progenitor de la cuenta autenticada; la subida en papel puede identificar al otro progenitor, manteniendo separado el usuario que aporta el archivo. No se presenta como firma cualificada o certificada.
