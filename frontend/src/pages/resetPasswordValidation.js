const COMMON_PASSWORDS = new Set(["password", "password123", "contraseña", "qwerty123", "admin123", "ikas-txiki", "ikastxiki", "123456789012"]);

export const passwordRequirements = (password) => [
  { id: "length", label: "Al menos 12 caracteres", valid: password.length >= 12 },
  { id: "upper", label: "Una letra mayúscula", valid: /[A-Z]/.test(password) },
  { id: "lower", label: "Una letra minúscula", valid: /[a-z]/.test(password) },
  { id: "number", label: "Un número", valid: /\d/.test(password) },
  { id: "symbol", label: "Un símbolo", valid: /[^A-Za-z0-9]/.test(password) },
  { id: "common", label: "No usar una contraseña demasiado común", valid: !COMMON_PASSWORDS.has(password.toLocaleLowerCase()) },
];

export const passwordIsValid = (password) => passwordRequirements(password).every((requirement) => requirement.valid);
