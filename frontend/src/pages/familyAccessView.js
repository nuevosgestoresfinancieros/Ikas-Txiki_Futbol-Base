export const FAMILY_ACCESS_STATES = {
  no_access: { label: "Sin acceso", tone: "slate" },
  eligible: { label: "Listo para invitar", tone: "sky" },
  queued: { label: "En cola", tone: "sky" },
  pending_activation: { label: "Pendiente de activación", tone: "amber" },
  invitation_expired: { label: "Invitación caducada", tone: "amber" },
  active: { label: "Activa", tone: "emerald" },
  inactive: { label: "Inactiva", tone: "red" },
  archived: { label: "Archivada", tone: "red" },
  blocked: { label: "Bloqueada", tone: "red" },
  missing_email: { label: "Sin correo", tone: "amber" },
  email_unconfirmed: { label: "Correo no confirmado", tone: "amber" },
  duplicate_email: { label: "Correo duplicado", tone: "red" },
  email_conflict: { label: "Conflicto de correo", tone: "red" },
  ambiguous_existing_account: { label: "Caso a revisar", tone: "red" },
  invalid_email: { label: "Correo no válido", tone: "red" },
};

export const accessState = (value) => FAMILY_ACCESS_STATES[value] || { label: "Caso a revisar", tone: "red" };

export const stateClasses = (tone) => ({
  slate: "border-slate-200 bg-slate-50 text-slate-800",
  sky: "border-sky-200 bg-sky-50 text-sky-900",
  amber: "border-amber-200 bg-amber-50 text-amber-950",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  red: "border-red-200 bg-red-50 text-red-900",
}[tone] || "border-slate-200 bg-slate-50 text-slate-800");

export const safeAccessError = (error) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.length <= 180 && !/(token|hash|password|contrase.a|https?:\/\/|@)/i.test(detail)) return detail;
  return "No se ha podido completar la operación. Revisa el estado e inténtalo de nuevo.";
};

