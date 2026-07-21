# Adaptador de la base histórica del cliente

Este documento describe el mapeo técnico del formato `BBDD` hacia un borrador
aislado `import_staging`. No autoriza una importación definitiva. Las columnas
80–129 se clasifican como auxiliares, no se convierten en campos oficiales y
solo se contabilizan estructuralmente.

## Mapeo de las 79 columnas operativas

| # | Columna BBDD | Destino temporal |
|---:|---|---|
| 1 | NOMBRE | `player.first_name` |
| 2 | APELLIDOS | `player.last_name` |
| 3 | FECHA DE NACIMIENTO | `player.birth_date` |
| 4 | AÑO DE NACIMIENTO | `player.birth_year_reference` |
| 5 | CATEGORÍA | `registration.category` |
| 6 | CENTRO DE PROCEDENCIA | `player.school_origin` |
| 7 | NOMBRE DEL PADRE | `contacts.father.name` |
| 8 | TELÉFONO DEL PADRE | `contacts.father.phone` (texto) |
| 9 | NOMBRE DE LA MADRE | `contacts.mother.name` |
| 10 | TELÉFONO DE LA MADRE | `contacts.mother.phone` (texto) |
| 11 | DIRECCIÓN | `family.address_candidate` |
| 12 | CORREO ELECTRÓNICO AITA | `contacts.father.email` |
| 13 | CORREO ELECTRÓNICO AMA | `contacts.mother.email` |
| 14 | RECIBIR NOTIFICACIONES | `consents.notifications` |
| 15 | TALLA 16&17 | `equipment_history.2016-2017.shirt_size` |
| 16 | TALLA 17&18 | `equipment_history.2017-2018.shirt_size` |
| 17 | NOMBRE CAMISETA 18&19 | `equipment_history.2018-2019.shirt_name` |
| 18 | Dorsal 18&19 | `equipment_history.2018-2019.number` |
| 19 | NOMBRE CAMISETA 19&20 | `equipment_history.2019-2020.shirt_name` |
| 20 | Dorsal 19&20 | `equipment_history.2019-2020.number` |
| 21 | TALLA 19&20 | `equipment_history.2019-2020.shirt_size` |
| 22 | TALLA MEDIAS 19&20 | `equipment_history.2019-2020.socks_size` |
| 23 | NOMBRE CAMISETA 20&21 | `equipment_history.2020-2021.shirt_name` |
| 24 | DORSAL 20&21 | `equipment_history.2020-2021.number` |
| 25 | TALLA 20&21 | `equipment_history.2020-2021.shirt_size` |
| 26 | NOMBRE CAMISETA 21&22 | `equipment_history.2021-2022.shirt_name` |
| 27 | DORSAL 21&22 | `equipment_history.2021-2022.number` |
| 28 | TALLA 21&22 | `equipment_history.2021-2022.shirt_size` |
| 29 | TALLA MEDIAS 21&22 | `equipment_history.2021-2022.socks_size` |
| 30 | NOMBRE CAMISETA 22&23 | `equipment_history.2022-2023.shirt_name` |
| 31 | DORSAL 22&23 | `equipment_history.2022-2023.number` |
| 32 | TALLA 22&23 | `equipment_history.2022-2023.shirt_size` |
| 33 | TALLA MEDIAS 22&23 | `equipment_history.2022-2023.socks_size` |
| 34 | NOMBRE CAMISETA 23&24 | `equipment_history.2023-2024.shirt_name` |
| 35 | DORSAL 23&24 | `equipment_history.2023-2024.number` |
| 36 | TALLA 23&24 | `equipment_history.2023-2024.shirt_size` |
| 37 | TALLA MEDIAS 23&24 | `equipment_history.2023-2024.socks_size` |
| 38 | NOMBRE CAMISETA 24&25 | `equipment_history.2024-2025.shirt_name` |
| 39 | DORSAL 24&25 | `equipment_history.2024-2025.number` |
| 40 | TALLA 24&25 | `equipment_history.2024-2025.shirt_size` |
| 41 | TALLA MEDIAS 24&25 | `equipment_history.2024-2025.socks_size` |
| 42 | NOMBRE CAMISETA 25&26 | `equipment_history.2025-2026.shirt_name` |
| 43 | DORSAL 25&26 | `equipment_history.2025-2026.number` |
| 44 | TALLA 25&26 | `equipment_history.2025-2026.shirt_size` |
| 45 | TALLA MEDIAS 25&26 | `equipment_history.2025-2026.socks_size` |
| 46 | NOMBRE CAMISETA 26&27 | `equipment.2026-2027.shirt_name` |
| 47 | DORSAL 26&27 | `equipment.2026-2027.number` |
| 48 | TALLA 26&27 | `equipment.2026-2027.shirt_size` |
| 49 | TALLA MEDIAS 26&27 | `equipment.2026-2027.socks_size` |
| 50 | Eskola/futbolfederado 25/26 | `sport_history.2025-2026.program` |
| 51 | EQUIPO 21&22 | `team_history.2021-2022` |
| 52 | EQUIPO 23&24 | `team_history.2023-2024` |
| 53 | EQUIPO 24&25 | `team_history.2024-2025` |
| 54 | EQUIPO 25&26 | `team_history.2025-2026` (solo referencia) |
| 55 | EQUIPO 26&27 | `registration.team_2026_2027` |
| 56 | CATEGORÍA DE JUEGO | `sport_history.playing_category` |
| 57 | FEDERADO 18&19 | `federation_history.2018-2019` |
| 58 | FEDERADO 19&20 | `federation_history.2019-2020` |
| 59 | FEDERADO 20&21 | `federation_history.2020-2021` |
| 60 | FEDERADO 21&22 | `federation_history.2021-2022` |
| 61 | FEDERADO 22&23 | `federation_history.2022-2023` |
| 62 | FEDERADO 24&25 | `federation_history.2024-2025` |
| 63 | FEDERADO 25&26 | `federation_history.2025-2026` |
| 64 | FEDERADO 26&27 | `federation_history.2026-2027` |
| 65 | DEMARCACIÓN | `sport_history.position` |
| 66 | TITULAR NÚMERO DE CUENTA | `bank.account_holder` |
| 67 | NÚMERO DE CUENTA | `bank.iban_candidate` (validado/cifrado o descartado) |
| 68 | PERMISO PARA COBRAR DEL NÚMERO DE CUENTA | `consents.debit_permission` |
| 69 | Tipo cuota integra (I), fraccionada (f) | `fees.payment_schedule` |
| 70 | CUOTA A PAGAR | `fees.amount_due_unconfirmed` |
| 71 | CUOTA PAGADA | `fees.amount_paid_reference` |
| 72 | CUOTA PENDIENTE DE PAGO | `fees.balance_reference_unconfirmed` |
| 73 | Entrenamiento lunes 25/26 | `schedule_history.2025-2026.monday` |
| 74 | entrenamiento martes 25/26 | `schedule_history.2025-2026.tuesday` |
| 75 | entrenamiento miércoles 25/26 | `schedule_history.2025-2026.wednesday` |
| 76 | entrenamiento jueves 25/26 | `schedule_history.2025-2026.thursday` |
| 77 | entrenamiento viernes 25/26 | `schedule_history.2025-2026.friday` |
| 78 | BESTE DATU INTERESGARRIAK/ OTROS DATOS DE INTERÉS | `sensitive_quarantine.other_notes` |
| 79 | PERMISO PARA PUBLICAR IMÁGENES | `consents.image_permission` |

## Reglas de seguridad y transformación

- Unicode se normaliza con NFKC; se recortan y compactan espacios.
- Fechas se convierten a ISO únicamente cuando son válidas.
- Teléfonos se conservan como texto. Valores incompatibles generan incidencia.
- Correos múltiples o incompatibles no se dividen ni se inventan.
- Las fórmulas solo se materializan en las columnas 70–72 y solo con resultado
  numérico almacenado en el libro. Cualquier otra fórmula bloquea el registro.
- `EQUIPO 25&26` nunca se usa como equipo actual.
- F7/F11 es únicamente una sugerencia y permanece pendiente hasta confirmación.
- Los candidatos familiares requieren dos señales independientes y decisión
  administrativa; no existe vinculación automática.
- El IBAN nunca se muestra completo. Un valor inválido no se corrige ni se
  convierte; un valor válido tampoco prueba mandato de cobro.
- Cuotas, pagos y saldos son referencias históricas no confirmadas: la
  simulación crea cero pagos, deudas, recibos y remesas.
- Los consentimientos conservan `yes`, `no` y `unanswered`; no se interpretan
  como firmas si no existe fecha y evidencia.
- “Otros datos de interés” permanece en cuarentena sensible y solo se expone
  como indicador de presencia.
