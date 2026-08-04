import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth";
import { I18nProvider } from "../i18n";
import api from "../api";
import Stats from "./Stats";

jest.mock("../api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const user = {
  permissions: {
    stats: ["read", "create", "edit", "delete", "export"],
  },
};

const summary = {
  summary: {
    active_players: { value: 1 }, teams: { value: 1 }, matches_scheduled: { value: 0 },
    matches_played: { value: 0 }, trainings_scheduled: { value: 0 }, trainings_completed: { value: 0 },
    attendance_records: { value: 0 }, results_registered: { value: 0 }, wins: { value: 0 },
    draws: { value: 0 }, losses: { value: 0 }, callups: { value: 0 },
  },
  attendance: {
    sessions_computable: { value: 0 }, sessions_pending: { value: 0 },
    porcentaje_presencia: { value: 0, numerator: 0, denominator: 0, unit: "percent" },
    by_team: [], trend: [],
  },
  matches: { results_registered: 0, goals_for: 0, goals_against: 0 },
  callups: { confirmed: 0, declined: 0, pending: 0 },
  quality: [], player_rows: [], manual: { records: [] }, pagination: { total: 0 },
};

const options = {
  seasons: ["2025-2026", "", null],
  categories: ["Alevín"],
  teams: [{ id: "team-a", name: "Equipo A" }, { id: "", name: "Sin identificador" }, { id: null, name: "Nulo" }],
  players: [{ id: "player-a", name: "Jugador A" }, { id: "", name: "Sin identificador" }],
  modalities: ["F11", ""],
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const pointerDown = (element) => {
  const event = new MouseEvent("pointerdown", { bubbles: true, button: 0 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  element.dispatchEvent(event);
};

const closeSelect = (element) => element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape", code: "Escape" }));

const click = (element) => element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

const renderStats = async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<AuthProvider user={user}><I18nProvider><Stats /></I18nProvider></AuthProvider>);
  });
  await flush();
  return { container, root };
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  api.get.mockImplementation((url) => {
    if (url === "/statistics/options") return Promise.resolve({ data: options });
    if (url === "/statistics/summary") return Promise.resolve({ data: summary });
    return Promise.resolve({ data: new Blob(["export"]) });
  });
});

afterEach(() => {
  jest.clearAllMocks();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("renders Radix statistics selects without empty item values and resets filters safely", async () => {
  const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  const view = await renderStats();
  expect(view.container.querySelector('[data-testid="stats-page"]')).toBeTruthy();
  expect(view.container.textContent).toContain("Filtros estadísticos");

  const initialSummary = api.get.mock.calls.find(([url]) => url === "/statistics/summary");
  expect(initialSummary[1].params).toEqual({ periodo: "weekly" });

  const selectors = [
    "statistics-season", "statistics-category", "statistics-team", "statistics-modality", "statistics-player",
    "statistics-active", "statistics-period",
  ];
  for (const testid of selectors) {
    const trigger = view.container.querySelector(`[data-testid="${testid}"]`);
    expect(trigger).toBeTruthy();
    await act(async () => {
      pointerDown(trigger);
      await Promise.resolve();
    });
    const items = [...document.querySelectorAll('[role="option"]')];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.getAttribute("value") !== "")).toBe(true);
    expect(items.every((item) => item.textContent.trim().length > 0)).toBe(true);
    await act(async () => {
      closeSelect(trigger);
      await Promise.resolve();
    });
  }

  const teamTrigger = view.container.querySelector('[data-testid="statistics-team"]');
  await act(async () => {
    pointerDown(teamTrigger);
    await Promise.resolve();
  });
  const teamItem = [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent.includes("Equipo A"));
  expect(teamItem).toBeTruthy();
  act(() => click(teamItem));
  await flush();
  const filteredSummary = api.get.mock.calls.filter(([url]) => url === "/statistics/summary").at(-1);
  expect(filteredSummary[1].params).toMatchObject({ periodo: "weekly", equipo_id: "team-a" });

  const clearButton = [...view.container.querySelectorAll("button")].find((button) => button.textContent.includes("Limpiar filtros"));
  expect(clearButton).toBeTruthy();
  act(() => click(clearButton));
  await flush();
  const resetSummary = api.get.mock.calls.filter(([url]) => url === "/statistics/summary").at(-1);
  expect(resetSummary[1].params).toEqual({ periodo: "weekly" });

  expect(errorSpy.mock.calls.flat().join(" ")).not.toContain("Select.Item");
  errorSpy.mockRestore();
  act(() => view.root.unmount());
  view.container.remove();
});
