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
