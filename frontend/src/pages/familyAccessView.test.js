import { accessState, safeAccessError } from "./familyAccessView";

test("maps every security state to text and a non-color cue", () => {
  expect(accessState("active")).toEqual({ label: "Activa", tone: "emerald" });
  expect(accessState("duplicate_email").label).toBe("Correo duplicado");
  expect(accessState("unknown").label).toBe("Caso a revisar");
});

test("rejects backend details that could expose secrets or other addresses", () => {
  expect(safeAccessError({ response: { data: { detail: "token=https://secret" } } })).not.toContain("secret");
  expect(safeAccessError({ response: { data: { detail: "owner@example.test" } } })).not.toContain("owner");
  expect(safeAccessError({ response: { data: { detail: "El correo ya está asociado a otra cuenta" } } })).toContain("otra cuenta");
});

