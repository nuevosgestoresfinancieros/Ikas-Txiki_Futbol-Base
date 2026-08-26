import React from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, RefreshCw } from "lucide-react";
import ClubLogo from "@/components/ClubLogo";
import { Button } from "@/components/ui/button";
import { isStaleAssetError } from "@/lib/staleAssetRecovery";

const STALE_ASSET_RELOAD_KEY = "ikastxiki:stale-asset-reload";

/** Prevent an unexpected render error from leaving the application blank. */
export default class AppErrorBoundary extends React.Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // Keep the error available to browser diagnostics without exposing it to users.
    console.error("Error de renderizado de Ikas-Txiki", error, info);

    // A deployed CRA build can replace an old lazy-loaded chunk while an
    // installed PWA is still running its previous entry bundle. Retry once
    // with a cache-busting navigation instead of showing an opaque error.
    if (isStaleAssetError(error) && !window.sessionStorage.getItem(STALE_ASSET_RELOAD_KEY)) {
      window.sessionStorage.setItem(STALE_ASSET_RELOAD_KEY, "1");
      const url = new URL(window.location.href);
      url.searchParams.set("_ikastxiki_refresh", Date.now().toString());
      window.location.replace(url.toString());
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"><section className="w-full max-w-lg rounded-3xl border bg-white p-8 text-center shadow-xl"><ClubLogo className="mx-auto mb-4 h-14 w-14" /><AlertTriangle className="mx-auto mb-3 h-9 w-9 text-amber-600" /><h1 className="font-heading text-xl font-bold text-slate-900">No se ha podido cargar esta pantalla</h1><p className="mt-2 text-sm text-slate-600">Recarga la página. Si el problema continúa, solicita una nueva invitación o contacta con la administración.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Button type="button" onClick={() => window.location.reload()}><RefreshCw className="h-4 w-4" />Recargar</Button><Button asChild variant="outline"><Link to="/login">Volver al inicio de sesión</Link></Button></div></section></main>;
  }
}
