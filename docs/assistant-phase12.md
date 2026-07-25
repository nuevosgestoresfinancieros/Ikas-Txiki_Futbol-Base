# Fase 12 — Asistente híbrido de ayuda y gestión guiada

## Arquitectura y privacidad

El asistente separa dos canales:

1. **Interno seguro**: base de conocimiento, RBAC, ámbito, validaciones,
   duplicados, propuestas temporales, confirmación, ejecución y auditoría.
2. **Externo opcional**: solo recibe preguntas generales que superan una
   puerta de privacidad basada en lista permitida de contexto, clasificación
   temática, detección estructurada y detección de inyección. Sin transporte
   configurado, la ayuda local sigue disponible.

Las conversaciones no se persisten. Las propuestas permanecen en memoria como
máximo diez minutos, ligadas al usuario y al hash de la cookie de sesión. Son
de un solo uso y utilizan un nonce de confirmación. Las operaciones confirmadas
se registran en `internal_events`; nunca se guarda allí la conversación.

## Matriz de capacidades

| Intención | Módulo | Permiso reutilizado | Datos mínimos | Canal | Confirmación y auditoría |
|---|---|---|---|---|---|
| Ayuda contextual | Todos | `assistant.read` | ruta, rol, idioma | Interno/externo anonimizado | No escribe |
| Consulta cerrada de jugador/equipo/asistencia | Módulo correspondiente | permiso `read` existente | intención e id cuando proceda | Interno | No escribe |
| Crear jugador | Jugadores | `players.create` | nombre | Interno | Propuesta, confirmación, `internal_events` |
| Actualizar jugador | Jugadores | `players.edit` | id y cambios permitidos | Interno | Versión, propuesta y auditoría |
| Crear familia | Familias | `families.create` | campos permitidos | Interno | Propuesta y auditoría |
| Actualizar familia | Familias | `families.edit` | id y cambios permitidos | Interno | Versión, propuesta y auditoría |
| Relacionar jugador/familia | Jugadores | `players.edit` | ids válidos | Interno | Ámbito, propuesta y auditoría |
| Asignar equipo | Jugadores/equipos | `players.edit` | jugador y equipo | Interno | Equipo activo y compatible |
| Registrar inscripción | Inscripciones | `inscriptions.create` | nombre | Interno | Duplicados, propuesta y auditoría |
| Registrar asistencia | Entrenamientos | `attendance.edit` | entrenamiento, jugador, estado | Interno | Equipo/ámbito, historial y auditoría |
| Preparar convocatoria | Convocatorias | `callups.create` | partido | Interno | Partido/equipo, propuesta y auditoría |
| Actualizar equipamiento | Equipamiento | `equipment.edit` | jugador y cambios | Interno | Admite lista de equipaciones |

Los roles no reciben permisos nuevos. Cada intención consulta la matriz RBAC
existente antes de preparar y nuevamente antes de confirmar.

## Modelo de amenazas

| Riesgo | Protección |
|---|---|
| Datos personales enviados al proveedor | Puerta de privacidad, contexto en lista permitida y bloqueo completo |
| Prompt injection | Marcadores de inyección y acciones cerradas |
| Consulta o herramienta inventada | El proveedor no recibe acceso a DB ni nombres de herramientas |
| Manipulación de ids/campos | Lista cerrada de campos, relaciones y ámbito comprobados en backend |
| CSRF o confirmación ambigua | Cookie SameSite, cabecera explícita, nonce y botón “Confirmar cambio” |
| Repetición/reintento | Propuesta de un solo uso |
| Cambio concurrente | Comparación de `updated_at` entre vista previa y confirmación |
| Acceso desde otra cuenta/sesión | Vínculo a usuario y hash de sesión |
| Enumeración | Búsquedas y duplicados limitados al ámbito |
| XSS/enlaces externos | Texto React sin HTML, escape del proveedor y rutas internas permitidas |
| Abuso | Límites de longitud, frecuencia, tiempo y tamaño de historial local |
| Fuga en registros | No se registra el texto; auditoría mínima de operaciones confirmadas |

## Operaciones deliberadamente bloqueadas

- Eliminaciones.
- Importaciones Excel y operaciones masivas.
- Migraciones.
- Cambios económicos, recibos o remesas.
- Modificación de autorizaciones firmadas.
- Envío de comunicaciones.
- Consultas libres a MongoDB.
- Herramientas o endpoints sugeridos por el proveedor.
- Confirmación mediante un “sí” conversacional.
