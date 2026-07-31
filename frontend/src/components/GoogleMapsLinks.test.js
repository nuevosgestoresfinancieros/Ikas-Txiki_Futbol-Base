import GoogleMapsLinks, { googleMapsUrl, resolveMapsLocation } from "./GoogleMapsLinks";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key) => ({ viewGoogleMaps: "Ver en Google Maps", getDirections: "Cómo llegar" })[key] }),
}), { virtual: true });

test("uses a valid address in search and directions links", () => {
  const source = { direccion_campo: "Campo Municipal, Calle Mayor 1" };
  expect(googleMapsUrl("search", source)).toBe(
    "https://www.google.com/maps/search/?api=1&query=Campo%20Municipal%2C%20Calle%20Mayor%201",
  );
  expect(googleMapsUrl("directions", source)).toBe(
    "https://www.google.com/maps/dir/?api=1&destination=Campo%20Municipal%2C%20Calle%20Mayor%201",
  );
});

test("prioritizes existing coordinates over text fields", () => {
  expect(resolveMapsLocation({ campo: "Campo", latitud: 43.257, longitud: -2.923 })).toBe("43.257,-2.923");
  expect(resolveMapsLocation({ lugar: "Otro" }, { coordinates: { lat: "43.2", lng: "-2.9" } })).toBe("43.2,-2.9");
});

test("returns no link for an empty or incomplete location", () => {
  expect(resolveMapsLocation(null, {}, { lugar: "  " })).toBe("");
  expect(googleMapsUrl("search", { latitude: 43.2 })).toBe("");
});

test("encodes special characters safely", () => {
  expect(googleMapsUrl("search", { lugar: "Zelaiña / Campo Nº 2 & acceso norte" })).toContain(
    "query=Zelai%C3%B1a%20%2F%20Campo%20N%C2%BA%202%20%26%20acceso%20norte",
  );
});

test("normalizes the location field names used by existing modules", () => {
  expect(resolveMapsLocation({ lugar_quedada: "Vestuarios" })).toBe("Vestuarios");
  expect(resolveMapsLocation({ campo: "Campo A" })).toBe("Campo A");
  expect(resolveMapsLocation({ location: "Clubhouse" })).toBe("Clubhouse");
});

test("renders accessible links in a new browsing context without an opener", () => {
  const markup = renderToStaticMarkup(<GoogleMapsLinks sources={{ campo: "Campo A" }} />);
  expect(markup).toContain('target="_blank"');
  expect(markup).toContain('rel="noopener noreferrer"');
  expect(markup).toContain('aria-label="Ver en Google Maps: Campo A"');
  expect(markup).toContain("Cómo llegar");
});
