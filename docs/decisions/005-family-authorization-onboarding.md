# 005 — Onboarding y recepción de autorizaciones familiares

## Contexto

Las cuentas familiares pueden activarse antes de que el club reciba todas las autorizaciones de los jugadores vinculados. La recepción debe ser útil desde el portal, limitarse al ámbito de la familia y conservar evidencia suficiente sin guardar secretos ni contenido de firma en MongoDB.

## Decisión

Al crear, activar o cargar una cuenta familiar se llama a un helper idempotente que completa las seis filas de autorización de cada jugador vinculado. La familia puede descargar el modelo bilingüe y aportar un PDF o imagen validado, o una firma electrónica sencilla dibujada en la aplicación con nombre, consentimiento, fecha, usuario y versión del consentimiento. En ambos casos se genera o conserva evidencia fuera de MongoDB y se guardan solo metadatos, hash y nombre generado por el servidor.

La autorización de familia se expresa como una acción independiente `submit`, con comprobación de `player_id` mediante el ámbito habitual. Las operaciones de editar, borrar y cancelar siguen reservadas a administración. `firmada` significa documento recibido; no implica validación administrativa ni firma cualificada o certificada.

## Consecuencias

El onboarding puede posponerse sin bloquear el portal, pero mantiene un aviso hasta que cada autorización tenga evidencia. Los reintentos concurrentes quedan protegidos por el índice único `(player_id, tipo)`, que se aplica mediante una migración separada después de un preflight de duplicados en modo lectura. Las familias antiguas se compatibilizan al entrar en el portal.

## Riesgos y reversión

La firma electrónica sencilla requiere revisión jurídica antes de presentarse como firma legal certificada. La reversión funcional consiste en ocultar el componente y conservar las filas/metadatos ya recibidos; cualquier consolidación de duplicados o cambio de almacenamiento requiere una migración autorizada independiente. No se envían correos ni se modifican datos durante las pruebas locales.
