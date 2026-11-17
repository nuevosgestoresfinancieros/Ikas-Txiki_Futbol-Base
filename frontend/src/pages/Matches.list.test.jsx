import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth";
import { I18nProvider } from "../i18n";
import api from "../api";
import Matches from "./Matches";
import { localIsoDate } from "../lib/matchView";

jest.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock("../api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const coach = { permissions: { matches: ["read", "create", "edit"], callups: ["read"], "match-reports": ["read"] } };
const family = { permissions: { matches: ["read"], callups: ["read"] } };

const shift = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return localIsoDate(d); };
const teams = [
  { id: "t-new", nombre: "Kañometa", temporada: "2026-2027" },
  { id: "t-old", nombre: "Kañometa", temporada: "2025-2026" },
  { id: "t-b", nombre: "Urkiola", temporada: "2026-2027" },
];
const matches = [
  { id: "far", equipo_id: "t-new", equipo_nombre: "Kañometa", equipo_temporada: "2026-2027", rival: "Lejano", fecha: shift(20), estado: "programado", condicion: "local", tipo: "liga" },
  { id: "near", equipo_id: "t-b", equipo_nombre: "Urkiola", equipo_temporada: "2026-2027", rival: "Cercano", fecha: shift(2), estado: "programado", condicion: "visitante", tipo: "liga" },
  { id: "won", equipo_id: "t-new", equipo_nombre: "Kañometa", equipo_temporada: "2026-2027", rival: "Ganado", fecha: shift(-3), estado: "jugado", resultado_propio: 3, resultado_rival: 1, condicion: "local", tipo: "liga", acta_estado: "closed" },
  { id: "lost", equipo_id: "t-b", equipo_nombre: "Urkiola", equipo_temporada: "2026-2027", rival: "Perdido", fecha: shift(-10), estado: "jugado", resultado_propio: 0, resultado_rival: 2, condicion: "visitante", tipo: "liga" },
  { id: "old", equipo_id: "t-old", equipo_nombre: "Kañometa", equipo_temporada: "2025-2026", rival: "Antiguo", fecha: "2026-03-01", estado: "jugado", resultado_propio: 1, resultado_rival: 1, condicion: "local", tipo: "liga" },
];

const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); };

const render = async (user = coach) => {
  api.get.mockImplementation((url) => {
    if (url === "/matches") return Promise.resolve({ data: matches });
    if (url === "/teams") return Promise.resolve({ data: teams });
    if (url === "/public/branding") return Promise.resolve({ data: { temporada_actual: "2026-2027" } });
    if (url === "/catalog-options") return Promise.resolve({ data: {} });
    return Promise.resolve({ data: [] });
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AuthProvider user={user}><I18nProvider><Matches /></I18nProvider></AuthProvider>));
  await flush();
  return { container, root };
};

const ids = (container, section) => [...container.querySelectorAll(`[data-testid="${section}"] [data-testid^="match-card-"]`)]
  .map((el) => el.dataset.testid.replace("match-card-", ""));

const choose = async (select, value) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("lang", "es");
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  localStorage.clear();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("orders upcoming and past matches for the current season by default", async () => {
  const { container, root } = await render();
  expect(ids(container, "matches-upcoming")).toEqual(["near", "far"]);
  expect(ids(container, "matches-past")).toEqual(["won", "lost"]);
  expect(container.querySelector('[data-testid="match-filter-season"]').value).toBe("2026-2027");
  act(() => root.unmount());
});

test("shows outcome and report status badges", async () => {
  const { container, root } = await render();
  expect(container.querySelector('[data-testid="match-outcome-won"]').textContent).toBe("V");
  expect(container.querySelector('[data-testid="match-outcome-lost"]').textContent).toBe("D");
  expect(container.querySelector('[data-testid="match-report-status-won"]').textContent).toContain("Acta cerrada");
  expect(container.querySelector('[data-testid="match-report-status-lost"]').textContent).toContain("Acta sin empezar");
  expect(container.querySelector('[data-testid="match-report-status-near"]')).toBeNull();
  act(() => root.unmount());
});

test("hides report status without match-report permission", async () => {
  const { container, root } = await render(family);
  expect(container.querySelector('[data-testid="match-outcome-won"]')).not.toBeNull();
  expect(container.querySelector('[data-testid^="match-report-status-"]')).toBeNull();
  act(() => root.unmount());
});

test("filters by season, team, status and rival search", async () => {
  const { container, root } = await render();
  await choose(container.querySelector('[data-testid="match-filter-season"]'), "");
  expect(ids(container, "matches-past")).toEqual(["won", "lost", "old"]);

  await choose(container.querySelector('[data-testid="match-filter-season"]'), "2026-2027");
  const teamSelect = container.querySelector('[data-testid="match-filter-team"]');
  expect([...teamSelect.options].map((o) => o.textContent)).toEqual(["Todos los equipos", "Kañometa · 2026-2027", "Urkiola · 2026-2027"]);
  await choose(teamSelect, "t-b");
  expect(ids(container, "matches-upcoming")).toEqual(["near"]);
  expect(ids(container, "matches-past")).toEqual(["lost"]);

  await choose(teamSelect, "");
  await choose(container.querySelector('[data-testid="match-filter-status"]'), "jugado");
  expect(ids(container, "matches-upcoming")).toEqual([]);
  expect(ids(container, "matches-past")).toEqual(["won", "lost"]);

  const input = container.querySelector('[data-testid="match-search"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "ganado");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(ids(container, "matches-past")).toEqual(["won"]);
  act(() => root.unmount());
});
