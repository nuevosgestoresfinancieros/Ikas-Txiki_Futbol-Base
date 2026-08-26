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

export const getActivationLaunchUrl = (targetURL, currentOrigin = window.location.origin) => {
  try {
    const target = new URL(targetURL, currentOrigin);
    if (target.origin !== currentOrigin || target.pathname !== "/activar" || !target.searchParams.get("token")) {
      return null;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
};

export const registerPwaLaunchHandler = () => {
  if (!window.launchQueue?.setConsumer) return;

  window.launchQueue.setConsumer(({ targetURL }) => {
    const activationUrl = getActivationLaunchUrl(targetURL);
    if (!activationUrl) return;

    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl !== activationUrl) window.location.assign(activationUrl);
  });
};

export const registerPwaServiceWorker = () => {
  if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        let refreshedForNewWorker = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (refreshedForNewWorker) return;
          refreshedForNewWorker = true;
          window.location.reload();
        });
        return registration.update?.();
      })
      .catch(() => {});
  });
};
