import { importPreparationError } from "./importPreparationView";

test("shows the validation detail returned by the import API", () => {
  expect(importPreparationError({ response: { status: 422, data: { detail: "Formato no compatible" } } }))
    .toBe("Formato no compatible");
});

test("distinguishes backend failures and network failures from invalid files", () => {
  expect(importPreparationError({ response: { status: 500, data: {} } }))
    .toBe("No se pudo preparar el archivo. (servidor 500)");
  expect(importPreparationError({ code: "ERR_NETWORK" }))
    .toBe("No se pudo conectar con el servidor. Comprueba que el backend esté publicado y activo.");
});
