import React, { act } from "react";
import { createRoot } from "react-dom/client";
import api from "../api";
import { I18nProvider } from "../i18n";
import BulkAccountProvisioning from "./BulkAccountProvisioning";

jest.mock("../api", () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockResolvedValue({ data: [
    { family_id: "family-1", family_name: "Familia Uno", email: "uno@example.test", children: [{ id: "player-1", name: "Jugador Uno" }], status: "ready" },
    { family_id: "family-2", family_name: "Familia Dos", email: null, children: [], status: "missing_email" },
  ] });
  api.post.mockResolvedValue({ data: { sent: 1, results: [{ family_id: "family-1", status: "sent" }] } });
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("requires final confirmation before creating and sending selected family accounts", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<I18nProvider><BulkAccountProvisioning type="family" onCancel={jest.fn()} /></I18nProvider>));
  await flush();

  const checkboxes = container.querySelectorAll('input[type="checkbox"]');
  expect(checkboxes).toHaveLength(2);
  expect(checkboxes[1].disabled).toBe(true);
  expect(container.textContent).toContain("1 hijos inscritos: Jugador Uno");
  await act(async () => checkboxes[0].click());
  expect(api.post).not.toHaveBeenCalled();

  const review = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Revisar selección"));
  await act(async () => review.click());
  expect(api.post).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Confirmación final");

  const confirm = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Confirmar, crear y enviar"));
  await act(async () => confirm.click());
  await flush();
  expect(api.post).toHaveBeenCalledWith("/account-provisioning/families/invitations", { family_ids: ["family-1"] });
  expect(container.textContent).toContain("Proceso completado");
  await act(async () => root.unmount());
});
