import {
  SAFE_ASSISTANT_ROUTES, actionLabelKey, canCreateProposal,
  currentAssistantModule, normalizeGuidedValue, safeAssistantLinks,
  safeAssistantModules, suggestedQuestions,
} from "./assistantView";
import { translations } from "../i18n";
import React, { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/lib/utils", () => ({
  cn: (...values) => values.filter(Boolean).join(" "),
}), { virtual: true });

import {
  Sheet, SheetContent, SheetDescription, SheetTitle,
} from "./ui/sheet";

const t = (key) => key;

test("contextual questions adapt to the current screen", () => {
  expect(suggestedQuestions("/jugadores", t)).toEqual([
    "assistantQuestionPlayer", "assistantQuestionScreen", "assistantQuestionPermissions",
  ]);
  expect(suggestedQuestions("/calendario", t)).toEqual([
    "assistantQuestionCalendar", "assistantQuestionScreen", "assistantQuestionPermissions",
  ]);
  expect(suggestedQuestions("/estadisticas", t)[0]).toBe("assistantQuestionStats");
});

test("only internal allowlisted routes can be rendered", () => {
  expect(safeAssistantLinks(["/jugadores", "https://evil.test", "javascript:alert(1)", "/informes"]))
    .toEqual(["/jugadores", "/informes"]);
  expect(SAFE_ASSISTANT_ROUTES.has("/usuarios")).toBe(true);
  expect(SAFE_ASSISTANT_ROUTES.has("/estadisticas")).toBe(true);
});

test("module catalog keeps only safe role-filtered application routes", () => {
  const modules = safeAssistantModules([
    { id: "players", routes: ["/jugadores", "https://evil.test"] },
    { id: "stats", routes: ["/estadisticas"] },
    { id: "unsafe", routes: ["javascript:alert(1)"] },
  ]);
  expect(modules).toEqual([
    { id: "players", routes: ["/jugadores"] },
    { id: "stats", routes: ["/estadisticas"] },
  ]);
  expect(currentAssistantModule("/estadisticas", modules).id).toBe("stats");
  expect(currentAssistantModule("/usuarios", modules)).toBeNull();
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

test("Cibermedida badge remains an external corporate link", () => {
  const fs = require("fs");
  const path = require("path");
  const html = fs.readFileSync(path.resolve(__dirname, "../../public/index.html"), "utf8");
  expect(html).toContain('id="cibermedida-badge"');
  expect(html).toContain('href="https://cibermedida.es"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain("Una creación de Cibermedida");
  expect(html).toContain('class="cibermedida-badge-label"');
});

test("assistant identity and essential labels are complete in ES and EU", () => {
  expect(translations.es.assistantCibermedida).toBe("Asistente Cibermedida");
  expect(translations.es.assistantTitle).toContain("Cibermedida");
  expect(translations.eu.assistantCibermedida).toContain("Cibermedida");
  expect(translations.eu.assistantTitle).toContain("Cibermedida");
  expect(translations.es.assistantPrivacyWarning).toBeTruthy();
  expect(translations.eu.assistantPrivacyWarning).toBeTruthy();
  expect(translations.es.assistantModule_stats).toBe("Estadísticas");
  expect(translations.eu.assistantModule_stats).toBe("Estatistikak");
});

test("component source keeps accessible and explicit confirmation controls", () => {
  const fs = require("fs");
  const source = fs.readFileSync(require.resolve("./AssistantPanel.jsx"), "utf8");
  expect(source).toContain('data-testid="assistant-trigger"');
  expect(source).not.toContain('document.getElementById("cibermedida-badge")');
  expect(source).toContain('aria-live="polite"');
  expect(source).toContain('role="alert"');
  expect(source).toContain('X-Assistant-Confirm');
  expect(source).toContain("assistantConfirm");
  expect(source).toContain("triggerRef.current?.focus()");
  expect(source).toContain("h-[100dvh] w-screen");
  expect(source).toContain("assistantAvailableModules");
  expect(source).toContain("safeAssistantModules");
  expect(source).toContain("<SheetDescription>{t(\"assistantDescription\")}</SheetDescription>");
  expect(source).not.toContain('aria-describedby=\"assistant-description\"');
  expect(source).not.toContain('id=\"assistant-description\"');
  expect(source).not.toContain("dangerouslySetInnerHTML");
});

test("Radix associates the assistant title and description without warnings and restores focus", async () => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
  const error = jest.spyOn(console, "error").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  const Harness = () => {
    const [open, setOpen] = useState(false);
    const trigger = useRef(null);
    const changeOpen = (nextOpen) => {
      setOpen(nextOpen);
      if (!nextOpen) window.requestAnimationFrame(() => trigger.current?.focus());
    };
    return (
      <>
        <button ref={trigger} type="button" onClick={() => changeOpen(true)}>
          Asistente Cibermedida
        </button>
        <Sheet open={open} onOpenChange={changeOpen}>
          <SheetContent closeLabel="Cerrar">
            <SheetTitle>Asistente Ikas‑Txiki — Cibermedida</SheetTitle>
            <SheetDescription>Ayuda contextual y gestión guiada con confirmación.</SheetDescription>
          </SheetContent>
        </Sheet>
      </>
    );
  };

  await act(async () => root.render(<Harness />));
  const trigger = container.querySelector("button");
  await act(async () => trigger.click());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
  expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
  expect(document.getElementById(dialog.getAttribute("aria-labelledby")).textContent)
    .toBe("Asistente Ikas‑Txiki — Cibermedida");
  expect(document.getElementById(dialog.getAttribute("aria-describedby")).textContent)
    .toBe("Ayuda contextual y gestión guiada con confirmación.");

  await act(async () => {
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await act(async () => new Promise((resolve) => window.requestAnimationFrame(resolve)));
  expect(document.activeElement).toBe(trigger);
  expect(warning.mock.calls.flat().join(" ")).not.toContain("Missing `Description`");
  expect(error.mock.calls.flat().join(" ")).not.toContain("Missing `Description`");

  await act(async () => root.unmount());
  warning.mockRestore();
  error.mockRestore();
  container.remove();
  delete global.IS_REACT_ACT_ENVIRONMENT;
});
