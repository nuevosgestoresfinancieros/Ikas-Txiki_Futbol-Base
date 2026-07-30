import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import ClubLogo from "./ClubLogo";
import "./splash.css";

const SPLASH_DURATION_MS = 3400;
const REDUCED_MOTION_DURATION_MS = 700;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export const createRollPhysics = (viewportWidth) => {
  const width = Math.max(320, Number(viewportWidth) || 320);
  const diameter = width <= 480 ? 126 : clamp(width * 0.18, 118, 176);
  const circumference = Math.PI * diameter;
  const rotationAt = (x) => `${((x / circumference) * 360).toFixed(3)}deg`;
  return {
    "--roll-start-rotation": rotationAt((-width / 2) - 130),
    "--roll-impact-one-rotation": rotationAt(-0.34 * width),
    "--roll-apex-one-rotation": rotationAt(-0.22 * width),
    "--roll-impact-two-rotation": rotationAt(-0.13 * width),
    "--roll-apex-two-rotation": rotationAt(-0.08 * width),
    "--roll-impact-three-rotation": rotationAt(-0.045 * width),
    "--roll-apex-three-rotation": rotationAt(-0.025 * width),
    "--roll-last-impact-rotation": rotationAt(-0.0115 * width),
    "--roll-settle-rotation": rotationAt(-0.0025 * width),
  };
};

const splashDuration = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? REDUCED_MOTION_DURATION_MS
    : SPLASH_DURATION_MS;

const SplashScreen = ({ ready = true }) => {
  const { t } = useI18n();
  const [hidden, setHidden] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  const rollPhysics = useMemo(() => createRollPhysics(viewportWidth), [viewportWidth]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => setMinimumElapsed(true), splashDuration());
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    let frame;
    const updateViewport = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setViewportWidth(window.innerWidth));
    };
    window.addEventListener("resize", updateViewport);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!minimumElapsed || !ready) return undefined;
    setLeaving(true);
    const timer = window.setTimeout(() => setHidden(true), 320);
    return () => window.clearTimeout(timer);
  }, [minimumElapsed, ready]);

  useEffect(() => {
    if (!hidden) return;
    document.body.style.overflow = "";
  }, [hidden]);

  if (hidden) return null;

  return (
    <section
      className={`brand-splash${leaving ? " is-leaving" : ""}${minimumElapsed && !ready ? " is-waiting" : ""}`}
      data-testid="splash-screen"
      aria-label={t("appName")}
      aria-busy={!ready}
      style={rollPhysics}
    >
      <div className="brand-splash__stadium" aria-hidden="true">
        <span className="brand-splash__stand brand-splash__stand--left" />
        <span className="brand-splash__stand brand-splash__stand--right" />
        <span className="brand-splash__field" />
        <span className="brand-splash__midline" />
        <span className="brand-splash__circle" />
        <span className="brand-splash__goal" />
      </div>
      <div className="brand-splash__mist" aria-hidden="true" />
      <div className="brand-splash__foreground" aria-hidden="true" />
      <div className="brand-splash__glow brand-splash__glow--one" aria-hidden="true" />
      <div className="brand-splash__glow brand-splash__glow--two" aria-hidden="true" />
      <div className="brand-splash__lights" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
      </div>
      <div className="brand-splash__air" aria-hidden="true">
        {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
      </div>

      <div className="brand-splash__content">
        <div className="brand-splash__ball-stage">
          <span className="brand-splash__trail" aria-hidden="true" />
          <span className="brand-splash__halo" aria-hidden="true" />
          <span className="brand-splash__ball-shadow" aria-hidden="true" />
          {[0, 1, 2].map((burst) => (
            <span key={burst} className={`brand-splash__turf brand-splash__turf--${burst + 1}`} aria-hidden="true">
              {Array.from({ length: 8 }, (_, particle) => <i key={particle} />)}
            </span>
          ))}
          <div className="brand-splash__ball">
            <ClubLogo className="brand-splash__ball-logo h-full w-full" />
          </div>
        </div>
        <div className="brand-splash__identity">
          <h1>Ikas-Txiki Manager</h1>
          <p>Zornotzako Futbol Eskola</p>
        </div>
      </div>
      <div className="brand-splash__progress" aria-hidden="true"><span /></div>
    </section>
  );
};

export default SplashScreen;
