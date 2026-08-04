import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth";
import { I18nProvider } from "../i18n";
import api from "../api";
import Trainings from "./Trainings";

jest.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}), { virtual: true });

jest.mock("../api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const admin = {
  permissions: {
    trainings: ["read", "create", "edit", "delete"],
    exercises: ["read"],
    "training-evaluations": ["read", "create", "edit"],
  },
};

const training = {
  id: "training-1", fecha: "2026-08-04", hora: "17:36", equipo_id: "team-1",
  equipo_nombre: "Equipo A", campo: "Campo 1", asistencia: [{ player_id: "player-1", estado: "presente" }],
  planned_exercises: [],
};

const evaluationListing = {
  team: { id: "team-1", nombre: "Equipo A" },
  players: [{ player_id: "player-1", player_name: "Ane Prueba", asistencia: "presente", evaluation: null, evaluation_status: "pending" }],
  summary: { total: 1, evaluated: 0, pending: 1, incomplete: 0, absent: 0 },
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
  api.get.mockImplementation((url) => {
    if (url === "/trainings") return Promise.resolve({ data: [training] });
    if (url === "/attendance/summary") return Promise.resolve({ data: { summary: { presente: 1, justificada: 0, injustificada: 0, lesion: 0, porcentaje_presencia: 100 }, alerts: [] } });
    if (url === "/teams") return Promise.resolve({ data: [{ id: "team-1", nombre: "Equipo A" }] });
    if (url === "/players") return Promise.resolve({ data: [{ id: "player-1", equipo_id: "team-1", nombre: "Ane", apellidos: "Prueba" }] });
    if (url === "/exercises") return Promise.resolve({ data: { items: [] } });
    if (url === "/training-templates") return Promise.resolve({ data: [] });
    if (url === "/training-evaluations/training/training-1") return Promise.resolve({ data: evaluationListing });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: {} });
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("exposes and opens evaluation from the real Entrenamientos session card", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<AuthProvider user={admin}><I18nProvider><Trainings /></I18nProvider></AuthProvider>);
  });
  await flush();

  const card = container.querySelector('[data-testid="training-card-training-1"]');
  const evaluationButton = card?.querySelector('[data-testid="evaluate-training-training-1"]');
  expect(card).toBeTruthy();
  expect(evaluationButton).toBeTruthy();
  expect(evaluationButton.textContent).toContain("Evaluar jugadores");
  expect(evaluationButton.getAttribute("aria-label")).toContain("Evaluar jugadores");
  evaluationButton.focus();
  expect(document.activeElement).toBe(evaluationButton);

  await act(async () => evaluationButton.click());
  await flush();

  expect(api.get).toHaveBeenCalledWith("/training-evaluations/training/training-1");
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).toBeTruthy();
  expect(dialog.textContent).toContain("Evaluaciones individuales");
  expect(dialog.textContent).toContain("Ane Prueba");

  await act(async () => root.unmount());
  container.remove();
});
