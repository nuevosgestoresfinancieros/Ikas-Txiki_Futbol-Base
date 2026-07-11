import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Trophy } from "lucide-react";
import { useI18n } from "@/i18n";
import "./splash.css";

const STORAGE_KEY = "ikastxiki_splash_seen";

const hasBeenSeen = () => {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const markAsSeen = () => {
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {}
};

const SplashScreen = () => {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(hasBeenSeen);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef();

  const close = () => {
    clearTimeout(timer.current);
    markAsSeen();
    setLeaving(true);
    window.setTimeout(() => setHidden(true), 320);
  };

  useEffect(() => {
    if (hidden) return undefined;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.body.style.overflow = "hidden";
    timer.current = window.setTimeout(close, reduceMotion ? 120 : 1450);
    return () => {
      clearTimeout(timer.current);
      document.body.style.overflow = "";
    };
    // Solo se programa al montar la bienvenida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hidden) document.body.style.overflow = "";
  }, [hidden]);

  if (hidden) return null;

  return (
    <section className={`brand-splash${leaving ? " is-leaving" : ""}`} data-testid="splash-screen" aria-label={t("appName")}>
      <div className="brand-splash__pitch" aria-hidden="true">
        <span className="brand-splash__midline" />
        <span className="brand-splash__circle" />
      </div>
      <div className="brand-splash__glow brand-splash__glow--one" aria-hidden="true" />
      <div className="brand-splash__glow brand-splash__glow--two" aria-hidden="true" />

      <div className="brand-splash__content">
        <div className="brand-splash__mark" aria-hidden="true">
          <Trophy />
        </div>
        <p className="brand-splash__eyebrow">{t("splashBadge")}</p>
        <h1>Ikas-Txiki</h1>
        <p className="brand-splash__description">{t("splashDescription")}</p>
        <button type="button" onClick={close} data-testid="splash-enter-btn">
          {t("enter")}
          <ArrowRight aria-hidden="true" />
        </button>
        <div className="brand-splash__progress" aria-hidden="true"><span /></div>
      </div>
    </section>
  );
};

export default SplashScreen;
