# Decisión 007: plantillas independientes por temporada

## Contexto

Una ficha de jugador representa a una persona única, pero su equipo, dorsal,
posición y estado operativo pueden cambiar cada temporada. Guardar únicamente
`players.equipo_id` hacía que mover un jugador a la temporada siguiente borrase
la plantilla visible de la anterior.

## Decisión

Se mantiene una única ficha en `players` y se añade la colección
`team_memberships`, con una pertenencia por pareja `team_id`/`player_id` y su
`temporada`. La pertenencia conserva una instantánea de categoría, dorsal,
posición y estado. El botón de creación de temporada copia los equipos y crea nuevas
pertenencias para los mismos jugadores, generando identificadores nuevos para
los equipos.

La asignación ordinaria `players.equipo_id` sigue apuntando al equipo más
reciente para mantener compatibles los módulos existentes. Las consultas de
equipos y jugadores filtradas por temporada priorizan `team_memberships`, por
lo que una modificación de la nueva temporada no elimina la plantilla
histórica.

## Salvaguardas

- La operación exige administración y rechaza una temporada de destino que ya
  tenga equipos.
- Los equipos de origen y sus pertenencias existentes nunca se modifican.
- Si falla una escritura durante la copia, se eliminan únicamente los nuevos
  documentos y se restauran las asignaciones canónicas modificadas.
- La operación no duplica fichas personales, familias, autorizaciones ni
  credenciales.
- `team_memberships` forma parte de las operaciones de vaciado y de las copias
  técnicas de exportación.
