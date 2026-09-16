import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth";
import { I18nProvider } from "../i18n";
import api from "../api";
import Callups from "./Callups";

jest.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}), { virtual: true });

jest.mock("../api", () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn() },
}));

const user = {
  permissions: {
    callups: ["read", "respond"],
    matches: ["read"],
    players: ["read"],
  },
};

const callups = [
  {
    id: "callup-active", equipo_nombre: "Alevín A", match: { rival: "Rival", fecha: "2026-10-01", hora: "10:00" },
    convocados: [{ player_id: "player-1", nombre: "Ane Prueba", estado: "pending" }],
    response_counts: { pending: 1, confirmed: 0, declined: 0 }, deadline_expired: false,
  },
  {
    id: "callup-complete", equipo_nombre: "Alevín A", match: { rival: "Otro rival", fecha: "2026-10-02", hora: "10:00" },
    convocados: [{ player_id: "player-1", nombre: "Ane Prueba", estado: "confirmed" }],
    response_counts: { pending: 0, confirmed: 1, declined: 0 }, deadline_expired: false,
  },
  {
    id: "callup-expired", equipo_nombre: "Alevín A", match: { rival: "Rival antiguo", fecha: "2026-09-01", hora: "10:00" },
    convocados: [{ player_id: "player-1", nombre: "Ane Prueba", estado: "pending" }],
    response_counts: { pending: 1, confirmed: 0, declined: 0 }, deadline_expired: true,
  },
];

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.confirm = jest.fn(() => true);
  window.prompt = jest.fn(() => "Viaje");
  api.get.mockImplementation((url) => {
    if (url === "/callups") return Promise.resolve({ data: callups });
    if (url === "/matches") return Promise.resolve({ data: [] });
    if (url === "/players") return Promise.resolve({ data: [{ id: "player-1", nombre: "Ane", apellidos: "Prueba" }] });
    return Promise.resolve({ data: [] });
  });
  api.patch.mockResolvedValue({ data: { updated_count: 1 } });
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("adds bulk response actions and keeps them disabled without pending players or after the deadline", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<AuthProvider user={user}><I18nProvider><Callups /></I18nProvider></AuthProvider>));
  await flush();

  expect(container.querySelector('[data-testid="bulk-confirm-callup-active"]').disabled).toBe(false);
  expect(container.querySelector('[data-testid="bulk-decline-callup-active"]').disabled).toBe(false);
  expect(container.querySelector('[data-testid="bulk-confirm-callup-complete"]').disabled).toBe(true);
  expect(container.querySelector('[data-testid="bulk-decline-callup-expired"]').disabled).toBe(true);

  await act(async () => container.querySelector('[data-testid="bulk-confirm-callup-active"]').click());
  await flush();
  expect(window.confirm).toHaveBeenCalledWith("¿Quieres confirmar todos los jugadores pendientes de esta convocatoria?");
  expect(api.patch).toHaveBeenCalledWith("/callups/callup-active/respond-bulk", { status: "confirmed", reason: null });

  await act(async () => container.querySelector('[data-testid="bulk-decline-callup-active"]').click());
  await flush();
  expect(window.prompt).toHaveBeenCalledWith("Motivo del rechazo (opcional)");
  expect(api.patch).toHaveBeenLastCalledWith("/callups/callup-active/respond-bulk", { status: "declined", reason: "Viaje" });

  await act(async () => root.unmount());
});
