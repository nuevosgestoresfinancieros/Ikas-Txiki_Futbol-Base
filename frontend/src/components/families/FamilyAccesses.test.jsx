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
  api.get.mockClear();
  api.post.mockReset();
  api.get.mockResolvedValue({ data: { accesses: [
    { slot: 1, state: "active", user_id: "user-1", allowed_actions: ["block", "view_account"] },
    { slot: 2, state: "pending_activation", user_id: "user-2", allowed_actions: ["resend_invitation", "view_account"] },
  ] } });
});

afterEach(() => { global.IS_REACT_ACT_ENVIRONMENT = false; });
test("renders two independent accessible cards without secret material", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccesses form={form} setField={jest.fn()} enabled isPersisted /></I18nProvider>));
  expect(host.querySelectorAll("[data-testid^='family-access-']")).toHaveLength(2);
  expect(host.textContent).toContain("Activa");
  expect(host.textContent).toContain("Pendiente de activación");
  expect(host.textContent).toContain("Ver cuenta");
  expect(host.textContent).not.toMatch(new RegExp("token|hash|https?://", "i"));
  expect(host.textContent).toContain("Los accesos se crean únicamente allí");
  await act(async () => root.unmount());
});

test("requires a saved, checked and valid family access before sending", async () => {
  api.get.mockResolvedValue({ data: { accesses: [
    { slot: 1, state: "eligible", allowed_actions: ["generate_invitation"] },
    { slot: 2, state: "no_access", allowed_actions: [] },
  ] } });
  api.post.mockResolvedValue({ data: { delivery: "sent" } });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccesses form={{ ...form, progenitor2_crear_acceso: false }} setField={jest.fn()} enabled isPersisted /></I18nProvider>));
  await act(async () => { await Promise.resolve(); });
  const send = host.querySelector("[data-testid='send-family-invitation-1']");
  const unchecked = host.querySelector("[data-testid='send-family-invitation-2']");
  expect(send).toBeTruthy();
  expect(send.disabled).toBe(false);
  expect(unchecked).toBeTruthy();
  expect(unchecked.disabled).toBe(true);

  await act(async () => send.click());
  expect(document.body.textContent).toContain("a***@example.test");
  const confirmation = [...document.body.querySelectorAll("button")].find((button) => button.textContent.includes("Enviar invitación") && button !== send);
  expect(confirmation).toBeTruthy();
  await act(async () => confirmation.click());
  expect(api.post).toHaveBeenCalledWith("/family-access/families/family-1/1/invitation", { confirmation: "ENVIAR INVITACIÓN" });
  expect(api.get.mock.calls.filter(([url]) => url === "/family-access/families/family-1")).toHaveLength(2);
  expect(host.textContent).toContain("Invitación enviada correctamente.");
  await act(async () => root.unmount());
});

test("disables an unsaved invitation and explains that the family must be saved first", async () => {
  api.get.mockResolvedValue({ data: { accesses: [{ slot: 1, state: "eligible", allowed_actions: ["generate_invitation"] }] } });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccesses form={form} setField={jest.fn()} enabled isPersisted={false} /></I18nProvider>));
  await act(async () => { await Promise.resolve(); });
  const send = host.querySelector("[data-testid='send-family-invitation-1']");
  expect(send).toBeTruthy();
  expect(send.disabled).toBe(true);
  expect(host.textContent).toContain("Guarda la ficha antes de enviar la invitación.");
  await act(async () => root.unmount());
});

test("resends a failed invitation and does not claim delivery when the API returns pending", async () => {
  api.get.mockResolvedValue({ data: { accesses: [{
    slot: 1, state: "pending_activation", user_id: "user-1",
    invitation_delivery: { status: "failed", error: "smtp_connection_error" },
    allowed_actions: ["resend_invitation", "view_account"],
  }] } });
  api.post.mockResolvedValue({ data: { delivery: "pending", delivery_error: "delivery_disabled" } });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccesses form={form} setField={jest.fn()} enabled isPersisted /></I18nProvider>));
  await act(async () => { await Promise.resolve(); });
  const resend = host.querySelector("[data-testid='resend-family-invitation-1']");
  expect(resend).toBeTruthy();
  expect(resend.disabled).toBe(false);
  await act(async () => resend.click());
  const confirmation = [...document.body.querySelectorAll("button")].find((button) => button.textContent.includes("Reenviar invitación") && button !== resend);
  expect(confirmation).toBeTruthy();
  await act(async () => confirmation.click());
  expect(api.post).toHaveBeenCalledWith("/family-access/families/family-1/1/invitation/resend", { confirmation: "REENVIAR INVITACIÓN" });
  expect(api.get.mock.calls.filter(([url]) => url === "/family-access/families/family-1")).toHaveLength(2);
  expect(host.textContent).toContain("La invitación no se ha enviado.");
  expect(host.textContent).toContain("delivery_disabled");
  expect(host.textContent).not.toContain("Invitación enviada correctamente.");
  await act(async () => root.unmount());
});

test("keeps an unconfirmed email disabled even after the family was saved", async () => {
  api.get.mockResolvedValue({ data: { accesses: [{ slot: 1, state: "eligible", email_confirmed: false, allowed_actions: ["generate_invitation"] }] } });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccesses form={form} setField={jest.fn()} enabled isPersisted /></I18nProvider>));
  await act(async () => { await Promise.resolve(); });
  const send = host.querySelector("[data-testid='send-family-invitation-1']");
  expect(send.disabled).toBe(true);
  expect(host.textContent).toContain("Confirma el correo en la ficha antes de enviar.");
  await act(async () => root.unmount());
});

test("shows why an unconfirmed access is disabled and does not ask to confirm an active account", async () => {
  api.get.mockResolvedValue({ data: { accesses: [
    { slot: 1, state: "email_unconfirmed", email_confirmed: false, allowed_actions: [] },
    { slot: 2, state: "active", email_confirmed: false, user_id: "active-user", allowed_actions: ["view_account"] },
  ] } });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccesses form={form} setField={jest.fn()} enabled isPersisted /></I18nProvider>));
  await act(async () => { await Promise.resolve(); });
  const send = host.querySelector("[data-testid='send-family-invitation-1']");
  expect(send).toBeTruthy();
  expect(send.disabled).toBe(true);
  expect(host.textContent).toContain("Confirma el correo en la ficha antes de enviar.");
  expect(host.querySelector("[data-testid='send-family-invitation-2']")).toBeNull();
  const activeCard = host.querySelector("[data-testid='family-access-2']");
  expect(activeCard.textContent).toContain("Esta cuenta se gestiona desde Usuarios y permisos");
  expect(activeCard.textContent).not.toContain("Confirma el correo en la ficha antes de enviar.");
  await act(async () => root.unmount());
});

test("uses a new invitation action only for an expired link and never for blocked access", async () => {
  api.get.mockResolvedValue({ data: { accesses: [
    { slot: 1, state: "invitation_expired", user_id: "expired-user", allowed_actions: ["generate_invitation"] },
    { slot: 2, state: "blocked", user_id: "blocked-user", allowed_actions: ["view_account"] },
  ] } });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccesses form={form} setField={jest.fn()} enabled isPersisted /></I18nProvider>));
  await act(async () => { await Promise.resolve(); });
  expect(host.querySelector("[data-testid='send-family-invitation-1']").textContent).toContain("Enviar nueva invitación");
  expect(host.querySelector("[data-testid='send-family-invitation-2']")).toBeNull();
  await act(async () => root.unmount());
});

test("renders invitation actions in Basque", async () => {
  localStorage.setItem("lang", "eu");
  api.get.mockResolvedValue({ data: { accesses: [{ slot: 1, state: "eligible", allowed_actions: ["generate_invitation"] }] } });
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccesses form={form} setField={jest.fn()} enabled isPersisted /></I18nProvider>));
  await act(async () => { await Promise.resolve(); });
  expect(host.textContent).toContain("Gonbidapena bidali");
  await act(async () => root.unmount());
  localStorage.setItem("lang", "es");
});

test("does not render family invitation controls when permissions are absent", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(<I18nProvider><FamilyAccesses form={form} setField={jest.fn()} enabled={false} isPersisted /></I18nProvider>));
  expect(host.textContent).toBe("");
  expect(api.get).not.toHaveBeenCalled();
  expect(api.post).not.toHaveBeenCalled();
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
