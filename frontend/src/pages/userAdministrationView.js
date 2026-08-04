export const USER_STATUSES = ["active", "pending_activation", "suspended", "deactivated", "incomplete_link"];

export const normalizedStatus = (user) =>
  user.account_status || (user.active === false ? "deactivated" : "active");

export const userDisplayName = (user) => {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || user.username || "—";
};

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
