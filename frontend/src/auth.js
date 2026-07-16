export const can = (user, resource, action = "read") =>
  Boolean(user?.permissions?.[resource]?.includes(action));

export const ROUTE_RESOURCES = {
  "/": "dashboard",
  "/inscripciones": "inscriptions",
  "/jugadores": "players",
  "/familias": "families",
  "/equipos": "teams",
  "/equipamiento": "equipment",
  "/entrenamientos": "trainings",
  "/partidos": "matches",
  "/convocatorias": "callups",
  "/estadisticas": "stats",
  "/pagos": "payments",
  "/autorizaciones": "authorizations",
  "/comunicacion": "communications",
  "/informes": "reports",
  "/configuracion": "settings",
  "/usuarios": "users",
};
