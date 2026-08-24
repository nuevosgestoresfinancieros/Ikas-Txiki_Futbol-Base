import React, { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, MonitorDown, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { detectPwaState } from "@/lib/pwa";

const InstallAppCard = ({ compact = false }) => {
  const [promptEvent, setPromptEvent] = useState(null);
  const [state, setState] = useState(() => ({ standalone: false, ios: false, chromium: true }));

  useEffect(() => {
    setState(detectPwaState());

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
    };

    const onInstalled = () => {
      setPromptEvent(null);
      setState((current) => ({ ...current, standalone: true }));
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setPromptEvent(null);
  };

  const openAppHint = () => {
    window.alert("Si Chrome muestra “Abrir en aplicación” arriba en la barra, pulsa ahí. Si quieres tenerla fija, abre la app y en el Dock selecciona Opciones → Mantener en el Dock.");
  };

  const iosHint = () => {
    window.alert("En iPhone/iPad: pulsa Compartir y después “Añadir a pantalla de inicio”.");
  };

  const alreadyInstalled = state.standalone;
  const canInstall = Boolean(promptEvent);
  const likelyInstalled = !state.standalone && !promptEvent && state.chromium && !state.ios;

  const title = alreadyInstalled
    ? "Ya estás usando Ikas-Txiki como app"
    : canInstall
      ? "Instala Ikas-Txiki en este ordenador"
      : likelyInstalled
        ? "Ikas-Txiki ya está instalada"
        : state.ios
          ? "Instala Ikas-Txiki en iPhone/iPad"
          : "Instala Ikas-Txiki como aplicación";

  const description = alreadyInstalled
    ? "Perfecto: se ha abierto sin navegador, como una aplicación independiente."
    : canInstall
      ? "Ábrela desde el escritorio, Dock o Launchpad, sin depender de una pestaña del navegador."
      : likelyInstalled
        ? "Chrome ya la reconoce como instalada. Usa “Abrir en aplicación” en la barra superior para abrirla como app independiente."
        : state.ios
          ? "Añádela a la pantalla de inicio para abrirla como una app normal."
          : "Para instalarla como app de escritorio, abre esta web con Chrome o Edge.";

  const Icon = alreadyInstalled ? CheckCircle2 : state.ios ? Share2 : MonitorDown;
  const action = canInstall
    ? { label: "Instalar app", onClick: install }
    : likelyInstalled
      ? { label: "Cómo abrirla", onClick: openAppHint }
      : state.ios
        ? { label: "Ver instrucciones", onClick: iosHint }
        : null;

  return (
    <section
      data-testid="install-app-card"
      className={`rounded-3xl border border-[#CFE9FA] bg-white shadow-[0_10px_30px_rgba(14,53,84,0.08)] ${compact ? "p-4" : "p-5"}`}
      aria-label="Instalar Ikas-Txiki como app"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EAF6FD] text-[#1B5C8F]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold text-slate-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
        {action && (
          <Button type="button" data-testid="install-app-card-btn" onClick={action.onClick} className="h-11 shrink-0 px-5">
            {likelyInstalled ? <ExternalLink className="h-4 w-4" aria-hidden="true" /> : <MonitorDown className="h-4 w-4" aria-hidden="true" />}
            {action.label}
          </Button>
        )}
      </div>
    </section>
  );
};

export default InstallAppCard;
