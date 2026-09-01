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
  api.post.mockResolvedValue({ data: { summary: { accounts_created: 2, invitations_sent: 2, existing_accesses: 0, families_for_review: 0 } } });
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("processes multiple selected families directly and only shows aggregate result", async () => {
  api.get.mockResolvedValue({ data: [
    { family_id: "family-1", family_name: "Familia Uno", email: "uno@example.test" },
    { family_id: "family-2", family_name: "Familia Dos", email: null },
  ] });
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  await act(async () => root.render(<I18nProvider><BulkAccountProvisioning type="family" onCancel={jest.fn()} /></I18nProvider>)); await flush();
  const boxes = container.querySelectorAll('input[type="checkbox"]'); expect(boxes).toHaveLength(2);
  await act(async () => { boxes[0].click(); boxes[1].click(); });
  const create = [...container.querySelectorAll("button")].find((button) => button.textContent.includes("Crear accesos (2 familias)")); await act(async () => create.click()); await flush();
  expect(api.post).toHaveBeenCalledWith("/account-provisioning/families/invitations", { family_ids: ["family-1", "family-2"] });
  expect(container.textContent).toContain("Cuentas creadas"); expect(container.textContent).not.toContain("Confirmación final"); await act(async () => root.unmount());
});
