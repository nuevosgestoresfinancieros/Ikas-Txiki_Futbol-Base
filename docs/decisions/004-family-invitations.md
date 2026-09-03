# Decisión 004: invitaciones familiares durables y sin secretos

## Estado

Aceptada.

## Decisión

Guardar la cuenta familiar y el digest de la invitación antes de intentar SMTP. Registrar cada resultado con un esquema estable y conservar enlaces pendientes recientes durante su TTL. Un fallo SMTP debe dejar la cuenta pendiente y reenviable; nunca se guarda el token en MongoDB ni se incluye una contraseña en logs o respuestas de diagnóstico.

## Motivo

La entrega de correo es un sistema externo y puede fallar después de que la cuenta sea válida. Separar persistencia y entrega evita perder cuentas y permite corregir la configuración o reenviar de forma segura. El estado de cuenta (active, pending_activation, etc.) y el estado de seguridad/entrega se muestran por separado.

## Verificación

Las pruebas usan SMTP falso y una base temporal/mock; no realizan envíos reales ni certifican recepción en un buzón.
