import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "../auth";
import { I18nProvider } from "../i18n";
import api from "../api";
import Families from "./Families";

jest.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock("../api", () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

const reader = { permissions: { families: ["read"] } };
const families = [
  { id: "f-1", progenitor1_nombre: "Miren Etxeberria", progenitor1_email: "miren@example.test", num_hijos: 1, hijos: [{ id: "h-1", nombre: "Iñaki" }], preferencia_comunicacion: "email" },
  { id: "f-2", progenitor1_nombre: "Laura Pérez", progenitor1_telefono: "600111222", num_hijos: 1, hijos: [{ id: "h-2", nombre: "Ane" }], preferencia_comunicacion: "telefono" },
];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/families" ? families : [] }));
});

afterEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

test("filters families by parent, child or phone ignoring accents", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(
    <AuthProvider user={reader}><I18nProvider><Families /></I18nProvider></AuthProvider>
  ));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const input = container.querySelector('[data-testid="family-search"]');
  const type = async (value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  };
  const visible = () => [...container.querySelectorAll('[data-testid^="family-card-"]')].map((el) => el.dataset.testid);

  expect(visible()).toEqual(["family-card-f-1", "family-card-f-2"]);
  await type("inaki");
  expect(visible()).toEqual(["family-card-f-1"]);
  await type("perez");
  expect(visible()).toEqual(["family-card-f-2"]);
  await type("600111");
  expect(visible()).toEqual(["family-card-f-2"]);
  await type("zzz");
  expect(visible()).toEqual([]);
  expect(container.querySelector('[data-testid="family-search-empty"]')).not.toBeNull();
  act(() => root.unmount());
});
