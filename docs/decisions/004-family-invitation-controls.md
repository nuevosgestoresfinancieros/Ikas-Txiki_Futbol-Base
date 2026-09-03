# 004 — Controles de invitación familiar

## Contexto

El acceso familiar se prepara en la ficha de Familia, pero la entrega de correo y la activación de la cuenta son operaciones sensibles. Una ficha puede contener cambios aún no guardados y cada progenitor debe conservar su alcance independiente.

## Decisión

El envío manual desde la ficha queda limitado a administradores que tengan simultáneamente `families:edit` y `users:administer`. Antes de solicitarlo, la ficha debe estar guardada, el acceso debe estar marcado y el correo debe ser válido y confirmado explícitamente en la ficha; si el correo cambia, la confirmación se retira. La interfaz confirma el destinatario de forma enmascarada, llama al endpoint del `family_id` y `slot` recibidos, y solo presenta un éxito cuando el backend devuelve `sent`; `pending` y `failed` conservan su motivo para permitir un reintento seguro.

La autorización efectiva permanece en el backend, que valida el actor y el alcance. Esta acción no activa el aprovisionamiento automático ni las campañas masivas. Los tokens continúan almacenándose únicamente como digest y se construyen enlaces con `PUBLIC_APP_URL`.

## Consecuencias

Las familias deben guardarse antes de enviar y los cambios de correo requieren una nueva confirmación. El administrador puede actuar sobre un solo progenitor sin afectar a otras familias. La entrega sigue dependiendo de la configuración SMTP y se puede distinguir visualmente entre correo enviado y correo no enviado.
