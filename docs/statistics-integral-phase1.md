# Fase 1 — Estadísticas integrales

La API de estadísticas (`/api/statistics/summary`) calcula los indicadores en
memoria a partir de jugadores, equipos, partidos, convocatorias y
entrenamientos. No se guardan totales, porcentajes, medias ni series derivadas.

## Reglas de cálculo

- Una sesión de entrenamiento cancelada no es computable. Una sesión sin filas
  de asistencia queda marcada como pendiente; no se convierte en ausencias.
- El porcentaje de asistencia usa `presencias / registros de asistencia válidos`.
  El resultado incluye numerador, denominador y periodo. Si el denominador es
  cero, el estado es `no_data` y el valor es `null`.
- Un partido cuenta como disputado solo con estado `jugado`. Un partido
  aplazado, suspendido o cancelado no cuenta como resultado. Sin los dos goles
  enteros no se clasifica como victoria, empate o derrota y no aporta goles.
- Una convocatoria sin respuesta se cuenta como `pending`, nunca como rechazo.
- Los registros manuales de `stats` se devuelven en un bloque separado y no se
  mezclan con las métricas calculadas.

## Filtros y privacidad

La consulta admite temporada, categoría, equipo, jugador, modalidad F7/F11,
intervalo de fechas, estado del jugador y periodo semanal/mensual. Los equipos
y jugadores se validan contra el ámbito del usuario en el backend. La vista y
las exportaciones están restringidas a administrador, coordinador y entrenador;
familias y jugadores conservan la compatibilidad de los endpoints históricos,
pero no acceden a esta capa interna.

## Exportaciones y auditoría

`/api/statistics/export.pdf` y `/api/statistics/export.xlsx` reutilizan los
renderizadores profesionales. Incluyen usuario generador, fecha, filtros,
indicadores y avisos de calidad. Cada exportación crea un evento
`statistics.exported` en `internal_events` sin copiar datos personales en el
detalle de auditoría.
