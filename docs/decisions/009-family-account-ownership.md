# 009 — Titularidad y alcance de las cuentas familiares

## Contexto

Una familia puede tener uno o dos progenitores y varios jugadores. Las cuentas
creadas antes de guardar todos los datos en `families` y los pagos históricos
pueden no tener un titular explícito, aunque sí conserven los campos de
contacto en la ficha del jugador.

## Decisión

Una cuenta de rol `family` se identifica con `family_id` y
`family_contact_slot`. En el alta, el servidor resuelve el progenitor del slot
desde la familia, lo usa como identidad de la cuenta y calcula todos los
`linked_player_ids` a partir de `players.familia_id`. Los pagos nuevos guardan
`titular_cuenta`; los pagos antiguos se enriquecen al leerlos, sin escritura
automática ni migración de datos.

Los informes y las exportaciones usan la misma resolución: familia canónica
primero y campos históricos del jugador como fallback. Si una cuenta antigua no
tiene slot, se infiere por coincidencia de correo o por el primer progenitor
con datos, preservando su identidad personalizada cuando solo se edita la
cuenta.

## Consecuencias

La creación de cuentas no depende de que el cliente replique nombres de
progenitores ni listas de hijos. El cambio es compatible con registros antiguos
y no requiere tocar MongoDB, pero una familia sin progenitor ni jugadores queda
marcada como vinculación incompleta para revisión administrativa.
