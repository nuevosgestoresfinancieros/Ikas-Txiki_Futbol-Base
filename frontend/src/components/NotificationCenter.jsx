import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { notificationPreferenceKeys, priorityDotClass, unreadLabel } from "@/components/notificationView";

export default function NotificationCenter({ user, dark = false }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [preferences, setPreferences] = useState(() => ({ in_app: true, email: true, callups: true, schedule_changes: true, payments: true, documents: true, ...(user?.notification_preferences || {}) }));
  const [providers, setProviders] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const [notifications, providerData] = await Promise.all([api.get("/notifications"), api.get("/notifications/providers")]);
      setItems(notifications.data.items || []); setUnread(notifications.data.unread || 0); setProviders(providerData.data || {});
    } catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const timer = window.setInterval(load, 60000); return () => window.clearInterval(timer); }, [load]);

  const markRead = async (item) => {
    if (!item.read_at) await api.patch(`/notifications/${item.id}/read`);
    setOpen(false); if (item.link) navigate(item.link); await load();
  };
  const markAll = async () => { await api.patch("/notifications/read-all"); await load(); };
  const savePreferences = async (next) => {
    const previous = preferences;
    setPreferences(next);
    try { await api.patch("/notifications/preferences", next); }
    catch { setPreferences(previous); setError(true); }
  };

  return <>
    <Button variant="ghost" size="icon" aria-label={t("notifications")} onClick={() => setOpen(true)} className={`relative ${dark ? "text-white hover:bg-white/10 hover:text-white" : "bg-white text-slate-700 shadow-md hover:bg-slate-50"}`}>
      <Bell className="h-5 w-5" />{unread > 0 && <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unreadLabel(unread)}</span>}
    </Button>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="right" closeLabel={t("close")} className="w-[min(94vw,26rem)] max-w-none overflow-y-auto p-0">
      <SheetDescription className="sr-only">{t("notificationCenterDescription")}</SheetDescription>
      <div className="sticky top-0 z-10 border-b bg-white px-5 py-4"><div className="flex items-center justify-between gap-3"><SheetTitle>{t("notifications")}</SheetTitle>{unread > 0 && <Button variant="ghost" size="sm" onClick={markAll}><CheckCheck className="h-4 w-4" />{t("markAllRead")}</Button>}</div></div>
      {loading && items.length === 0 ? <div className="p-8 text-center text-sm text-slate-500" role="status">{t("loading")}</div>
        : error && items.length === 0 ? <div className="flex flex-col items-center gap-3 p-8 text-center text-red-600" role="alert"><p>{t("notificationsLoadError")}</p><Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" />{t("retry")}</Button></div>
        : items.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{t("noNotifications")}</p>
        : <div className="divide-y">{items.map((item) => <button key={item.id} type="button" onClick={() => markRead(item)} className={`w-full p-4 text-left hover:bg-slate-50 ${item.read_at ? "bg-white" : "bg-teal-50/60"}`}><div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${priorityDotClass(item.priority)}`} /><div className="min-w-0"><p className="font-semibold text-slate-900">{item.title}</p><p className="mt-1 line-clamp-3 text-sm text-slate-600">{item.message}</p><p className="mt-2 text-xs text-slate-400">{new Date(item.created_at).toLocaleString()}</p></div></div></button>)}</div>}
      <section className="border-t bg-slate-50 p-5"><h3 className="mb-3 font-bold text-slate-900">{t("notificationPreferences")}</h3><div className="space-y-2">{notificationPreferenceKeys.map((key) => <label key={key} className="flex min-h-11 items-center justify-between rounded-xl bg-white px-3 text-sm"><span>{t(`notificationPref_${key}`)}</span><input type="checkbox" checked={preferences[key] !== false} onChange={(event) => savePreferences({ ...preferences, [key]: event.target.checked })} /></label>)}</div><div className="mt-4 text-xs text-slate-500"><p>{t("providerEmail")}: {providers.email?.configured ? t("configured") : t("notConfigured")}</p><p>WhatsApp: {providers.whatsapp?.configured ? t("configuredOptional") : t("notConfigured")}</p><p>SMS: {providers.sms?.configured ? t("configuredOptional") : t("notConfigured")}</p></div></section>
    </SheetContent></Sheet>
  </>;
}
