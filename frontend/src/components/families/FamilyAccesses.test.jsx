import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import api from "@/api";
import { FamilyAccesses } from "./FamilyAccesses";

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

