import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../i18n";
import SplashScreen, { createRollPhysics } from "./SplashScreen";


const renderSplash = (ready = true) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(
    <I18nProvider>
      <SplashScreen ready={ready} />
    </I18nProvider>,
  ));
  return {
    container,
    root,
    rerender(nextReady) {
      act(() => root.render(
        <I18nProvider>
          <SplashScreen ready={nextReady} />
        </I18nProvider>,
      ));
    },
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
};


beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });
});


afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  document.body.innerHTML = "";
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});


test("shows the premium corporate identity through the full cinematic sequence", () => {
  const view = renderSplash(true);
  const splash = view.container.querySelector('[data-testid="splash-screen"]');
  expect(splash).toBeTruthy();
  expect(splash.textContent).toContain("Ikas-Txiki Manager");
  expect(splash.textContent).toContain("Zornotzako Futbol Eskola");
  expect(splash.querySelector('img[alt="Ikas-Txiki Manager"]')).toBeTruthy();

  act(() => jest.advanceTimersByTime(3399));
  expect(view.container.querySelector('[data-testid="splash-screen"]')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1));
  expect(view.container.querySelector('[data-testid="splash-screen"]').className).toContain("is-leaving");
  act(() => jest.advanceTimersByTime(320));
  expect(view.container.querySelector('[data-testid="splash-screen"]')).toBeNull();
  view.cleanup();
});


test("keeps only the waiting state until the application is ready", () => {
  const view = renderSplash(false);
  act(() => jest.advanceTimersByTime(3400));
  expect(view.container.querySelector('[data-testid="splash-screen"]').className).toContain("is-waiting");

  view.rerender(true);
  act(() => jest.advanceTimersByTime(321));
  expect(view.container.querySelector('[data-testid="splash-screen"]')).toBeNull();
  view.cleanup();
});


test("reduced motion removes the long rolling sequence", () => {
  window.matchMedia = jest.fn().mockReturnValue({ matches: true });
  const view = renderSplash(true);
  act(() => jest.advanceTimersByTime(699));
  expect(view.container.querySelector('[data-testid="splash-screen"]')).toBeTruthy();
  act(() => jest.advanceTimersByTime(1));
  act(() => jest.advanceTimersByTime(320));
  expect(view.container.querySelector('[data-testid="splash-screen"]')).toBeNull();
  view.cleanup();
});


test.each([320, 390, 768, 1024, 1440])("derives ball rotation from travelled distance at %ipx", (width) => {
  const physics = createRollPhysics(width);
  const diameter = width <= 480 ? 126 : Math.min(176, Math.max(118, width * 0.18));
  const expectedStart = (((-width / 2) - 130) / (Math.PI * diameter)) * 360;
  expect(parseFloat(physics["--roll-start-rotation"])).toBeCloseTo(expectedStart, 2);
  expect(parseFloat(physics["--roll-impact-one-rotation"])).toBeCloseTo(
    ((-0.34 * width) / (Math.PI * diameter)) * 360,
    2,
  );
});
