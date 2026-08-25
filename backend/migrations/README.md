# Migraciones de usuarios

La migración `001_users_rbac.py` es idempotente y se ejecuta en modo informativo por defecto:

```bash
../.venv/bin/python migrations/001_users_rbac.py
```

Para aplicarla de forma consciente, después de crear una copia de seguridad:

```bash
../.venv/bin/python migrations/001_users_rbac.py --apply
```

## Límites de plantillas

Registra y reproduce el ajuste conservador de límites de equipos. Solo amplía
los límites que sean inferiores al número actual de jugadores; nunca reduce
límites ni cambia asignaciones.

```bash
../.venv/bin/python migrations/002_team_roster_limits.py
../.venv/bin/python migrations/002_team_roster_limits.py --apply
```

Efectos:

- Solo asigna `admin` al usuario cuyo nombre coincide con `ADMIN_USER`.
- Los usuarios heredados sin rol quedan como `player` e inactivos hasta que un administrador configure su relación.
- No borra usuarios ni datos asociados.
- Crea índices únicos para `username` e `id`, e índices de consulta para rol, equipos, jugador y familia.

No se ejecuta automáticamente durante el arranque ni el despliegue.

## Reversión

Antes de usar `--apply` es obligatorio conservar una copia lógica de la colección
`users`. Para revertir, elimine únicamente los índices creados por esta
migración si no existían antes y restaure después la colección desde la copia:
`users_username_unique`, `users_id_unique`, `users_role_active`,
`users_assigned_teams`, `users_player` y `users_family`.

La migración no guarda contraseñas ni una segunda copia de usuarios dentro de la
base. La copia previa es, por tanto, la fuente de rollback y debe verificarse
antes de aplicar cambios.

## Restauración de equipos desde una copia Excel

`004_restore_player_teams_from_backup.py` recupera plantillas únicamente por el
identificador exacto de cada jugador. No se ejecuta en el despliegue y empieza
siempre con una vista previa. No aplicará cambios si queda un jugador sin una
asignación verificable.

```bash
../venv/bin/python migrations/004_restore_player_teams_from_backup.py /tmp/ikastxiki_backup.xlsx
```

Para jugadores posteriores a la copia, prepare un JSON que indique el equipo
de forma explícita, por ejemplo `{"player-id": "JUVENIL"}`, ejecute otra
vista previa con `--overrides` y revise el informe. Si la vista previa muestra
`possible_duplicates`, no se deben añadir a una plantilla: pueden archivarse
de forma trazable solo con `--consolidate-duplicates`, y únicamente si no
tienen referencias deportivas o de acceso. Las inscripciones sin conflicto se
reasocian a la ficha válida y quedan auditadas; cualquier conflicto bloquea el
lote antes de escribir. Tras tener una copia de MongoDB
verificada, la única escritura posible requiere además:

```bash
../venv/bin/python migrations/004_restore_player_teams_from_backup.py /tmp/ikastxiki_backup.xlsx \
  --overrides /tmp/equipos-nuevos.json --consolidate-duplicates \
  --apply --confirm RESTORE-ALL-PLAYER-TEAMS
```

## Restauración de equipaciones

`005_restore_equipment_from_backup.py` recupera por ID exacto las tallas, la
segunda equipación —incluido su dorsal— y el historial de equipación. No toca
el dorsal principal ni la marca de material entregado si la copia no aporta un
valor fiable.

```bash
../venv/bin/python migrations/005_restore_equipment_from_backup.py /tmp/ikastxiki_backup.xlsx
../venv/bin/python migrations/005_restore_equipment_from_backup.py /tmp/ikastxiki_backup.xlsx \
  --apply --confirm RESTORE-EQUIPMENT-FROM-BACKUP
```

## Aceptación de inscripciones de jugadores

`006_accept_player_inscriptions.py` regulariza únicamente las inscripciones
vinculadas a una ficha de jugador de la temporada indicada. No crea ni elimina
registros, no modifica jugadores, familias o equipos y deja una auditoría. La
vista previa informa también de las inscripciones sin jugador, que se excluyen
deliberadamente para no aceptar expedientes no revisados.

```bash
../venv/bin/python migrations/006_accept_player_inscriptions.py --season 2026-2027
../venv/bin/python migrations/006_accept_player_inscriptions.py --season 2026-2027 \
  --apply --confirm ACCEPT-PLAYER-INSCRIPTIONS
```

## Corrección de equipación principal

`007_promote_primary_equipment.py` corrige las importaciones históricas donde
la equipación actual quedó guardada como segunda. Promueve nombre, dorsal y
tallas al conjunto principal, conserva la segunda equipación real vacía y
guarda los valores anteriores en una auditoría reversible. No se aplica si
detecta un dorsal o nombre principal ya introducido manualmente.

```bash
../venv/bin/python migrations/007_promote_primary_equipment.py
../venv/bin/python migrations/007_promote_primary_equipment.py \
  --apply --confirm PROMOTE-PRIMARY-EQUIPMENT
```
