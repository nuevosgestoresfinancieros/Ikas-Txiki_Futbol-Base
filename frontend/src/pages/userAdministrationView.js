export const USER_STATUSES = ["active", "pending_activation", "suspended", "deactivated", "incomplete_link"];

export const normalizedStatus = (user) =>
  user.account_status || (user.active === false ? "deactivated" : "active");

// `access_state` is calculated and returned by the backend. Do not infer it
// from invitation, password, or lock fields in the administrative interface.
export const accessState = (user) => user.access_state || "blocked";


export const userDisplayName = (user) => {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || user.username || "—";
};

// Presentation-only distinction; the authorization role remains `admin`.
export const userRoleLabelKey = (user) =>
  user.role === "admin" && (user.username === "javier_flor" || user.email === "docentetics2025@gmail.com")
    ? "role_admin_secondary"
    : `role_${user.role}`;

export const filterUsers = (users, filters) => {
  const needle = (filters.search || "").trim().toLocaleLowerCase();
  return users.filter((user) => {
    const haystack = [user.first_name, user.last_name, user.username, user.email]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return (!needle || haystack.includes(needle))
      && (!filters.role || user.role === filters.role)
      && (!filters.status || normalizedStatus(user) === filters.status)
      && (!filters.teamId || (user.assigned_team_ids || []).includes(filters.teamId));
  });
};

export const userCounters = (users) => ({
  total: users.length,
  active: users.filter((user) => normalizedStatus(user) === "active").length,
  pending: users.filter((user) => normalizedStatus(user) === "pending_activation").length,
  suspended: users.filter((user) => normalizedStatus(user) === "suspended").length,
  deactivated: users.filter((user) => normalizedStatus(user) === "deactivated").length,
  incomplete: users.filter((user) => normalizedStatus(user) === "incomplete_link").length,
});

export const passwordChecks = (password) => ({
  length: password.length >= 12,
  upper: /[A-Z]/.test(password),
  lower: /[a-z]/.test(password),
  number: /\d/.test(password),
  symbol: /[^A-Za-z0-9]/.test(password),
});

export const allPasswordChecksPass = (password) => Object.values(passwordChecks(password)).every(Boolean);

export const ROLE_STEPS = {
  admin: { scope: "club", requiresLink: false },
  coordinator: { scope: "teams", requiresLink: true },
  coach: { scope: "teams", requiresLink: true },
  family: { scope: "family", requiresLink: true },
  player: { scope: "player", requiresLink: true },
};

export const wizardLinkComplete = (form) => {
  if (form.role === "admin") return true;
  if (["coach", "coordinator"].includes(form.role)) return (form.assigned_team_ids || []).length > 0;
  if (form.role === "family") return Boolean(form.family_id);
  return Boolean(form.player_id);
};

export const normalizedTeamOptions = (teams, { search = "", season = "" } = {}) => {
  const needle = search.trim().toLocaleLowerCase();
  const seen = new Set();
  return teams.filter((team) => {
    const name = String(team.nombre || "").trim();
    const key = `${name.toLocaleLowerCase()}::${team.categoria || ""}`;
    if (!name || name.toLocaleUpperCase() === "NO APLICA" || seen.has(key)) return false;
    if (season && team.temporada !== season) return false;
    if (needle && ![name, team.categoria, team.modalidad].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle)) return false;
    seen.add(key);
    return true;
  });
};

export const safeUsernameSuggestion = (firstName, lastName) => {
  const source = `${firstName || ""}_${lastName || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase().replace(/[^a-z0-9_-]/g, "").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return source === "admin" ? "" : source;
};

const USER_FIELD_LABELS = { username: "Nombre de usuario", email: "Correo electrónico", first_name: "Nombre", last_name: "Apellidos", phone: "Teléfono", assigned_team_ids: "Equipos asignados", assigned_category_ids: "Categorías asignadas" };
const SENSITIVE_DETAIL = /(?:token|contrase(?:ñ|n)a|password|secret|bearer|authorization|api[_ -]?key|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b)/i;
const safeBackendDetail = (detail) => typeof detail === "string" && detail.length <= 240 && !SENSITIVE_DETAIL.test(detail) ? detail.trim() : null;
export const userSaveFeedback = (requestError) => {
  const status = requestError?.response?.status;
  const detail = requestError?.response?.data?.detail;
  if (status === 409 && detail === "El correo ya está asociado a otra cuenta") return { kind: "error", field: "email", message: "No se ha podido guardar: el correo electrónico ya está asociado a otra cuenta." };
  if (status === 409 && detail === "El nombre de usuario ya existe") return { kind: "error", field: "username", message: "No se ha podido guardar: el nombre de usuario ya existe." };
  if (Array.isArray(detail) && detail.length) {
    const issue = detail[0] || {};
    const location = Array.isArray(issue.loc) ? issue.loc.filter((part) => part !== "body").at(-1) : null;
    const field = typeof location === "string" ? location : null;
    const reason = safeBackendDetail(issue.msg) || "valor no válido";
    return { kind: "error", field, message: `No se ha podido guardar: ${USER_FIELD_LABELS[field] || "Un campo"}: ${reason}.` };
  }
  const safeDetail = safeBackendDetail(detail);
  if (status === 422 && safeDetail && /equipo|equipos|NO APLICA/i.test(safeDetail)) return { kind: "error", field: "assigned_team_ids", message: `No se ha podido guardar: Equipos asignados: ${safeDetail}.` };
  if ((status === 400 || status === 403 || status === 422) && safeDetail) return { kind: "error", field: null, message: `No se ha podido guardar: ${safeDetail}.` };
  return { kind: "error", field: null, message: "No se ha podido guardar el usuario. Comprueba la conexión e inténtalo de nuevo." };
};
export const userSaveSuccessFeedback = (response) => ({ kind: "success", message: response?.invitation_token ? "Usuario creado correctamente. La invitación se ha generado, pero no se ha enviado por correo." : "Usuario creado correctamente." });
export const userFeedbackStep = (field) => (["username", "email", "first_name", "last_name", "phone"].includes(field) ? 1 : ["assigned_team_ids", "assigned_category_ids"].includes(field) ? 3 : field ? 4 : null);
