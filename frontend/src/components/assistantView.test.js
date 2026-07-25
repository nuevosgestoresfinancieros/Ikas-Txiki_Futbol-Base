import {
  SAFE_ASSISTANT_ROUTES, actionLabelKey, canCreateProposal,
  normalizeGuidedValue, safeAssistantLinks, suggestedQuestions, bindAssistantTrigger,
} from "./assistantView";
import { translations } from "../i18n";

const t = (key) => key;

test("contextual questions adapt to the current screen", () => {
  expect(suggestedQuestions("/jugadores", t)).toEqual([
    "assistantQuestionPlayer", "assistantQuestionScreen", "assistantQuestionPermissions",
  ]);
  expect(suggestedQuestions("/calendario", t)).toEqual([
    "assistantQuestionScreen", "assistantQuestionPermissions",
  ]);
});

test("only internal allowlisted routes can be rendered", () => {
  expect(safeAssistantLinks(["/jugadores", "https://evil.test", "javascript:alert(1)", "/informes"]))
    .toEqual(["/jugadores", "/informes"]);
  expect(SAFE_ASSISTANT_ROUTES.has("/usuarios")).toBe(true);
});

test("guided values normalize closed structured fields", () => {
  expect(normalizeGuidedValue("equipamiento_items", "jugador, portero")).toEqual(["jugador", "portero"]);
  expect(normalizeGuidedValue("equipacion_entregada", "true")).toBe(true);
  expect(normalizeGuidedValue("convocados", '[{"player_id":"fictional"}]'))
    .toEqual([{ player_id: "fictional" }]);
});

test("preview stays disabled until every required field exists", () => {
  const create = { required: ["nombre"] };
  const update = { required: ["target_id"] };
  expect(canCreateProposal(create, {}, "")).toBe(false);
  expect(canCreateProposal(create, { nombre: "Ficticio" }, "")).toBe(true);
  expect(canCreateProposal(update, {}, "")).toBe(false);
  expect(canCreateProposal(update, {}, "player-fictional")).toBe(true);
});

test("action labels use stable translation keys", () => {
  expect(actionLabelKey("player.assign_team")).toBe("assistantAction_player_assign_team");
});

test("existing Cibermedida badge opens by click and keyboard without external navigation", () => {
  document.body.innerHTML = `
    <a id="cibermedida-badge" href="https://example.invalid" target="_blank" aria-label="old">
      <span>Hecho por Cibermedida</span>
    </a>`;
  const badge = document.getElementById("cibermedida-badge");
  const open = jest.fn();
  const cleanup = bindAssistantTrigger(badge, open, "Asistente Cibermedida");
  expect(badge.getAttribute("href")).toBeNull();
  expect(badge.getAttribute("role")).toBe("button");
  expect(badge.getAttribute("aria-haspopup")).toBe("dialog");
  expect(badge.querySelector("span").textContent).toBe("Asistente Cibermedida");
  badge.click();
  badge.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  badge.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  expect(open).toHaveBeenCalledTimes(3);
  cleanup();
  expect(badge.getAttribute("href")).toBe("https://example.invalid");
  expect(badge.querySelector("span").textContent).toBe("Hecho por Cibermedida");
});

test("assistant identity and essential labels are complete in ES and EU", () => {
  expect(translations.es.assistantCibermedida).toBe("Asistente Cibermedida");
  expect(translations.es.assistantTitle).toContain("Cibermedida");
  expect(translations.eu.assistantCibermedida).toContain("Cibermedida");
  expect(translations.eu.assistantTitle).toContain("Cibermedida");
  expect(translations.es.assistantPrivacyWarning).toBeTruthy();
  expect(translations.eu.assistantPrivacyWarning).toBeTruthy();
});

test("component source keeps accessible and explicit confirmation controls", () => {
  const fs = require("fs");
  const source = fs.readFileSync(require.resolve("./AssistantPanel.jsx"), "utf8");
  expect(source).toContain('document.getElementById("cibermedida-badge")');
  expect(source).not.toContain("fixed bottom-20");
  expect(source).toContain('aria-live="polite"');
  expect(source).toContain('role="alert"');
  expect(source).toContain('X-Assistant-Confirm');
  expect(source).toContain("assistantConfirm");
  expect(source).toContain("triggerRef.current?.focus()");
  expect(source).toContain("h-[100dvh] w-screen");
  expect(source).not.toContain("dangerouslySetInnerHTML");
});
