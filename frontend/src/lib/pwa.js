export const isStandaloneApp = () =>
  window.matchMedia?.("(display-mode: standalone)")?.matches ||
  window.navigator?.standalone === true;

export const isIOSDevice = () =>
  /iphone|ipad|ipod/i.test(window.navigator?.userAgent || "") ||
  (window.navigator?.platform === "MacIntel" && window.navigator?.maxTouchPoints > 1);

export const isChromiumBrowser = () =>
  Boolean(window.chrome) || /chrome|chromium|crios|edg/i.test(window.navigator?.userAgent || "");

export const detectPwaState = () => {
  const standalone = isStandaloneApp();
  const ios = isIOSDevice();
  const chromium = isChromiumBrowser();
  return { standalone, ios, chromium };
};

export const registerPwaServiceWorker = () => {
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => registration.update?.())
      .catch(() => {});
  });
};
