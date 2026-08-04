# Fase 2 — Evaluaciones individuales de entrenamientos

## Alcance

Las evaluaciones viven en `training_evaluations` y enlazan `training_id`,
`player_id`, `equipo_id`, `temporada`, el evaluador, las fechas y el estado.
La asistencia se lee exclusivamente de `trainings.asistencia`; no existe un
segundo registro de asistencia ni se generan puntuaciones para ausencias.

Las escalas deportivas son ordinales de 1 a 5. No representan mediciones
clínicas, diagnósticos, predicciones ni comparaciones públicas.

## Endpoints

- `GET /api/training-evaluations/training/{training_id}`: roster, asistencia,
  evaluaciones, pendientes e incompletas.
- `GET /api/training-evaluations/pending?training_id=...`: pendientes del
  entrenamiento.
- `GET /api/training-evaluations/player/{player_id}`: historial y auditoría.
- `POST /api/training-evaluations`: crea un borrador único.
- `PUT /api/training-evaluations/{evaluation_id}`: actualiza mientras no esté
  cerrado.
- `POST /api/training-evaluations/bulk`: guarda varias filas tras validar todo
  el lote.
- `POST /api/training-evaluations/{evaluation_id}/close`: cierre explícito.

## Integridad e índices

La aplicación inicializa de forma idempotente estos índices en la nueva
colección:

- `training_player_unique`: único sobre `(training_id, player_id)`, para
  impedir duplicados.
- `player_evaluation_history`: `(player_id, fecha_evaluacion DESC)`, para
  consultas históricas.

La validación completa se ejecuta antes de escribir una operación individual o
masiva. Las operaciones masivas se serializan por proceso y la unicidad queda
protegida también por MongoDB.

## RBAC y privacidad

Solo `admin`, `coordinator` y `coach` reciben el recurso
`training-evaluations`. Coordinadores y entrenadores quedan limitados a sus
equipos asignados. Familias y jugadores no tienen permiso para estos
endpoints, aunque conozcan su URL.

Las observaciones e incidencias no se incluyen en logs de aplicación; la
auditoría guarda únicamente autor, rol, identificadores de entrenamiento y
jugador, estado y campos modificados.

## Rollback propuesto

Antes de integrar o desplegar, conservar una copia de la base y del commit
anterior. Para revertir, se vuelve al commit anterior y se despliega ese
estado. La colección `training_evaluations` puede conservarse sin efecto sobre
los entrenamientos existentes; si se decide retirarla, se elimina únicamente
en una operación administrativa explícita y respaldada, nunca como parte de un
rollback automático.
