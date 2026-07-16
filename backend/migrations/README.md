# Migraciones de usuarios

La migración `001_users_rbac.py` es idempotente y se ejecuta en modo informativo por defecto:

```bash
../.venv/bin/python migrations/001_users_rbac.py
```

Para aplicarla de forma consciente, después de crear una copia de seguridad:

```bash
../.venv/bin/python migrations/001_users_rbac.py --apply
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
