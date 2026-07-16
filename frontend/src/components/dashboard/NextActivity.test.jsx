import { renderToStaticMarkup } from "react-dom/server";
import NextActivity from "./NextActivity";
import { I18nProvider } from "../../i18n";


const renderActivity = (activity) => renderToStaticMarkup(
  <I18nProvider><NextActivity activity={activity} /></I18nProvider>,
);


test("renders an empty state when there is no next activity", () => {
  expect(renderActivity(null)).toContain("No hay actividades futuras");
});


test("renders a selected next match", () => {
  const html = renderActivity({
    tipo: "partido", fecha_hora: "2026-07-18T10:00:00+02:00",
    equipo_nombre: "Alevín A", rival: "Rival", campo: "Municipal",
  });
  expect(html).toContain("Alevín A vs Rival");
  expect(html).toContain("Municipal");
});
