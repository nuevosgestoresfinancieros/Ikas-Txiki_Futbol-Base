import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "@/api";
import { I18nProvider } from "@/i18n";
import { FamilyAccessAdministration, FamilyAccesses } from "./FamilyAccesses";

jest.mock("@/api", () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn() }));
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });

const form = {
  id: "family-1", progenitor1_nombre: "Ana Uno", progenitor1_email: "ana@example.test",
  progenitor1_crear_acceso: true, progenitor1_email_confirmado: true,
  progenitor2_nombre: "Bea Dos", progenitor2_email: "bea@example.test",
  progenitor2_crear_acceso: true, progenitor2_email_confirmado: true,
};

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockResolvedValue({ data: { accesses: [
    { slot: 1, state: "active", user_id: "user-1", allowed_actions: ["block", "view_account"] },
    { slot: 2, state: "pending_activation", user_id: "user-2", allowed_actions: ["resend_invitation", "view_account"] },
  ] } });
});

afterEach(() => { global.IS_REACT_ACT_ENVIRONMENT = false; });
test("renders two independent accessible cards without secret material", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<FamilyAccesses form={form} setField={jest.fn()} enabled />));
  expect(host.querySelectorAll("[data-testid^='family-access-']")).toHaveLength(2);
  expect(host.textContent).toContain("Activa");
  expect(host.textContent).toContain("Pendiente de activación");
  expect(host.textContent).toContain("Ver cuenta");
  expect(host.textContent).not.toMatch(new RegExp("token|hash|https?://", "i"));
  expect(host.querySelectorAll("[aria-label^='Crear acceso para progenitor']")).toHaveLength(2);
  await act(async () => root.unmount());
});


test("shows an expanded accessible provisioning guide before the actions", async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/family-access/mode" ? { mode: "manual", delivery_enabled: false } : [] }));
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccessAdministration /></I18nProvider>));
  await act(async () => { await Promise.resolve(); });
  const guideButton = [...host.querySelectorAll("button")].find((button) => button.textContent.includes("¿Cómo funciona?"));
  const automaticButton = [...host.querySelectorAll("button")].find((button) => button.textContent.includes("Activar automático"));
  expect(guideButton).toBeTruthy();
  expect(guideButton.getAttribute("aria-expanded")).toBe("true");
  expect(host.textContent).toContain("No crea cuentas, no modifica datos y no envía correos.");
  expect(host.textContent).toContain("Nunca se muestran contraseñas, tokens, enlaces de activación ni datos sensibles.");
  expect(host.textContent).toContain("Relación con Usuarios y permisos");
  expect(host.textContent).toContain("Modificar el correo en la ficha de un jugador no crea ni envía invitaciones.");
  expect(guideButton.compareDocumentPosition(automaticButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await act(async () => guideButton.click());
  expect(guideButton.getAttribute("aria-expanded")).toBe("false");
  expect(host.querySelector("#family-provisioning-guide-content")).toBeNull();
  await act(async () => root.unmount());
});
