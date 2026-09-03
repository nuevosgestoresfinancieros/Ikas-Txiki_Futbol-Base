# 002 — Autenticación

## Contexto

La aplicación gestiona cuentas y acceso a información que puede ser personal o sensible.

## Decisión

Las cuentas se asignan a personas identificables y reciben únicamente los roles necesarios. Las sesiones se gestionan en el servidor y deben expirar o invalidarse conforme a la política aplicable. Las invitaciones y recuperaciones se emiten para un uso limitado, se validan antes de conceder acceso y no revelan si una cuenta existe cuando ello incremente el riesgo.

No se exponen ni se incorporan a código, documentación, registros o mensajes de error contraseñas, hashes, tokens, cookies, secretos, enlaces privados de invitación o recuperación, ni otros identificadores de acceso.

## Consecuencias

Los cambios de roles, sesiones, invitaciones o recuperación requieren revisión de autorización, caducidad, revocación y registro seguro. Ante una exposición de credenciales o enlaces, se invalida el material afectado y se sigue el procedimiento de respuesta autorizado.
