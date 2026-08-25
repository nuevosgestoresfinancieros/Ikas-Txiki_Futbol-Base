import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Mail, Search, Users } from "lucide-react";
import api from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";

export default function BulkAccountProvisioning({ type, onCancel, onCompleted }) {
  const { t } = useI18n();
  const familyMode = type === "family";
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const idKey = familyMode ? "family_id" : "player_id";
  const nameKey = familyMode ? "family_name" : "player_name";
  const endpoint = `/account-provisioning/${familyMode ? "families" : "players"}`;
  const candidatesLoadError = t("candidatesLoadError");
  const eligible = (row) => ["ready", "pending", "expired"].includes(row.status) && Boolean(row.email);

  useEffect(() => {
    setBusy(true); setError("");
    api.get(endpoint).then(({ data }) => setRows(data)).catch((requestError) => setError(requestError.response?.data?.detail || candidatesLoadError)).finally(() => setBusy(false));
  }, [endpoint, candidatesLoadError]);

  const visible = useMemo(() => rows.filter((row) => `${row[nameKey]} ${row.email || ""} ${row.category || ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [rows, search, nameKey]);
  const selectableVisible = visible.filter(eligible).map((row) => row[idKey]);
  const toggle = (id) => { setReview(false); setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); };
  const submit = async () => {
    setBusy(true); setError("");
    try {
      const payload = familyMode ? { family_ids: selected } : { player_ids: selected };
      const response = await api.post(`${endpoint}/invitations`, payload);
      setResult(response.data); onCompleted?.();
    } catch (requestError) { setError(requestError.response?.data?.detail || t("accountsCreateError")); }
    finally { setBusy(false); }
  };

  const statusLabels = { ready: t("readyToInvite"), pending: t("invitationPending"), expired: t("invitationExpired"), active: t("activeAccount"), missing_email: t("missingValidEmail") };
  if (result) {
    const sent = result.results.filter((item) => item.status === "sent").length;
    const failed = result.results.filter((item) => item.status === "failed").length;
    const skipped = result.results.length - sent - failed;
    return <section className="space-y-4"><div className="rounded-2xl bg-emerald-50 p-5 text-emerald-950"><CheckCircle2 className="mb-2 h-8 w-8" /><h3 className="font-bold">{t("processCompleted")}</h3><p>{t("invitationsResult").replace("{sent}", sent).replace("{remaining}", skipped + failed)}</p><dl className="mt-4 grid grid-cols-3 gap-2 text-center text-sm"><div className="rounded-xl bg-white/70 p-2"><dt>{t("sent")}</dt><dd className="text-lg font-bold">{sent}</dd></div><div className="rounded-xl bg-white/70 p-2"><dt>{t("failed")}</dt><dd className="text-lg font-bold">{failed}</dd></div><div className="rounded-xl bg-white/70 p-2"><dt>{t("pending")}</dt><dd className="text-lg font-bold">{skipped}</dd></div></dl></div><Button type="button" onClick={onCancel}>{t("close")}</Button></section>;
  }

  return <section className="space-y-4">
    <div className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-950"><strong>{t(familyMode ? "bulkFamilyTitle" : "bulkPlayerTitle")}</strong><p className="mt-1">{t("bulkAccessIntro")}</p></div>
    <div className="flex flex-col gap-2 sm:flex-row"><label className="relative flex-1"><span className="sr-only">{t("search")}</span><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchNameEmail")} /></label><Button type="button" variant="outline" onClick={() => { setReview(false); setSelected((current) => selectableVisible.every((id) => current.includes(id)) ? current.filter((id) => !selectableVisible.includes(id)) : [...new Set([...current, ...selectableVisible])]); }}>{t("selectAllAvailable")}</Button></div>
    {busy && !rows.length ? <p className="py-8 text-center text-slate-500">{t("loadingCandidates")}</p> : error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p> : <div className="max-h-80 space-y-2 overflow-y-auto">{visible.map((row) => <label key={row[idKey]} className={`flex items-start gap-3 rounded-xl border p-3 ${eligible(row) ? "cursor-pointer" : "bg-slate-50 opacity-70"}`}><input type="checkbox" className="mt-1" disabled={!eligible(row)} checked={selected.includes(row[idKey])} onChange={() => toggle(row[idKey])} /><span className="min-w-0 flex-1"><strong className="block text-slate-900">{row[nameKey]}</strong><span className="block text-xs text-slate-500">{[row.category, row.email, familyMode ? t("playersCount").replace("{count}", row.children.length) : row.family_name].filter(Boolean).join(" · ")}</span></span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold">{statusLabels[row.status] || row.status}</span></label>)}</div>}
    {review && <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><div className="flex gap-2"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" /><div><strong>{t("finalConfirmation")}</strong><p className="text-sm">{t("bulkConfirmationDetail").replace("{count}", selected.length)}</p></div></div></div>}
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><Button type="button" variant="outline" onClick={onCancel}>{t("cancel")}</Button>{review ? <Button type="button" disabled={busy || !selected.length} onClick={submit}><Mail className="h-4 w-4" />{t("confirmCreateSend")}</Button> : <Button type="button" disabled={!selected.length} onClick={() => setReview(true)}><Users className="h-4 w-4" />{t("reviewSelection")} ({selected.length})</Button>}</div>
  </section>;
}
