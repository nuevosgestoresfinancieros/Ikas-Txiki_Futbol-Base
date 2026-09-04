import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth";
import { I18nProvider } from "../i18n";
import api from "../api";
import Teams from "./Teams";

jest.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}), { virtual: true });

jest.mock("../api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
  },
}));

const admin = {
  permissions: { teams: ["read", "create", "edit", "delete"] },
};

const sourceTeam = {
  id: "team-old", nombre: "Alevín A", categoria: "Alevín", temporada: "2026-2027",
  estado: "activo", num_jugadores: 2, limite_jugadores: 18,
};

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  window.confirm = jest.fn(() => true);
  api.get.mockImplementation((url) => {
    if (url === "/teams") return Promise.resolve({ data: [sourceTeam] });
    if (url === "/categories") return Promise.resolve({ data: [{ name: "Alevín" }] });
    if (url === "/catalog-options") return Promise.resolve({ data: { temporadas: ["2026-2027"] } });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { teams_created: 1, players_assigned: 2 } });
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("creates the next season from the selected source season", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => root.render(<AuthProvider user={admin}><I18nProvider><Teams /></I18nProvider></AuthProvider>));
  await flush();

  const createButton = container.querySelector('[data-testid="create-season-btn"]');
  expect(createButton).toBeTruthy();
  await act(async () => createButton.click());
  await flush();

  expect(document.querySelector('[data-testid="season-copy-source"]')).toBeTruthy();
  expect(document.querySelector('[data-testid="season-copy-target"]')?.value).toBe("2027-2028");
  await act(async () => document.querySelector('[data-testid="season-copy-submit"]').click());
  await flush();

  expect(window.confirm).toHaveBeenCalled();
  expect(api.post).toHaveBeenCalledWith("/teams/season-copy", {
    source_season: "2026-2027", target_season: "2027-2028",
  });

  await act(async () => root.unmount());
  container.remove();
});
