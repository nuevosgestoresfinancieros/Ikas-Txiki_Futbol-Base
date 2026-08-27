import { translations } from "../i18n";
import {
  allPasswordChecksPass, filterUsers, normalizedStatus, normalizedTeamOptions, passwordChecks,
  safeUsernameSuggestion, userCounters, userDisplayName, userRoleLabelKey, wizardLinkComplete,
} from "./userAdministrationView";

const users = [
  { id: "environment-admin", first_name: "Administrador del sistema", role: "admin", account_status: "active", system_account: true },
  { id: "coach", first_name: "Entrenador", last_name: "Ficticio", username: "coach.test", email: "coach@example.invalid", role: "coach", account_status: "active", assigned_team_ids: ["team-a"] },
  { id: "family", first_name: "Familia", username: "family.test", role: "family", account_status: "suspended", family_id: "family-a" },
  { id: "legacy", username: "legacy.test", role: "player", active: false },
];

test("filters users by search, role, status and team without changing source data", () => {
  expect(filterUsers(users, { search: "ficticio", role: "coach", status: "active", teamId: "team-a" })).toEqual([users[1]]);
  expect(filterUsers(users, { search: "", role: "family", status: "suspended", teamId: "" })).toEqual([users[2]]);
  expect(users).toHaveLength(4);
});

test("keeps legacy users compatible and counts every account state", () => {
  expect(normalizedStatus(users[3])).toBe("deactivated");
  expect(userCounters(users)).toEqual({ total: 4, active: 2, pending: 0, suspended: 1, deactivated: 1, incomplete: 0 });
});

test("uses identity first and supports the read-only system account", () => {
  expect(userDisplayName(users[0])).toBe("Administrador del sistema");
  expect(userDisplayName(users[1])).toBe("Entrenador Ficticio");
});

test("labels Javier as second system administrator without changing his admin role", () => {
  expect(userRoleLabelKey({ username: "javier_flor", role: "admin" })).toBe("role_admin_secondary");
  expect(userRoleLabelKey({ username: "admin", role: "admin" })).toBe("role_admin");
});

test("requires a strong confirmed-password shape", () => {
  expect(allPasswordChecksPass("Weak-password")).toBe(false);
  expect(allPasswordChecksPass("Secure-Test-2026!")).toBe(true);
  expect(passwordChecks("Secure-Test-2026!")).toEqual({ length: true, upper: true, lower: true, number: true, symbol: true });
});

test("contains complete Spanish and Basque administration translations", () => {
  ["createUser", "effectivePermissions", "accountStatus_suspended", "configuredOnServer", "recipientPreview", "excludedRecipients", "passwordMismatch", "permanentDeleteUser", "permanentDeletionChecking"].forEach((key) => {
    expect(translations.es[key]).toBeTruthy();
    expect(translations.eu[key]).toBeTruthy();
  });
});

test("validates wizard links by role without granting an empty global scope", () => {
  expect(wizardLinkComplete({ role: "admin" })).toBe(true);
  expect(wizardLinkComplete({ role: "coach", assigned_team_ids: [] })).toBe(false);
  expect(wizardLinkComplete({ role: "coach", assigned_team_ids: ["team-a"] })).toBe(true);
  expect(wizardLinkComplete({ role: "family", family_id: "" })).toBe(false);
  expect(wizardLinkComplete({ role: "player", player_id: "player-a" })).toBe(true);
});

test("normalizes the advanced team selector and excludes NO APLICA and duplicates", () => {
  const teams = [
    { id: "a", nombre: "Cadete A", categoria: "Cadete", temporada: "2026-2027", modalidad: "F11" },
    { id: "duplicate", nombre: " cadete a ", categoria: "Cadete", temporada: "2026-2027" },
    { id: "na", nombre: "NO APLICA" },
  ];
  expect(normalizedTeamOptions(teams, { search: "f11", season: "2026-2027" }).map((team) => team.id)).toEqual(["a"]);
});

test("suggests a safe normalized username but never admin", () => {
  expect(safeUsernameSuggestion("Áne", "Prueba López")).toBe("ane_pruebalopez");
  expect(safeUsernameSuggestion("admin", "")).toBe("");
});
