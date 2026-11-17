import { modalitySuggestion, withSuggestedModality } from "./modality";

test("suggests F7/F11 from the category like the import rule", () => {
  expect(modalitySuggestion("Alevín")).toBe("F7");
  expect(modalitySuggestion("PREBENJAMIN")).toBe("F7");
  expect(modalitySuggestion("CHUPETIN")).toBe("F7");
  expect(modalitySuggestion("Infantil")).toBe("F11");
  expect(modalitySuggestion("Cadete femenino")).toBe("F11");
  expect(modalitySuggestion("Veteranos")).toBe("");
  expect(modalitySuggestion("")).toBe("");
});

test("only fills the modality when the team has none", () => {
  expect(withSuggestedModality({ categoria: "Benjamín" }).modalidad).toBe("F7");
  expect(withSuggestedModality({ categoria: "Benjamín", modalidad: "F11" }).modalidad).toBe("F11");
  expect(withSuggestedModality({ categoria: "Otra" }).modalidad).toBe("");
});
