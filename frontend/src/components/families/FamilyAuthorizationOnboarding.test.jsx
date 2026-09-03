import React, { act } from "react";
import { createRoot } from "react-dom/client";
import api from "@/api";
import { I18nProvider } from "@/i18n";
import FamilyAuthorizationOnboarding from "./FamilyAuthorizationOnboarding";

jest.mock("@/api", () => ({ get: jest.fn(), post: jest.fn() }));

const portalData = {
  required: true,
  pending_count: 2,
  total_count: 3,
  family_parents: [
    { slot: 1, name: "Ana Uno", is_current: true },
    { slot: 2, name: "Bruno Dos", is_current: false },
  ],
  children: [{
    player_id: "player-1",
    name: "Ane Uno",
    pending_count: 2,
    authorizations: [
      { id: "auth-1", player_id: "player-1", tipo: "general", has_signed_file: false },
      { id: "auth-2", player_id: "player-1", tipo: "imagen", has_signed_file: false },
      { id: "auth-3", player_id: "player-1", tipo: "medica", has_signed_file: true },
    ],
  }],
};

const renderComponent = async (data = portalData, user = { role: "family", first_name: "Ana", last_name: "Uno" }) => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<I18nProvider><FamilyAuthorizationOnboarding data={data} user={user} onRefresh={jest.fn()} /></I18nProvider>));
  return { container, root };
};

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  localStorage.removeItem("lang");
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("shows progress, download, upload and electronic signature actions for pending documents", async () => {
  const { container, root } = await renderComponent();
  expect(container.querySelector('[data-testid="family-auth-onboarding"]')).not.toBeNull();
  expect(container.textContent).toContain("Progreso de autorizaciones");
  expect(container.textContent).toContain("2 / 3");
  expect(container.textContent).toContain("Subir documento firmado");
  expect(container.textContent).toContain("Firmar en la aplicación");
  expect(container.textContent).toContain("Documento recibido");
  await act(async () => root.unmount());
});

test("uploads the selected file through the family submit endpoint", async () => {
  api.post.mockResolvedValueOnce({ data: { ok: true, status: "firmada" } });
  const { container, root } = await renderComponent();
  const input = container.querySelector('input[type="file"]');
  const file = new File(["%PDF-1.7\n%%EOF"], "firmada.pdf", { type: "application/pdf" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(api.post).toHaveBeenCalledWith("/authorizations/auth-1/upload-signed", expect.any(FormData));
  expect(api.post.mock.calls[0][1].get("parent_slot")).toBe("1");
  await act(async () => root.unmount());
});

test("uses the selected parent slot when receiving a paper document", async () => {
  api.post.mockResolvedValueOnce({ data: { ok: true, status: "firmada" } });
  const { container, root } = await renderComponent();
  const selector = container.querySelector("#family-auth-parent");
  await act(async () => {
    selector.value = "2";
    selector.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const input = container.querySelector('input[type="file"]');
  const file = new File(["%PDF-1.7\n%%EOF"], "firmada.pdf", { type: "application/pdf" });
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  expect(api.post.mock.calls[0][1].get("parent_slot")).toBe("2");
  await act(async () => root.unmount());
});

test("renders all onboarding copy in Euskera as well", async () => {
  localStorage.setItem("lang", "eu");
  const { container, root } = await renderComponent();
  expect(container.textContent).toContain("Baimenen aurrerapena");
  expect(container.textContent).toContain("Aplikazioan sinatu");
  await act(async () => root.unmount());
});

test("does not render when there is no pending family documentation", async () => {
  const { container, root } = await renderComponent({ ...portalData, required: false, pending_count: 0 });
  expect(container.querySelector('[data-testid="family-auth-onboarding"]')).toBeNull();
  await act(async () => root.unmount());
});
