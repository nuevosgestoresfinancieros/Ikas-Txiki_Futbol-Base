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
vista previa con `--overrides` y revise el informe. Tras tener una copia de
MongoDB verificada, la única escritura posible requiere además:

```bash
../venv/bin/python migrations/004_restore_player_teams_from_backup.py /tmp/ikastxiki_backup.xlsx \
  --overrides /tmp/equipos-nuevos.json --apply --confirm RESTORE-ALL-PLAYER-TEAMS
```
