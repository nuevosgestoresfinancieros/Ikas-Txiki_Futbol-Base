import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ClipboardPenLine, Download, Eraser, Loader2, PenLine, ShieldAlert, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SIGNATURE_CANVAS_WIDTH = 800;
const SIGNATURE_CANVAS_HEIGHT = 220;

const errorMessage = (error, t, fallback) => {
  const detail = error.response?.data?.detail;
  if (detail === "Solo se aceptan PDF, JPG, PNG o WEBP") return t("familyAuthInvalidType");
  if (detail === "El archivo supera el tamaño máximo permitido" || detail === "La firma electrónica supera el tamaño máximo permitido") return t("familyAuthFileTooLarge");
  if (detail === "El archivo no contiene un PDF válido" || detail === "La imagen no tiene un formato válido" || detail === "La firma electrónica debe ser una imagen PNG válida" || detail === "La firma electrónica no se puede leer") return t("familyAuthInvalidFile");
  if (detail === "No tienes permiso para realizar esta acción") return t("familyAuthPermissionError");
  return detail || fallback;
};

function SignaturePad({ onChange }) {
  const { t } = useI18n();
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasInkRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext?.("2d");
    if (!context) return undefined;
    context.clearRect(0, 0, SIGNATURE_CANVAS_WIDTH, SIGNATURE_CANVAS_HEIGHT);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, SIGNATURE_CANVAS_WIDTH, SIGNATURE_CANVAS_HEIGHT);
    context.strokeStyle = "#0E3554";
    context.lineWidth = 3;
    context.lineCap = "round";
    context.lineJoin = "round";
    hasInkRef.current = false;
    onChange(false);
    return undefined;
  }, [onChange]);

  const point = (event) => {
    const canvas = canvasRef.current;
    const bounds = canvas.getBoundingClientRect();
    const width = bounds.width || SIGNATURE_CANVAS_WIDTH;
    const height = bounds.height || SIGNATURE_CANVAS_HEIGHT;
    return {
      x: ((event.clientX - bounds.left) / width) * SIGNATURE_CANVAS_WIDTH,
      y: ((event.clientY - bounds.top) / height) * SIGNATURE_CANVAS_HEIGHT,
    };
  };

  const start = (event) => {
    const canvas = canvasRef.current;
    drawingRef.current = true;
    canvas.setPointerCapture?.(event.pointerId);
    const position = point(event);
    const context = canvas.getContext?.("2d");
    context?.beginPath();
    context?.moveTo(position.x, position.y);
  };

  const move = (event) => {
    if (!drawingRef.current) return;
    const position = point(event);
    const context = canvasRef.current.getContext?.("2d");
    context?.lineTo(position.x, position.y);
    context?.stroke();
    hasInkRef.current = true;
    onChange(true);
  };

  const stop = () => {
    drawingRef.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext?.("2d");
    context?.clearRect(0, 0, SIGNATURE_CANVAS_WIDTH, SIGNATURE_CANVAS_HEIGHT);
    if (context) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, SIGNATURE_CANVAS_WIDTH, SIGNATURE_CANVAS_HEIGHT);
    }
    hasInkRef.current = false;
    onChange(false);
  };

  return <div className="space-y-2">
    <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white">
      <canvas
        ref={canvasRef}
        width={SIGNATURE_CANVAS_WIDTH}
        height={SIGNATURE_CANVAS_HEIGHT}
        data-testid="family-signature-canvas"
        className="h-36 w-full touch-none cursor-crosshair"
        aria-label={t("familyAuthSignatureArea")}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onPointerLeave={stop}
      />
    </div>
    <Button type="button" variant="ghost" size="sm" onClick={clear}><Eraser className="h-4 w-4" />{t("familyAuthClearSignature")}</Button>
  </div>;
}

function AuthorizationRow({ authorization, busy, onDownload, onUpload, onSign }) {
  const { t } = useI18n();
  const inputRef = useRef(null);
  const complete = Boolean(authorization.has_signed_file);
  return <article className={`rounded-2xl border p-4 ${complete ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60"}`} data-testid={`family-authorization-${authorization.id}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-bold text-slate-900">{t(`authType_${authorization.tipo}`)}</p>
        <p className={`mt-1 text-xs font-bold ${complete ? "text-emerald-700" : "text-amber-800"}`}>
          {complete ? t("familyAuthComplete") : t("familyAuthPending")}
        </p>
      </div>
      {complete ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" aria-label={t("familyAuthComplete")} /> : <ShieldAlert className="h-5 w-5 shrink-0 text-amber-700" aria-label={t("familyAuthPending")} />}
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onDownload}><Download className="h-4 w-4" />{t("familyAuthDownload")}</Button>
      {!complete && <>
        <input ref={inputRef} type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => onUpload(event, inputRef)} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}><UploadCloud className="h-4 w-4" />{t("familyAuthUpload")}</Button>
        <Button type="button" size="sm" disabled={busy} onClick={onSign}><PenLine className="h-4 w-4" />{t("familyAuthSignElectronically")}</Button>
      </>}
      {busy && <Loader2 className="mt-2 h-4 w-4 animate-spin text-primary" aria-label={t("loading")} />}
    </div>
  </article>;
}

export default function FamilyAuthorizationOnboarding({ data, user, onRefresh, fullPage = false, onLater }) {
  const { t, lang } = useI18n();
  const [selectedChildId, setSelectedChildId] = useState("");
  const [signing, setSigning] = useState(null);
  const [signerName, setSignerName] = useState("");
  const [consent, setConsent] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [busyId, setBusyId] = useState("");

  const children = useMemo(() => data?.children || [], [data?.children]);
  const pendingCount = Number(data?.pending_count || 0);
  const totalCount = Number(data?.total_count || 0);
  const selectedChild = children.find((child) => child.player_id === selectedChildId) || children[0];
  useEffect(() => {
    if (!selectedChildId && children[0]?.player_id) setSelectedChildId(children[0].player_id);
  }, [children, selectedChildId]);

  if (!user || user.role !== "family" || !data?.required || !pendingCount) return null;

  const download = async (authorization) => {
    setBusyId(authorization.id);
    try {
      const response = await api.get(`/authorizations/${authorization.id}/pdf?lang=${lang}`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `autorizacion_${authorization.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error, t, t("downloadError")));
    } finally {
      setBusyId("");
    }
  };

  const upload = async (event, inputRef) => {
    const file = event.target.files?.[0];
    const authorizationId = event.target.closest("article")?.dataset?.testid?.replace("family-authorization-", "");
    if (!file || !authorizationId) return;
    setBusyId(authorizationId);
    const form = new FormData();
    form.append("file", file);
    try {
      await api.post(`/authorizations/${authorizationId}/upload-signed`, form);
      toast.success(t("familyAuthReceived"));
      await onRefresh?.();
    } catch (error) {
      toast.error(errorMessage(error, t, t("familyAuthUploadError")));
    } finally {
      if (inputRef?.current) inputRef.current.value = "";
      setBusyId("");
    }
  };

  const openSignature = (authorization) => {
    setSignerName([user.first_name, user.last_name].filter(Boolean).join(" "));
    setConsent(false);
    setHasSignature(false);
    setSigning(authorization);
  };

  const submitSignature = async (event) => {
    event.preventDefault();
    if (!hasSignature) { toast.error(t("familyAuthNoSignature")); return; }
    if (!signerName.trim()) { toast.error(t("familyAuthSignerRequired")); return; }
    if (!consent) { toast.error(t("familyAuthConsentRequired")); return; }
    const canvas = document.querySelector("[data-testid='family-signature-canvas']");
    if (!canvas) return;
    setBusyId(signing.id);
    try {
      await api.post(`/authorizations/${signing.id}/sign`, {
        signature_data: canvas.toDataURL("image/png"),
        signer_name: signerName.trim(),
        consent: true,
        consent_version: "family-authorization-v1",
      });
      toast.success(t("familyAuthReceived"));
      setSigning(null);
      await onRefresh?.();
    } catch (error) {
      toast.error(errorMessage(error, t, t("familyAuthSignatureError")));
    } finally {
      setBusyId("");
    }
  };

  const content = <section className="mx-auto w-full max-w-4xl rounded-[1.75rem] border border-[#CFE9FA] bg-white p-5 shadow-[0_20px_60px_rgba(14,53,84,.12)] sm:p-7" aria-labelledby="family-auth-onboarding-title" data-testid="family-auth-onboarding">
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#EAF6FD] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.08em] text-[#1B5C8F]"><ClipboardPenLine className="h-4 w-4" />{t("familyAuthOnboardingEyebrow")}</div>
        <h2 id="family-auth-onboarding-title" className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-[#0E3554] sm:text-3xl">{t("familyAuthOnboardingTitle")}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{t("familyAuthOnboardingIntro")}</p>
      </div>
      <ShieldAlert className="hidden h-9 w-9 shrink-0 text-amber-600 sm:block" aria-hidden="true" />
    </div>

    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
      <div className="flex items-center justify-between gap-3 text-sm font-bold text-amber-900"><span>{t("familyAuthProgress")}</span><span>{pendingCount} / {totalCount}</span></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100" aria-label={t("familyAuthProgress")} role="progressbar" aria-valuemin="0" aria-valuemax={totalCount} aria-valuenow={totalCount - pendingCount}><div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${totalCount ? ((totalCount - pendingCount) / totalCount) * 100 : 0}%` }} /></div>
      <p className="mt-3 text-sm leading-6 text-amber-900">{t("familyAuthPendingNotice")}</p>
    </div>

    {children.length > 1 && <div className="mt-6 flex gap-2 overflow-x-auto pb-1" aria-label={t("familyAuthChildren")}>
      {children.map((child) => <button key={child.player_id} type="button" onClick={() => setSelectedChildId(child.player_id)} aria-pressed={selectedChild?.player_id === child.player_id} className={`min-h-11 shrink-0 rounded-xl border px-4 text-left text-sm font-bold ${selectedChild?.player_id === child.player_id ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-700"}`}>{child.name}<span className="ml-2 text-xs opacity-80">{child.pending_count}</span></button>)}
    </div>}

    {selectedChild && <div className="mt-6"><h3 className="font-heading text-lg font-bold text-slate-900">{selectedChild.name}</h3><div className="mt-3 space-y-3">{selectedChild.authorizations.map((authorization) => <AuthorizationRow key={authorization.id} authorization={authorization} busy={busyId === authorization.id} onDownload={() => download(authorization)} onUpload={upload} onSign={() => openSignature(authorization)} />)}</div></div>}

    <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">{t("familyAuthSimpleNotice")}</p>{onLater && <Button type="button" variant="outline" onClick={onLater}><X className="h-4 w-4" />{t("familyAuthLater")}</Button>}</div>

    {signing && <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-labelledby="family-sign-title"><div className="mx-auto mt-8 w-full max-w-2xl rounded-[1.5rem] bg-white p-5 shadow-2xl sm:mt-16 sm:p-7"><div className="flex items-start justify-between gap-4"><div><h3 id="family-sign-title" className="font-heading text-2xl font-extrabold text-[#0E3554]">{t("familyAuthSignTitle")}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{t(`authType_${signing.tipo}`)} · {t("familyAuthSignHelp")}</p></div><Button type="button" size="icon" variant="ghost" aria-label={t("close")} onClick={() => setSigning(null)}><X className="h-5 w-5" /></Button></div><form className="mt-5 space-y-4" onSubmit={submitSignature}><div><label htmlFor="family-signer-name" className="text-sm font-bold text-slate-700">{t("familyAuthSignerName")}</label><Input id="family-signer-name" value={signerName} onChange={(event) => setSignerName(event.target.value)} className="mt-2" autoComplete="name" required /></div><div><p className="text-sm font-bold text-slate-700">{t("familyAuthDrawSignature")}</p><div className="mt-2"><SignaturePad onChange={setHasSignature} /></div></div><label className="flex items-start gap-3 rounded-2xl border border-[#CFE9FA] bg-[#F5F8FC] p-4 text-sm leading-6 text-[#0E3554]"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4" />{t("familyAuthConsent")}</label><p className="text-xs leading-5 text-slate-500">{t("familyAuthLegalNotice")}</p><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setSigning(null)}>{t("cancel")}</Button><Button type="submit" disabled={busyId === signing.id}><PenLine className="h-4 w-4" />{busyId === signing.id ? t("saving") : t("familyAuthSaveSignature")}</Button></div></form></div></div>}
  </section>;

  return fullPage ? <div className="fixed inset-0 z-50 overflow-y-auto bg-[#F5F8FC] p-4 sm:p-8"><div className="flex min-h-full items-center justify-center">{content}</div></div> : content;
}
