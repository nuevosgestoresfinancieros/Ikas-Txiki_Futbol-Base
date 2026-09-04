# Decisión 008: equipación aislada por temporada

## Contexto

La plantilla de un equipo cambia entre temporadas y también pueden cambiar las
tallas, el dorsal, la entrega o las observaciones de material de cada jugador.
Guardar esos datos únicamente en `players` mezcla campañas y hace que una
corrección de la temporada nueva altere el histórico.

## Decisión

Se mantiene una única ficha personal en `players` y se añade el mapa opcional
`equipacion_por_temporada`, indexado por la cadena de temporada. Cada entrada
contiene solo los campos de equipación modificados para esa campaña. La API de
equipamiento acepta `temporada` en lectura y escritura; cuando hay una entrada
temporal, sus valores tienen prioridad y, para datos aún no migrados, se usa el
valor legado de `players` como fallback.

La pantalla muestra por defecto tarjetas con el resumen de cada jugador y del
equipo, pero conserva la tabla compacta y el CSV para revisiones masivas. La
segunda equipación se consulta, pero no se modifica desde este flujo porque su
fuente sigue siendo la ficha del jugador.

## Salvaguardas

- Editar con temporada nunca reemplaza los campos canónicos de equipación.
- Al copiar una temporada, la equipación disponible de origen se toma como
  instantánea inicial de la nueva temporada; después ambas campañas pueden
  evolucionar de forma independiente.
- Las respuestas de temporada priorizan la pertenencia (`team_memberships`)
  para equipo y dorsal, evitando mezclar jugadores de campañas distintas.
- Las peticiones sin `temporada` conservan el contrato legado para módulos y
  clientes existentes.
- No se crea una ficha personal ni una familia nueva al copiar o editar una
  temporada.
