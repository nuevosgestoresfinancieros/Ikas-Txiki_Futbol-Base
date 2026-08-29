import React, { useEffect, useMemo, useRef, useState } from "react";
import { Compass, ExternalLink, HelpCircle, Loader2, Send, ShieldCheck, X } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  actionLabelKey, canCreateProposal, normalizeGuidedValue,
  currentAssistantModule, safeAssistantLinks, safeAssistantModules, suggestedQuestions,
} from "@/components/assistantView";

const AssistantPanel = ({ user }) => {
  const { lang, t } = useI18n();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [capabilities, setCapabilities] = useState(null);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intent, setIntent] = useState("");
  const [values, setValues] = useState({});
  const [targetId, setTargetId] = useState("");
  const [proposal, setProposal] = useState(null);
  const panelTitleRef = useRef(null);
  const triggerRef = useRef(null);

  const selectedCapability = useMemo(
    () => capabilities?.actions?.find((item) => item.intent === intent),
    [capabilities, intent],
  );
  const questions = useMemo(() => suggestedQuestions(location.pathname, t), [location.pathname, t]);
  const modules = useMemo(() => safeAssistantModules(capabilities?.modules), [capabilities]);
  const currentModule = useMemo(
    () => currentAssistantModule(location.pathname, modules),
    [location.pathname, modules],
  );

  useEffect(() => {
    if (!open || capabilities) return;
    api.get("/assistant/capabilities")
      .then((response) => setCapabilities(response.data))
      .catch(() => setError(t("assistantLoadError")));
  }, [open, capabilities, t]);

  useEffect(() => {
    if (open) window.setTimeout(() => panelTitleRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setProposal(null);
    setValues({});
    setTargetId("");
  }, [intent]);

  const ask = async (question = message) => {
    const clean = String(question || "").trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    setHistory((current) => [...current.slice(-7), { role: "user", text: clean }]);
    try {
      const response = await api.post("/assistant/help", {
        message: clean, route: location.pathname, language: lang,
      });
      setHistory((current) => [...current.slice(-7), {
        role: "assistant", text: response.data.text,
        channel: response.data.channel, links: safeAssistantLinks(response.data.links),
        privacyNotice: response.data.privacy_notice,
      }]);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t("assistantError"));
    } finally {
      setBusy(false);
    }
  };

  const prepare = async () => {
    if (!selectedCapability || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = Object.fromEntries(
        Object.entries(values)
          .filter(([, value]) => value !== "")
          .map(([field, value]) => [field, normalizeGuidedValue(field, value)]),
      );
      const response = await api.post("/assistant/proposals", {
        intent, target_id: targetId || null, data,
      });
      setProposal(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t("assistantProposalError"));
    } finally {
      setBusy(false);
    }
  };

  const cancelProposal = async () => {
    if (!proposal) return;
    try { await api.post(`/assistant/proposals/${proposal.id}/cancel`); }
    finally { setProposal(null); }
  };

  const confirmProposal = async () => {
    if (!proposal || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post(
        `/assistant/proposals/${proposal.id}/confirm`,
        { confirmation_nonce: proposal.confirmation_nonce },
        { headers: { "X-Assistant-Confirm": "true" } },
      );
      setHistory((current) => [...current.slice(-7), { role: "assistant", text: t("assistantChangeSaved"), channel: "internal" }]);
      setProposal(null);
      setValues({});
      setTargetId("");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t("assistantConfirmError"));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (!nextOpen) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <Button
        type="button"
        data-testid="assistant-trigger"
        className="assistant-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={t("assistantCibermedida")}
        ref={triggerRef}
      >
        <img
          src="/mascota-ikastxiki.png"
          alt="Mascota de Ikastxiki"
          className="assistant-trigger-avatar"
        />
        <span>{t("assistantCibermedida")}</span>
      </Button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          closeLabel={t("close")}
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[min(100vw,30rem)]"
          aria-label={t("assistantTitle")}
        >
          <SheetHeader className="border-b bg-slate-50 p-5 text-left">
            <SheetTitle ref={panelTitleRef} tabIndex="-1" className="flex items-center gap-2">
              <img
                src="/mascota-ikastxiki.png"
                alt="Mascota de Ikastxiki"
                className="h-8 w-8 rounded-full border border-primary/20 object-cover object-top"
              />
              {t("assistantTitle")}
            </SheetTitle>
            <SheetDescription>{t("assistantDescription")}</SheetDescription>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="note">
              {t("assistantPrivacyWarning")}
            </div>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            <section className="mb-5 rounded-xl border bg-primary/5 p-3" aria-labelledby="assistant-context-title">
              <h3 id="assistant-context-title" className="flex items-center gap-2 text-sm font-semibold">
                <Compass className="h-4 w-4 text-primary" aria-hidden="true" />
                {t("assistantCurrentContext")}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                {currentModule ? t(`assistantModule_${currentModule.id}`) : t("assistantModule_unknown")}
                {user?.role ? ` · ${t(`role_${user.role}`)}` : ""}
              </p>
            </section>

            <section aria-labelledby="assistant-help-title">
              <h3 id="assistant-help-title" className="mb-2 flex items-center gap-2 font-semibold">
                <HelpCircle className="h-4 w-4" aria-hidden="true" />{t("assistantGeneralHelp")}
              </h3>
              {!history.length && (
                <div className="assistant-welcome mb-4 rounded-xl border border-primary/15 bg-primary/5 p-3 sm:p-4">
                  <img
                    src="/mascota-ikastxiki.png"
                    alt="Mascota de Ikastxiki"
                    className="assistant-welcome-mascot"
                  />
                  <div className="text-center sm:text-left">
                    <p className="font-semibold text-slate-900">{t("assistantWelcomeTitle")}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{t("assistantWelcomeDescription")}</p>
                  </div>
                </div>
              )}
              <div className="mb-3 flex flex-wrap gap-2">
                {questions.map((question) => (
                  <button key={question} type="button" onClick={() => ask(question)} className="rounded-full border px-3 py-2 text-left text-xs font-medium hover:bg-slate-50">
                    {question}
                  </button>
                ))}
              </div>
              <div className="space-y-3" aria-live="polite">
                {history.map((item, index) => (
                  <div key={`${item.role}-${index}`} className={`rounded-xl p-3 text-sm ${item.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-4 border bg-slate-50"}`}>
                    {item.role === "assistant" && (
                      <div className="mb-1 flex items-center gap-2">
                        <img
                          src="/mascota-ikastxiki.png"
                          alt="Mascota de Ikastxiki"
                          className="h-6 w-6 rounded-full border border-primary/20 object-cover object-top"
                        />
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          {item.channel === "external" ? t("assistantGeneralChannel") : t("assistantInternalChannel")}
                        </span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{item.text}</p>
                    {item.privacyNotice && item.privacyNotice !== "provider_not_configured" && (
                      <p className="mt-2 text-xs font-medium text-amber-700">{t("assistantProcessedInternally")}</p>
                    )}
                    {item.links?.map((link) => (
                      <Link key={link} to={link} onClick={() => handleOpenChange(false)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-primary underline">
                        {t("assistantOpenModule")} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); ask(); }}>
                <Label htmlFor="assistant-message" className="sr-only">{t("assistantQuestion")}</Label>
                <Input id="assistant-message" value={message} maxLength={1200} onChange={(event) => setMessage(event.target.value)} placeholder={t("assistantPlaceholder")} />
                <Button type="submit" size="icon" disabled={busy || !message.trim()} aria-label={t("assistantSend")}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </section>

            {!!modules.length && (
              <section className="mt-6 border-t pt-5" aria-labelledby="assistant-modules-title">
                <h3 id="assistant-modules-title" className="mb-1 flex items-center gap-2 font-semibold">
                  <Compass className="h-4 w-4" aria-hidden="true" />{t("assistantAvailableModules")}
                </h3>
                <p className="mb-3 text-xs text-slate-500">{t("assistantAvailableModulesHelp")}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {modules.map((module) => (
                    <Link
                      key={module.id}
                      to={module.routes[0]}
                      onClick={() => handleOpenChange(false)}
                      aria-current={currentModule?.id === module.id ? "page" : undefined}
                      className={`flex min-h-11 items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium hover:bg-slate-50 ${currentModule?.id === module.id ? "border-primary bg-primary/5 text-primary" : ""}`}
                    >
                      {t(`assistantModule_${module.id}`)}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6 border-t pt-5" aria-labelledby="assistant-guided-title">
              <h3 id="assistant-guided-title" className="mb-1 flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />{t("assistantGuidedManagement")}
              </h3>
              <p className="mb-3 text-xs text-slate-500">{t("assistantGuidedDescription")}</p>
              {!capabilities?.actions?.length ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm">{t("assistantNoActions")}</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="assistant-intent">{t("assistantAction")}</Label>
                    <Select value={intent} onValueChange={setIntent}>
                      <SelectTrigger id="assistant-intent"><SelectValue placeholder={t("assistantSelectAction")} /></SelectTrigger>
                      <SelectContent>
                        {capabilities.actions.map((item) => (
                          <SelectItem key={item.intent} value={item.intent}>{t(actionLabelKey(item.intent))}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedCapability?.required.includes("target_id") && (
                    <div><Label htmlFor="assistant-target">{t("assistantTargetId")}</Label><Input id="assistant-target" value={targetId} onChange={(event) => setTargetId(event.target.value)} /></div>
                  )}
                  {selectedCapability?.fields.map((field) => (
                    <div key={field}>
                      <Label htmlFor={`assistant-${field}`}>{t(`assistantField_${field}`)}</Label>
                      <Input id={`assistant-${field}`} value={values[field] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))} />
                    </div>
                  ))}
                  <Button type="button" className="w-full" onClick={prepare} disabled={busy || !canCreateProposal(selectedCapability, values, targetId)}>
                    {t("assistantPreparePreview")}
                  </Button>
                </div>
              )}
            </section>

            {proposal && (
              <section className="mt-5 rounded-xl border-2 border-primary/30 bg-primary/5 p-4" aria-labelledby="assistant-preview-title">
                <h3 id="assistant-preview-title" className="font-semibold">{t("assistantExactPreview")}</h3>
                <p className="mt-1 text-xs text-slate-600">{t(actionLabelKey(proposal.intent))}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  {Object.entries(proposal.preview?.changes || {}).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
                      <dt className="font-medium">{t(`assistantField_${key}`)}</dt>
                      <dd className="break-words text-right">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
                    </div>
                  ))}
                </dl>
                {!!proposal.preview?.possible_duplicates?.length && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{t("assistantPossibleDuplicates")}</p>}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={cancelProposal}><X className="mr-1 h-4 w-4" />{t("assistantCancel")}</Button>
                  <Button type="button" onClick={confirmProposal} disabled={busy}><ShieldCheck className="mr-1 h-4 w-4" />{t("assistantConfirm")}</Button>
                </div>
              </section>
            )}
            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</div>}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default AssistantPanel;
