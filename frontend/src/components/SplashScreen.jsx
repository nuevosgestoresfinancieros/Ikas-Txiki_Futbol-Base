import React, { useState, useEffect, useRef } from "react";
import "./splash.css";

const SplashScreen = () => {
  const [hide, setHide] = useState(false);
  const [gone, setGone] = useState(false);
  const autoClose = useRef();

  const close = () => {
    clearTimeout(autoClose.current);
    setHide(true);
    setTimeout(() => setGone(true), 700);
    window.dispatchEvent(new Event("ikasTxikiSplashFinished"));
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    autoClose.current = setTimeout(close, 4000);
    return () => {
      clearTimeout(autoClose.current);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (gone) document.body.style.overflow = "";
  }, [gone]);

  if (gone) return null;

  return (
    <section
      className={`splash-screen${hide ? " hide" : ""}`}
      data-testid="splash-screen"
      aria-label="Animación inicial Ikas-Txiki Fútbol Base"
    >
      <div className="field-lines">
        <div className="center-circle"></div>
        <div className="goal-left"></div>
        <div className="goal-right"></div>
      </div>

      <div className="splash-card">
        <div className="badge">⚽ App de gestión deportiva</div>

        <div className="ball-track" aria-hidden="true">
          <div className="football"></div>
          <div className="ball-shadow"></div>
        </div>

        <h1 className="title">Ikas-Txiki</h1>
        <div className="subtitle">Fútbol Base</div>

        <p className="description">
          Jugadores, familias, equipos y partidos en un solo lugar.
        </p>

        <div className="actions">
          <button className="enter-button" data-testid="splash-enter-btn" type="button" onClick={close}>
            Entrar
          </button>
          <span className="small-note">Inicio automático en unos segundos</span>
        </div>

        <div className="loading-bar" aria-hidden="true">
          <span></span>
        </div>
      </div>
    </section>
  );
};

export default SplashScreen;
