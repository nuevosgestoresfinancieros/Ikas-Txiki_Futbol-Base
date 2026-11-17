import { matchesSearch, normalizeSearchText } from "./textSearch";

test("normaliza mayúsculas y acentos", () => {
  expect(normalizeSearchText("  KAÑOMETA Álava ")).toBe("kanometa alava");
  expect(normalizeSearchText(null)).toBe("");
});

test("una búsqueda vacía coincide con todo", () => {
  expect(matchesSearch("", ["Ane"])).toBe(true);
  expect(matchesSearch("   ", [])).toBe(true);
});

test("exige todas las palabras en cualquiera de los campos", () => {
  const values = ["Ane Histórica", "Ana Primera", "Cuota temporada"];
  expect(matchesSearch("ane primera", values)).toBe(true);
  expect(matchesSearch("historica cuota", values)).toBe(true);
  expect(matchesSearch("ane segunda", values)).toBe(false);
  expect(matchesSearch("pri", [undefined, "Ana Primera"])).toBe(true);
});
