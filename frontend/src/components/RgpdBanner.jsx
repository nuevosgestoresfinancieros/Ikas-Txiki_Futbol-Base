import React, { useState } from "react";
import { Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

const STORAGE_KEY = "ikastxiki_rgpd_accepted";

const RgpdBanner = () => {
  const { t } = useI18n();
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY));

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <aside className="rgpd-banner fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-5" aria-label={t("privacyTitle")}>
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:p-5">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-sm font-bold text-slate-800">{t("privacyTitle")}</p>
            <p className="text-xs leading-relaxed text-slate-600">{t("privacyBody")}</p>
          </div>
        </div>
        <div className="flex w-full flex-shrink-0 items-center gap-2 sm:w-auto">
          <Button onClick={accept} className="flex-1 px-5 text-sm sm:flex-none">
            {t("understood")}
          </Button>
          <button type="button" onClick={accept} aria-label={t("dismiss")} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default RgpdBanner;
