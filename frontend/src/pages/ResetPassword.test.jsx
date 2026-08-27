import { passwordIsValid, passwordRequirements } from "./resetPasswordValidation";

test("refleja todos los requisitos reales de contraseña", () => {
  expect(passwordRequirements("New-Secure-Password-2026!").every((rule) => rule.valid)).toBe(true);
  expect(passwordIsValid("New-Secure-Password-2026!")).toBe(true);
  expect(passwordIsValid("password123")).toBe(false);
  expect(passwordIsValid("solo-minusculas-2026!")).toBe(false);
});

test("marca las contraseñas comunes aunque cumplan formato", () => {
  const common = passwordRequirements("IKASTXIKI").find((rule) => rule.id === "common");
  expect(common.valid).toBe(false);
});
