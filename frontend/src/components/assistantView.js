export const SAFE_ASSISTANT_ROUTES = new Set([
  "/", "/jugadores", "/familias", "/equipos", "/inscripciones",
  "/entrenamientos", "/partidos", "/convocatorias", "/pagos",
  "/autorizaciones", "/equipamiento", "/comunicacion", "/calendario",
  "/informes", "/estadisticas", "/configuracion", "/usuarios", "/portal",
]);

const ROUTE_QUESTION_KEYS = {
  "/": "assistantQuestionDashboard",
  "/jugadores": "assistantQuestionPlayer",
  "/familias": "assistantQuestionFamily",
  "/equipos": "assistantQuestionTeam",
  "/inscripciones": "assistantQuestionInscription",
  "/entrenamientos": "assistantQuestionTraining",
  "/partidos": "assistantQuestionMatch",
  "/convocatorias": "assistantQuestionCallup",
  "/pagos": "assistantQuestionPayment",
  "/autorizaciones": "assistantQuestionAuthorization",
  "/equipamiento": "assistantQuestionEquipment",
  "/comunicacion": "assistantQuestionCommunication",
  "/calendario": "assistantQuestionCalendar",
  "/informes": "assistantQuestionReports",
  "/estadisticas": "assistantQuestionStats",
  "/configuracion": "assistantQuestionSettings",
  "/usuarios": "assistantQuestionUsers",
  "/portal": "assistantQuestionPortal",
};

export const suggestedQuestions = (route, t) => {
  const common = [t("assistantQuestionScreen"), t("assistantQuestionPermissions")];
  const specificKey = ROUTE_QUESTION_KEYS[route];
  const specific = specificKey ? t(specificKey) : null;
  return specific ? [specific, ...common] : common;
};

export const safeAssistantLinks = (links = []) =>
  links.filter((link) => SAFE_ASSISTANT_ROUTES.has(link));

export const safeAssistantModules = (modules = []) => modules
  .map((module) => ({
    ...module,
    routes: safeAssistantLinks(module.routes),
  }))
  .filter((module) => module.id && module.routes.length);

export const currentAssistantModule = (route, modules = []) =>
  safeAssistantModules(modules).find((module) => module.routes.includes(route)) || null;

export const actionLabelKey = (intent) =>
  `assistantAction_${String(intent || "").replaceAll(".", "_")}`;

export const normalizeGuidedValue = (field, value) => {
  if (["equipamiento_items", "convocados"].includes(field)) {
    if (Array.isArray(value)) return value;
    const text = String(value || "").trim();
    if (!text) return [];
    if (field === "convocados") return JSON.parse(text);
    return text.split(",").map((item) => item.trim()).filter(Boolean);
  }
  if (["nueva_incorporacion", "equipacion_entregada", "player_self_response_allowed"].includes(field)) {
    return value === true || value === "true";
  }
  return value;
};

export const canCreateProposal = (capability, values, targetId) => {
  if (!capability) return false;
  return capability.required.every((field) => {
    const value = field === "target_id" ? targetId : values[field];
    return value !== undefined && value !== null && value !== "";
  });
};
