// Búsqueda de texto en listas: ignora mayúsculas y acentos ("kanometa" encuentra
// "Kañometa") y exige que aparezcan todas las palabras escritas, en cualquier campo.
export const normalizeSearchText = (value) =>
  String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const matchesSearch = (query, values) => {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const haystack = values.map(normalizeSearchText).join(" ");
  return terms.every((term) => haystack.includes(term));
};
