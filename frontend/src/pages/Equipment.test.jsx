import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth";
import { I18nProvider } from "../i18n";
import api from "../api";
import Equipment from "./Equipment";

jest.mock("../api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(),
  },
}));

const admin = {
  permissions: { equipment: ["read", "edit", "export"] },
};

const seasons = ["2025-2026", "2026-2027"];
const teams = [
  { id: "team-current", nombre: "Alevín A", categoria: "Alevín", temporada: "2026-2027" },
  { id: "team-previous", nombre: "Alevín A", categoria: "Alevín", temporada: "2025-2026" },
];

const seasonalPlayer = {
  id: "player-1", nombre: "Ane", apellidos: "López", categoria: "Alevín", dorsal: "7",
  equipo_id: "team-current", equipo_nombre: "Alevín A", temporada: "2026-2027",
  talla_camiseta: "M", talla_pantalon: "M", talla_chandal: "", talla_medias: "", talla_calzado: "",
  equipacion_entregada: false, segunda_equipacion: {}, observaciones_material: "Pendiente chándal",
};

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, "", "/equipamiento");
  api.get.mockImplementation((url, config = {}) => {
    if (url === "/teams") return Promise.resolve({ data: teams });
    if (url === "/catalog-options") return Promise.resolve({ data: { temporadas: seasons, temporada_actual: "2026-2027" } });
    if (url === "/equipment") {
      const season = config.params?.temporada;
      return Promise.resolve({ data: season === "2025-2026" ? [] : [seasonalPlayer] });
    }
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: seasonalPlayer });
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("shows seasonal cards by default and keeps the compact table as an option", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => root.render(<AuthProvider user={admin}><I18nProvider><Equipment /></I18nProvider></AuthProvider>));
  await flush();

  expect(container.querySelector('[data-testid="equipment-season"]')?.value).toBe("2026-2027");
  expect(container.querySelector('[data-testid="equipment-card-player-1"]')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith("/equipment", { params: { temporada: "2026-2027" } });

  await act(async () => container.querySelector('[data-testid="equipment-table-view"]').click());
  expect(container.querySelector('[data-testid="equipment-table"]')).toBeTruthy();

  await act(async () => container.querySelector('[data-testid="equipment-cards-view"]').click());
  expect(container.querySelector('[data-testid="equipment-cards-view"]')?.getAttribute("aria-pressed")).toBe("true");

  await act(async () => root.unmount());
  container.remove();
});
