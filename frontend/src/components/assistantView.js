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

const DAILY_ASSISTANT_CONTEXTS = {
  "/usuarios": { welcomeKey: "assistantDailyWelcome_users", quickLinks: ["/usuarios", "/configuracion"], guideKeys: ["assistantDailyGuide_users_1", "assistantDailyGuide_users_2", "assistantDailyGuide_users_3"] },
  "/familias": { welcomeKey: "assistantDailyWelcome_families", quickLinks: ["/familias", "/jugadores"], guideKeys: ["assistantDailyGuide_families_1", "assistantDailyGuide_families_2", "assistantDailyGuide_families_3"] },
  "/jugadores": { welcomeKey: "assistantDailyWelcome_players", quickLinks: ["/jugadores", "/familias", "/equipos"], guideKeys: ["assistantDailyGuide_players_1", "assistantDailyGuide_players_2", "assistantDailyGuide_players_3"] },
  "/comunicacion": { welcomeKey: "assistantDailyWelcome_communications", quickLinks: ["/comunicacion", "/calendario"], guideKeys: ["assistantDailyGuide_communications_1", "assistantDailyGuide_communications_2", "assistantDailyGuide_communications_3"] },
  "/autorizaciones": { welcomeKey: "assistantDailyWelcome_authorizations", quickLinks: ["/autorizaciones", "/jugadores"], guideKeys: ["assistantDailyGuide_authorizations_1", "assistantDailyGuide_authorizations_2", "assistantDailyGuide_authorizations_3"] },
  "/pagos": { welcomeKey: "assistantDailyWelcome_payments", quickLinks: ["/pagos", "/informes"], guideKeys: ["assistantDailyGuide_payments_1", "assistantDailyGuide_payments_2", "assistantDailyGuide_payments_3"] },
  "/entrenamientos": { welcomeKey: "assistantDailyWelcome_trainings", quickLinks: ["/entrenamientos", "/calendario", "/equipos"], guideKeys: ["assistantDailyGuide_trainings_1", "assistantDailyGuide_trainings_2", "assistantDailyGuide_trainings_3"] },
  "/informes": { welcomeKey: "assistantDailyWelcome_reports", quickLinks: ["/informes", "/estadisticas"], guideKeys: ["assistantDailyGuide_reports_1", "assistantDailyGuide_reports_2", "assistantDailyGuide_reports_3"] },
  "/configuracion": { welcomeKey: "assistantDailyWelcome_settings", quickLinks: ["/configuracion", "/usuarios"], guideKeys: ["assistantDailyGuide_settings_1", "assistantDailyGuide_settings_2", "assistantDailyGuide_settings_3"] },
};

export const dailyAssistantContext = (route) => DAILY_ASSISTANT_CONTEXTS[route] || null;

export const permittedDailyAssistantLinks = (context, canAccessRoute) =>
  (context?.quickLinks || []).filter((route) => SAFE_ASSISTANT_ROUTES.has(route) && canAccessRoute(route));

const REVIEW_TEXT_KEYS = new Set([
  "authorizations_pending", "callups_pending", "communications_attention",
  "attendance_alerts", "payments_pending", "next_activity",
]);

export const safeAssistantReviewItems = (items = []) => items
  .filter((item) => REVIEW_TEXT_KEYS.has(item?.text_key) && SAFE_ASSISTANT_ROUTES.has(item?.route))
  .map((item) => ({
    id: String(item.id || item.kind), text_key: item.text_key, route: item.route,
    count: Math.max(0, Math.min(9999, Number(item.count) || 0)),
    priority: item.priority === "high" ? "high" : "normal",
  }))
  .filter((item) => item.id)
  .slice(0, 3);

export const assistantReviewLabel = (item, t) => {
  const label = t(`assistantReview_${item.text_key}`);
  return item.count ? `${item.count} ${label}` : label;
};
export const visibleAssistantReviewItems = (items, hiddenIds = new Set()) =>
  safeAssistantReviewItems(items).filter((item) => !hiddenIds.has(item.id));


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
