import React, { useEffect, useState } from "react";
import { Download, MonitorDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isIOSDevice, isStandaloneApp } from "@/lib/pwa";

const InstallAppButton = ({ dark = false, compact = false }) => {
  const [promptEvent, setPromptEvent] = useState(null);
  const [showIOSHint, setShowIOSHint] = useState(false);

  useEffect(() => {
    if (isStandaloneApp()) return undefined;

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    setShowIOSHint(isIOSDevice());

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (isStandaloneApp() || (!promptEvent && !showIOSHint)) return null;

  const install = async () => {
    if (promptEvent) {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") setPromptEvent(null);
      return;
    }

    window.alert("Para instalar la app en iPhone/iPad: pulsa Compartir y después “Añadir a pantalla de inicio”.");
  };

  const Icon = compact ? Download : MonitorDown;
  const label = showIOSHint && !promptEvent ? "Cómo instalar" : "Instalar app";

  return (
    <Button
      type="button"
      data-testid="install-pwa-btn"
      variant={dark ? "ghost" : "outline"}
      size={compact ? "icon" : "sm"}
      aria-label={label}
      title={label}
      onClick={install}
      className={dark ? "text-white hover:bg-white/10 hover:text-white" : ""}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {!compact && <span>{label}</span>}
    </Button>
  );
};

export default InstallAppButton;
