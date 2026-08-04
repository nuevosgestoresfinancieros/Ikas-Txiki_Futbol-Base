import React from "react";
import { MapPin, Navigation } from "lucide-react";
import { useI18n } from "@/i18n";

const LATITUDE_FIELDS = ["latitude", "latitud", "lat"];
const LONGITUDE_FIELDS = ["longitude", "longitud", "lng", "lon"];
const TEXT_FIELDS = [
  "direccion_campo",
  "direccion",
  "address",
  "ubicacion",
  "location",
  "lugar",
  "lugar_quedada",
  "campo",
  "venue",
  "nombre_lugar",
];

const cleanText = (value) => typeof value === "string" ? value.trim() : "";

const numericCoordinate = (source, fields) => {
  for (const field of fields) {
    const value = source?.[field];
    if (value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
};

const coordinatesFrom = (source) => {
  const nested = source?.coordinates && typeof source.coordinates === "object" ? source.coordinates : {};
  const latitude = numericCoordinate(source, LATITUDE_FIELDS) ?? numericCoordinate(nested, LATITUDE_FIELDS);
  const longitude = numericCoordinate(source, LONGITUDE_FIELDS) ?? numericCoordinate(nested, LONGITUDE_FIELDS);
  if (latitude === null || longitude === null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return "";
  return `${latitude},${longitude}`;
};

export const resolveMapsLocation = (...sources) => {
  const records = sources.flat().filter((source) => source && typeof source === "object");
  for (const source of records) {
    const coordinates = coordinatesFrom(source);
    if (coordinates) return coordinates;
  }
  for (const source of records) {
    for (const field of TEXT_FIELDS) {
      const value = cleanText(source[field]);
      if (value) return value;
    }
  }
  return "";
};

export const googleMapsUrl = (mode, ...sources) => {
  const location = resolveMapsLocation(...sources);
  if (!location) return "";
  const parameter = mode === "directions" ? "destination" : "query";
  const path = mode === "directions" ? "dir" : "search";
  return `https://www.google.com/maps/${path}/?api=1&${parameter}=${encodeURIComponent(location)}`;
};

export default function GoogleMapsLinks({ sources, className = "", preview = false }) {
  const { t } = useI18n();
  const records = Array.isArray(sources) ? sources : [sources];
  const location = resolveMapsLocation(records);
  if (!location) return null;

  const links = [
    { mode: "search", label: t("viewGoogleMaps"), Icon: MapPin },
    { mode: "directions", label: t("getDirections"), Icon: Navigation },
  ];

  return (
    <div className={className} data-testid="google-maps-links">
      <div className="flex flex-wrap gap-2">
        {links.map(({ mode, label, Icon }) => (
          <a
            key={mode}
            href={googleMapsUrl(mode, records)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${label}: ${location}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-primary/25 px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
      </div>
      {preview && <p className="mt-2 text-xs text-slate-500" role="status">{t("mapsPreviewHint")}</p>}
    </div>
  );
}
