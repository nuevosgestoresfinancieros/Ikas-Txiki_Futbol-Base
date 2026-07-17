import { createContext, useContext } from "react";

export const can = (user, resource, action = "read") =>
  Boolean(user?.permissions?.[resource]?.includes(action));

const AuthContext = createContext(null);

export const AuthProvider = ({ user, children }) => (
  <AuthContext.Provider value={user}>{children}</AuthContext.Provider>
);

export const usePermission = (resource, action = "read") =>
  can(useContext(AuthContext), resource, action);

export const PermissionGate = ({ resource, action = "read", children }) =>
  usePermission(resource, action) ? children : null;

export const ROUTE_RESOURCES = {
  "/": "dashboard",
  "/inscripciones": "inscriptions",
  "/jugadores": "players",
  "/familias": "families",
  "/equipos": "teams",
  "/equipamiento": "equipment",
  "/entrenamientos": "trainings",
  "/partidos": "matches",
  "/calendario": "calendar",
  "/convocatorias": "callups",
  "/estadisticas": "stats",
  "/pagos": "payments",
  "/autorizaciones": "authorizations",
  "/comunicacion": "communications",
  "/informes": "reports",
  "/configuracion": "settings",
  "/usuarios": "users",
};
