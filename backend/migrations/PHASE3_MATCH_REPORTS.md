# Fase 3: actas y rendimiento objetivo de partidos

Este documento describe la persistencia preparada por la Fase 3. No es una
migración y no ejecuta cambios sobre producción.

## Entidades reutilizadas

- `matches`: partido oficial y único origen del marcador y de la cabecera.
- `teams`, `players`: ámbito y candidatos válidos.
- `callups`: punto de partida informativo; nunca demuestra participación.
- `users`: identidad, rol y ámbito del actor.
- `internal_events`: auditoría transversal ya existente.

## Colección `match_reports`

Una acta es un único documento por `match_id`. Contiene `id`, `match_id`,
`team_id`, `status` (`draft`, `closed`, `reopened`), `origin`, `version`,
`period_configuration`, `participants`, `substitutions`, `goal_events`,
observaciones internas, autores y
fechas de creación/modificación/cierre/reapertura, motivo de reapertura e
`history` inmutable.

Cada elemento de `participants` contiene `player_id`, información de
convocatoria sincronizada, titularidad, participación real, minutos, periodos,
respuesta actual y original de convocatoria, dorsal, posición, motivos de
ausencia o excepción, entradas/salidas/cambios, goles, incidencias,
observaciones, origen, valor
original y metadatos de autoría. La validación rechaza identificadores
duplicados, de modo que existe como máximo un participante lógico por
`match_id + player_id`. El documento embebido permite guardar el conjunto de
forma atómica.

`substitutions` registra cada movimiento emparejado (entrante, saliente,
periodo, minuto, observación y actor). `goal_events` registra goles de jugador,
autogoles del rival o goles sin autor. Los contadores por participante se
derivan de estos eventos para evitar dos fuentes contradictorias.

La cabecera pública se deriva siempre de `matches` y `teams`; por tanto, una
corrección del partido oficial se refleja al consultar el acta y no crea un
segundo marcador.

## Índices y restricciones

Los índices se crean de forma idempotente únicamente al iniciar una escritura
de acta, nunca al arrancar la aplicación:

- `match_report_match_unique`: único sobre `match_id` (una acta por partido).
- `match_report_scope_status`: `team_id + status + updated_at`.
- `match_report_player_statistics`: `participants.player_id + status`.

La unicidad de participantes se comprueba antes de cualquier escritura. La
combinación del índice único de acta y esa validación equivale a la restricción
única `match_id + player_id` sin separar participantes en otra colección.

## Concurrencia, cierre y auditoría

Cada escritura exige la versión leída. MongoDB actualiza por `match_id`,
`team_id`, `version` y estado editable en una sola operación; una versión
obsoleta responde `409` y no escribe parcialmente. El cierre bloquea la
edición ordinaria. Solo administración puede reabrir, con motivo obligatorio.

`history` conserva eventos con actor, rol, fecha, versión y diferencias
anterior/nueva de los campos deportivos modificados. Además se registra el
evento correspondiente en `internal_events` para consulta administrativa.

## API y permisos

- `GET/POST /match-reports/match/{id}`: consulta o inicialización.
- `PUT /match-reports/match/{id}`: guardado completo con versión optimista.
- `PUT /match-reports/match/{id}/participants/{player_id}`: guardado individual.
- `POST .../validate`, `POST .../close`, `POST .../reopen`: validación, cierre y
  reapertura administrativa con motivo.
- `GET .../history`: historial interno.
- `GET .../export.pdf`: PDF A4 de acta cerrada, sin notas privadas.
- `GET /match-reports/statistics/objective`: agregación de actas cerradas.
- `POST /match-reports/import/dry-run`: previsualización administrativa sin
  escrituras.

Administrador accede a todo el club; coordinador y entrenador quedan limitados
a sus equipos. Familia y jugador no tienen el recurso `match-reports`. La
reapertura, la justificación del marcador y los minutos excepcionales se
reservan a administración.

## Simulación histórica sin base de datos

`backend/scripts/match_report_import_dry_run.py` acepta exclusivamente fixtures
JSON/CSV y un catálogo ficticio JSON. Nunca abre MongoDB. Devuelve 0 cuando
todas las filas son válidas, 2 cuando hay rechazos y 1 ante formato o uso
incorrecto. Los Excel privados quedan expresamente fuera de este flujo.

## Compatibilidad, implantación y rollback

No se transforman partidos, convocatorias ni jugadores existentes. La
colección se crea de forma perezosa cuando se crea la primera acta. Antes de un
futuro despliegue se debe generar un backup verificado de MongoDB y validar los
índices sobre una copia aislada.

El rollback de código consiste en volver al commit anterior y desplegarlo. Los
documentos `match_reports` son aditivos y el código anterior los ignora; no
deben borrarse automáticamente. Una retirada de datos requeriría autorización
separada, backup y procedimiento específico.
