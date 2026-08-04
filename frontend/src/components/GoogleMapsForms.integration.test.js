import fs from "fs";
import path from "path";

const pageSource = (name) => fs.readFileSync(path.join(__dirname, "..", "pages", `${name}.jsx`), "utf8");

test.each([
  ["Matches", 'value={form.direccion_campo}', '<GoogleMapsLinks preview sources={form} />'],
  ["Trainings", 'value={form.campo}', '<GoogleMapsLinks preview sources={form} />'],
  ["Callups", 'value={form.lugar_quedada}', '<GoogleMapsLinks preview sources={form} />'],
  ["Calendar", 'value={form.lugar}', '<GoogleMapsLinks preview sources={form} />'],
])("connects the %s location field to its unsaved Google Maps preview", (page, field, preview) => {
  const source = pageSource(page);
  expect(source).toContain(field);
  expect(source).toContain(preview);
});

test.each([
  ["Matches", "<GoogleMapsLinks sources={m}"],
  ["Trainings", "<GoogleMapsLinks sources={i}"],
  ["Callups", "<GoogleMapsLinks sources={[callup, callup.match]}"],
  ["Calendar", "<GoogleMapsLinks sources={selected}"],
])("keeps Google Maps access for saved locations in %s", (page, integration) => {
  expect(pageSource(page)).toContain(integration);
});
