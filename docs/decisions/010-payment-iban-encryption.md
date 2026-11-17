# 010 — Cifrado de IBAN en pagos

## Contexto

Las importaciones guardaban el IBAN cifrado (`iban_encrypted`, `iban_last4`),
pero los pagos creados o editados desde la pantalla de Cuotas y pagos lo
guardaban en claro. Además, el contador «Cuentas bancarias protegidas» solo
contaba las referencias históricas, por lo que las inscripciones nuevas nunca
aparecían como protegidas.

## Decisión

- El servidor cifra siempre el IBAN de un pago al crearlo o editarlo y guarda
  `iban: null`. Solo quedan visibles `iban_country` y `iban_last4`, que la API
  devuelve enmascarados (`ES•• •••• •••• •••• •••• 1234`).
- Un IBAN nuevo se valida (estructura ISO 13616 y dígito de control mod-97);
  si no es válido se rechaza con 422.
- El valor enmascarado que devuelve la API, o la omisión del campo, conserva la
  cuenta existente. Un campo vacío enviado explícitamente elimina la cuenta.
- Un IBAN heredado en claro se cifra la siguiente vez que se guarda el pago.
- La API expone `cuenta_protegida` (hay `iban_encrypted`) y el contador lo usa
  para cualquier pago, nuevo o histórico.
- Los estados no cambian: las cuotas nuevas siguen «pendiente» y las cuentas
  históricas sin deuda, «referencia».
- Los IBAN ya guardados en claro se convierten con la migración
  `011_encrypt_payment_ibans.py`, que solo se aplica con autorización explícita.
- La versión anterior podía sobrescribir el IBAN con su máscara al editar un
  pago. En esos registros el IBAN completo no se puede recuperar: la migración
  conserva país y últimos 4 dígitos y los marca para volver a introducirlo.

## Consecuencias

El IBAN completo solo se obtiene descifrándolo en la exportación administrativa.
La clave de cifrado sigue derivada de `JWT_SECRET`, como en las importaciones,
de modo que rotar ese secreto exige volver a cifrar los IBAN.
