import React from "react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, useI18n } from "@/i18n";

const STATUS_COLORS = {
  activo: "bg-green-100 text-green-800",
  baja: "bg-gray-200 text-gray-700",
  lesionado: "bg-red-100 text-red-800",
  pendiente_documentacion: "bg-amber-100 text-amber-800",
  en_prueba: "bg-sky-100 text-sky-800",
  completo: "bg-green-100 text-green-800",
  pendiente: "bg-amber-100 text-amber-800",
  incompleto: "bg-red-100 text-red-800",
  programado: "bg-sky-100 text-sky-800",
  jugado: "bg-green-100 text-green-800",
  aplazado: "bg-amber-100 text-amber-800",
  suspendido: "bg-red-100 text-red-800",
  cancelado: "bg-gray-200 text-gray-700",
  pagado: "bg-green-100 text-green-800",
  parcial: "bg-amber-100 text-amber-800",
  devuelto: "bg-red-100 text-red-800",
  firmada: "bg-green-100 text-green-800",
  caducada: "bg-red-100 text-red-800",
  confirmado: "bg-green-100 text-green-800",
  no_puede: "bg-red-100 text-red-800",
  cerrado: "bg-gray-200 text-gray-700",
  recibida: "bg-sky-100 text-sky-800",
  revisada: "bg-indigo-100 text-indigo-800",
  aceptada: "bg-green-100 text-green-800",
  rechazada: "bg-red-100 text-red-800",
  presente: "bg-green-100 text-green-800",
  justificada: "bg-amber-100 text-amber-800",
  injustificada: "bg-red-100 text-red-800",
  lesion: "bg-orange-100 text-orange-800",
};

export const StatusBadge = ({ status }) => {
  const { lang } = useI18n();
  if (!status) return null;
  const label = STATUS_LABELS[lang]?.[status] || status;
  const color = STATUS_COLORS[status] || "bg-slate-100 text-slate-700";
  return (
    <span data-testid={`status-badge-${status}`} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${color}`}>
      {label}
    </span>
  );
};

export const PageHeader = ({ title, subtitle, icon: Icon, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 animate-fade-up">
    <div className="flex items-center gap-3">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-white shadow-lg shadow-cyan-500/30">
          <Icon className="h-6 w-6" />
        </div>
      )}
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

export const EmptyState = ({ icon: Icon, message, action }) => (
  <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-cyan-200 bg-white/60 backdrop-blur-xl py-16 px-6 text-center animate-fade-up">
    {Icon && (
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-100 to-emerald-100 text-cyan-500 mb-4">
        <Icon className="h-8 w-8" />
      </div>
    )}
    <p className="text-slate-500 mb-4 max-w-sm">{message}</p>
    {action}
  </div>
);

export const initials = (nombre = "", apellidos = "") =>
  `${(nombre[0] || "").toUpperCase()}${(apellidos[0] || "").toUpperCase()}` || "?";
