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
