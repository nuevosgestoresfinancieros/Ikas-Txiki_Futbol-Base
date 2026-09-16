import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth";
import { I18nProvider } from "../i18n";
import api from "../api";
import Payments from "./Payments";

jest.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
}));

jest.mock("../api", () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

const admin = { permissions: { payments: ["read", "create", "edit", "delete"] } };
const players = [{ id: "player-1", nombre: "Ane", apellidos: "Histórica" }];
const holders = {
  "player-1": {
    default: "Ana Primera",
    options: [
      { value: "Ana Primera", label: "Ana Primera", slot: 1, is_default: true },
      { value: "Bea Segunda", label: "Bea Segunda", slot: 2, is_default: false },
    ],
  },
};

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

const renderPage = async (payment = null) => {
  api.get.mockImplementation((url) => {
    if (url === "/payments") return Promise.resolve({ data: payment ? [payment] : [] });
    if (url === "/players") return Promise.resolve({ data: players });
    if (url === "/payments/holders") return Promise.resolve({ data: holders });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: "payment-1" } });
  api.put.mockResolvedValue({ data: { id: "payment-1" } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <AuthProvider user={admin}><I18nProvider><Payments /></I18nProvider></AuthProvider>
  ));
  await flush();
  return { container, root };
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = jest.fn();
  window.history.replaceState({}, "", "/pagos");
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("creates a payment keeping the player and selected account holder", async () => {
  const { container, root } = await renderPage();
  await act(async () => container.querySelector('[data-testid="add-payment-btn"]').click());
  await act(async () => document.querySelector('[data-testid="payment-player"]').click());
  await act(async () => [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent === "Ane Histórica").click());
  await flush();
  expect(document.querySelector('[data-testid="payment-holder"] span')?.textContent).toBe("Ana Primera");
  await act(async () => document.querySelector('[data-testid="payment-holder"]').click());
  await act(async () => [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent === "Bea Segunda").click());
  await act(async () => document.querySelector('[data-testid="payment-save-btn"]').click());
  expect(api.post).toHaveBeenCalledWith("/payments", expect.objectContaining({
    player_id: "player-1", titular_cuenta: "Bea Segunda",
  }));
  await act(async () => root.unmount());
});

test("edits the account holder while showing player and holder separately", async () => {
  const payment = { id: "payment-1", player_id: "player-1", player_nombre: "Ane Histórica",
    titular_cuenta: "Ana Primera", concepto: "Cuota", importe_final: 100, estado: "pendiente" };
  const { container, root } = await renderPage(payment);
  expect(container.textContent).toContain("Jugador/a");
  expect(container.textContent).toContain("Titular de la cuenta");
  await act(async () => container.querySelector('[data-testid="edit-payment-payment-1"]').click());
  await act(async () => document.querySelector('[data-testid="payment-holder"]').click());
  await act(async () => [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent === "Bea Segunda").click());
  await act(async () => document.querySelector('[data-testid="payment-save-btn"]').click());
  expect(api.put).toHaveBeenCalledWith("/payments/payment-1", expect.objectContaining({
    player_id: "player-1", titular_cuenta: "Bea Segunda",
  }));
  await act(async () => root.unmount());
});
