import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth";
import { I18nProvider, translations } from "../i18n";
import api from "../api";
import Matches from "./Matches";

jest.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock("../api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const admin = {
  permissions: {
    matches: ["read", "create", "edit", "delete"],
    callups: ["read", "create"],
    "match-reports": ["read", "create", "edit", "export", "administer"],
  },
};

const family = { permissions: { matches: ["read"], callups: ["read"] } };
const match = {
  id: "match-1", equipo_id: "team-1", equipo_nombre: "Equipo A", rival: "Rival B",
  fecha: "2026-08-10", hora: "10:00", condicion: "local", tipo: "liga", estado: "jugado",
  resultado_propio: 1, resultado_rival: 0,
};

const baseReport = {
  report: false,
  header: { match_id: "match-1", team_name: "Equipo A", rival: "Rival B", modalidad: "F7", result: { own: 1, rival: 0 } },
  callup: { exists: true, count: 1, responses: { confirmed: 1, declined: 0, pending: 0 } },
  candidates: [
    { id: "player-1", name: "Ane Prueba", shirt_number: 8 },
    { id: "player-2", name: "June Prueba", shirt_number: 9 },
  ],
  configuration: {
    code: "F7", total_minutes: 60,
    periods: [
      { id: "T1", name_es: "Tiempo 1", name_eu: "1. denbora", planned_minutes: 20 },
      { id: "T2", name_es: "Tiempo 2", name_eu: "2. denbora", planned_minutes: 20 },
      { id: "T3", name_es: "Tiempo 3", name_eu: "3. denbora", planned_minutes: 20 },
    ],
  },
};

const createdReport = {
  ...baseReport, report: true, id: "report-1", status: "draft", version: 1, history: [], internal_notes: "",
  participants: [{
    player_id: "player-1", called_up: true, callup_response: "confirmed", role: "starter",
    played: true, minutes: 60, period_ids: ["T1", "T2", "T3"], entries: 0, exits: 0, changes: [], goals: 0,
    own_goals: 0, incidents: [], internal_notes: "", origin: "manual",
  }, {
    player_id: "player-2", called_up: true, callup_response: "confirmed", role: "substitute",
    played: true, minutes: 20, period_ids: ["T3"], entries: 0, exits: 0, changes: [], goals: 0,
    own_goals: 0, incidents: [], internal_notes: "", origin: "manual",
  }],
  substitutions: [], goal_events: [],
};

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

const renderMatches = async (user) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AuthProvider user={user}><I18nProvider><Matches /></I18nProvider></AuthProvider>));
  await flush();
  return { container, root };
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("lang", "es");
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.confirm = jest.fn(() => true);
  URL.createObjectURL = jest.fn(() => "blob:match-report");
  URL.revokeObjectURL = jest.fn();
  window.HTMLAnchorElement.prototype.click = jest.fn();
  api.get.mockImplementation((url) => {
    if (url === "/matches") return Promise.resolve({ data: [match] });
    if (url === "/callups") return Promise.resolve({ data: [] });
    if (url === "/players") return Promise.resolve({ data: [{ id: "player-1", nombre: "Ane", apellidos: "Prueba" }, { id: "player-2", nombre: "June", apellidos: "Prueba" }] });
    if (url === "/teams") return Promise.resolve({ data: [{ id: "team-1", nombre: "Equipo A" }] });
    if (url === "/match-reports/match/match-1") return Promise.resolve({ data: baseReport });
    return Promise.resolve({ data: [] });
  });
  api.post.mockImplementation((url) => {
    if (url === "/match-reports/match/match-1") return Promise.resolve({ data: createdReport });
    if (url.endsWith("/validate")) return Promise.resolve({ data: { errors: [], warnings: [] } });
    return Promise.resolve({ data: createdReport });
  });
  api.put.mockResolvedValue({ data: { ...createdReport, version: 2, validation: { errors: [], warnings: [] } } });
  api.delete.mockResolvedValue({ data: {} });
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  localStorage.clear();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("opens Acta y rendimiento from the real Partidos card and preserves draft data after a save error", async () => {
  const { container, root } = await renderMatches(admin);
  const card = container.querySelector('[data-testid="match-card-match-1"]');
  const action = card?.querySelector('[data-testid="match-report-match-1"]');
  expect(action).toBeTruthy();
  expect(action.textContent).toContain("Acta y rendimiento");
  action.focus();
  expect(document.activeElement).toBe(action);

  await act(async () => action.click());
  await flush();
  expect(api.get).toHaveBeenCalledWith("/match-reports/match/match-1");
  expect(document.querySelector('[data-testid="match-report-dialog"]')).toBeTruthy();
  const create = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Crear borrador"));
  expect(create).toBeTruthy();

  await act(async () => create.click());
  await flush();
  expect(document.querySelector('[data-testid="match-report-player-player-1"]')).toBeTruthy();
  const roleTrigger = document.querySelector('[data-testid="match-report-role-player-1"]');
  expect(roleTrigger).toBeTruthy();
  expect(roleTrigger.textContent).toContain("Titular");

  const addSubstitution = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Añadir sustitución"));
  const addGoal = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Añadir gol"));
  await act(async () => { addSubstitution.click(); addGoal.click(); });
  expect(document.querySelectorAll('[aria-label^="Eliminar sustitución"]').length).toBe(1);
  expect(document.querySelectorAll('[aria-label^="Eliminar gol"]').length).toBe(1);

  const notes = document.querySelector('[data-testid="match-report-general-notes"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(
      notes,
      "Texto que debe conservarse",
    );
    notes.dispatchEvent(new Event("input", { bubbles: true }));
  });
  api.put.mockRejectedValueOnce({ response: { data: { detail: "Conflicto controlado" } } });
  await act(async () => document.querySelector('[data-testid="match-report-save"]').click());
  await flush();
  expect(api.put.mock.calls[0][1].substitutions).toHaveLength(1);
  expect(api.put.mock.calls[0][1].goal_events).toHaveLength(1);
  expect(document.querySelector('[data-testid="match-report-general-notes"]').value).toBe("Texto que debe conservarse");
  expect(document.querySelector('[role="alert"]').textContent).toContain("Conflicto controlado");

  await act(async () => root.unmount());
  container.remove();
});

test("hides the internal match report action from family users", async () => {
  const { container, root } = await renderMatches(family);
  expect(container.querySelector('[data-testid="match-card-match-1"]')).toBeTruthy();
  expect(container.querySelector('[data-testid="match-report-match-1"]')).toBeNull();
  await act(async () => root.unmount());
  container.remove();
});

test("saves dirty changes before validation and closes the persisted version", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/matches") return Promise.resolve({ data: [match] });
    if (url === "/players" || url === "/teams" || url === "/callups") return Promise.resolve({ data: [] });
    if (url === "/match-reports/match/match-1") return Promise.resolve({ data: createdReport });
    return Promise.resolve({ data: [] });
  });
  const savedReport = { ...createdReport, version: 2, internal_notes: "Cambio pendiente", validation: { errors: [], warnings: [] } };
  api.put.mockResolvedValue({ data: savedReport });
  api.post.mockImplementation((url, payload) => {
    if (url.endsWith("/validate")) return Promise.resolve({ data: { errors: [], warnings: [] } });
    if (url.endsWith("/close")) return Promise.resolve({ data: { ...savedReport, status: "closed", version: 3 } });
    return Promise.resolve({ data: createdReport });
  });

  const { container, root } = await renderMatches(admin);
  await act(async () => container.querySelector('[data-testid="match-report-match-1"]').click());
  await flush();
  const notes = document.querySelector('[data-testid="match-report-general-notes"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(notes, "Cambio pendiente");
    notes.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const close = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Cerrar acta"));
  await act(async () => close.click());
  await flush();

  expect(api.put).toHaveBeenCalledWith("/match-reports/match/match-1", expect.objectContaining({
    version: 1,
    internal_notes: "Cambio pendiente",
  }));
  expect(api.post).toHaveBeenCalledWith("/match-reports/match/match-1/close", expect.objectContaining({ version: 2 }));
  const saveOrder = api.put.mock.invocationCallOrder[0];
  const validateOrder = api.post.mock.invocationCallOrder.find((_, index) => api.post.mock.calls[index][0].endsWith("/validate"));
  const closeOrder = api.post.mock.invocationCallOrder.find((_, index) => api.post.mock.calls[index][0].endsWith("/close"));
  expect(saveOrder).toBeLessThan(validateOrder);
  expect(validateOrder).toBeLessThan(closeOrder);

  await act(async () => root.unmount());
  container.remove();
});

test("prevents duplicate draft creation even when the action is activated twice", async () => {
  let resolveCreate;
  const pendingCreate = new Promise((resolve) => { resolveCreate = resolve; });
  api.post.mockImplementation((url) => (
    url === "/match-reports/match/match-1" ? pendingCreate : Promise.resolve({ data: createdReport })
  ));
  const { container, root } = await renderMatches(admin);
  await act(async () => container.querySelector('[data-testid="match-report-match-1"]').click());
  await flush();
  const create = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Crear borrador"));
  await act(async () => { create.click(); create.click(); });
  expect(api.post.mock.calls.filter(([url]) => url === "/match-reports/match/match-1")).toHaveLength(1);
  resolveCreate({ data: createdReport });
  await flush();
  await act(async () => root.unmount());
  container.remove();
});

test("locks a closed report and exposes audited reopening only to administrators", async () => {
  const closedReport = {
    ...createdReport,
    status: "closed",
    version: 3,
    history: [{ id: "event-1", action: "closed", actor_role: "coach", created_at: "2026-08-10T12:00:00Z" }],
  };
  api.get.mockImplementation((url) => {
    if (url === "/matches") return Promise.resolve({ data: [match] });
    if (url === "/players") return Promise.resolve({ data: [] });
    if (url === "/teams") return Promise.resolve({ data: [] });
    if (url === "/callups") return Promise.resolve({ data: [] });
    if (url === "/match-reports/match/match-1") return Promise.resolve({ data: closedReport });
    if (url === "/match-reports/match/match-1/export.pdf") return Promise.resolve({ data: new Blob(["%PDF-test"]) });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { ...closedReport, status: "reopened", version: 4 } });
  const { container, root } = await renderMatches(admin);
  await act(async () => container.querySelector('[data-testid="match-report-match-1"]').click());
  await flush();
  expect(document.querySelector('[data-testid="match-report-general-notes"]').disabled).toBe(true);
  expect(document.querySelector('[data-testid="match-report-save"]')).toBeNull();
  const exportButton = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Exportar acta PDF"));
  await act(async () => exportButton.click());
  await flush();
  expect(api.get).toHaveBeenCalledWith("/match-reports/match/match-1/export.pdf", { params: { lang: "es" }, responseType: "blob" });
  const reason = document.querySelector('[data-testid="match-report-reopen-reason"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(reason, "Corrección documentada");
    reason.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const reopen = [...document.querySelectorAll("button")].find((button) => button.textContent.includes("Reabrir acta"));
  await act(async () => reopen.click());
  await flush();
  expect(api.post).toHaveBeenCalledWith("/match-reports/match/match-1/reopen", {
    version: 3,
    reason: "Corrección documentada",
  });
  await act(async () => root.unmount());
  container.remove();
});

test("provides complete ES and EU labels without empty Radix option values", () => {
  expect(translations.es.matchReportAction).toBe("Acta y rendimiento");
  expect(translations.eu.matchReportAction).toBe("Akta eta errendimendua");
  expect(["starter", "substitute", "did_not_play", "absent", "late_withdrawal", "not_called"]).not.toContain("");
  const esKeys = Object.keys(translations.es).filter((key) => key.startsWith("matchReport")).sort();
  const euKeys = Object.keys(translations.eu).filter((key) => key.startsWith("matchReport")).sort();
  expect(euKeys).toEqual(esKeys);
  expect(esKeys.every((key) => translations.es[key] && translations.eu[key])).toBe(true);
});

test("renders F11 periods and no-callup warning in Euskera from the real match flow", async () => {
  localStorage.setItem("lang", "eu");
  const f11Report = {
    ...createdReport,
    setup_warning: "Partidak ez du deialdirik",
    callup: { exists: false, count: 0, responses: {} },
    header: { ...createdReport.header, modalidad: "F11" },
    configuration: {
      code: "F11", total_minutes: 90, rules: { max_starters: 11 },
      periods: [{ id: "P1", planned_minutes: 45 }, { id: "P2", planned_minutes: 45 }],
    },
  };
  api.get.mockImplementation((url) => {
    if (url === "/matches") return Promise.resolve({ data: [match] });
    if (url === "/players" || url === "/teams" || url === "/callups") return Promise.resolve({ data: [] });
    if (url === "/match-reports/match/match-1") return Promise.resolve({ data: f11Report });
    return Promise.resolve({ data: [] });
  });
  const { container, root } = await renderMatches(admin);
  const action = container.querySelector('[data-testid="match-report-match-1"]');
  expect(action.textContent).toContain("Akta eta errendimendua");
  await act(async () => action.click());
  await flush();
  expect(document.body.textContent).toContain("Partidak ez du deialdirik");
  expect(document.body.textContent).toContain("P1");
  expect(document.body.textContent).toContain("P2");
  await act(async () => root.unmount());
  container.remove();
});
