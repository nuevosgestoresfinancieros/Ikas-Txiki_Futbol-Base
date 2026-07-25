export const SAFE_ASSISTANT_ROUTES = new Set([
  "/", "/jugadores", "/familias", "/equipos", "/inscripciones",
  "/entrenamientos", "/partidos", "/convocatorias", "/pagos",
  "/autorizaciones", "/equipamiento", "/comunicacion", "/calendario",
  "/informes", "/configuracion", "/usuarios", "/portal",
]);

export const suggestedQuestions = (route, t) => {
  const common = [t("assistantQuestionScreen"), t("assistantQuestionPermissions")];
  const specific = {
    "/jugadores": t("assistantQuestionPlayer"),
    "/familias": t("assistantQuestionFamily"),
    "/entrenamientos": t("assistantQuestionAttendance"),
    "/convocatorias": t("assistantQuestionCallup"),
    "/informes": t("assistantQuestionReports"),
  }[route];
  return specific ? [specific, ...common] : common;
};

export const safeAssistantLinks = (links = []) =>
  links.filter((link) => SAFE_ASSISTANT_ROUTES.has(link));

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

export const bindAssistantTrigger = (element, onOpen, label) => {
  if (!element) return () => {};
  const original = {
    href: element.getAttribute("href"),
    target: element.getAttribute("target"),
    ariaLabel: element.getAttribute("aria-label"),
    role: element.getAttribute("role"),
    tabIndex: element.getAttribute("tabindex"),
    text: element.querySelector("span")?.textContent,
  };
  const text = element.querySelector("span");
  if (text) text.textContent = label;
  element.removeAttribute("href");
  element.removeAttribute("target");
  element.setAttribute("role", "button");
  element.setAttribute("tabindex", "0");
  element.setAttribute("aria-label", label);
  element.setAttribute("aria-haspopup", "dialog");

  const click = (event) => { event.preventDefault(); onOpen(); };
  const keydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  };
  element.addEventListener("click", click);
  element.addEventListener("keydown", keydown);
  return () => {
    element.removeEventListener("click", click);
    element.removeEventListener("keydown", keydown);
    if (text && original.text != null) text.textContent = original.text;
    for (const [name, value] of [
      ["href", original.href], ["target", original.target], ["aria-label", original.ariaLabel],
      ["role", original.role], ["tabindex", original.tabIndex],
    ]) {
      if (value == null) element.removeAttribute(name);
      else element.setAttribute(name, value);
    }
    element.removeAttribute("aria-haspopup");
  };
};
