import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Shield, CalendarDays, Home, UserPlus, Euro, CornerDownLeft, X } from "lucide-react";
import api from "@/api";
import { useI18n } from "@/i18n";

const TYPE_META = {
  player: { icon: Users, color: "text-emerald-600 bg-emerald-100" },
  team: { icon: Shield, color: "text-orange-600 bg-orange-100" },
  match: { icon: CalendarDays, color: "text-blue-600 bg-blue-100" },
  family: { icon: Home, color: "text-cyan-600 bg-cyan-100" },
  inscription: { icon: UserPlus, color: "text-amber-600 bg-amber-100" },
  payment: { icon: Euro, color: "text-fuchsia-600 bg-fuchsia-100" },
};
const TYPE_ORDER = ["player", "team", "match", "family", "inscription", "payment"];

const GlobalSearch = ({ open, setOpen }) => {
  const { t } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef();
  const timer = useRef();

  const doSearch = useCallback((value) => {
    clearTimeout(timer.current);
    if (!value.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await api.get("/search", { params: { q: value } });
        setResults(res.data);
      } catch (e) { setResults([]); }
      setLoading(false);
    }, 250);
  }, []);

  useEffect(() => {
    if (open) {
      setQ(""); setResults([]);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const go = (r) => { setOpen(false); nav(r.route); };

  const grouped = TYPE_ORDER
    .map((type) => ({ type, items: results.filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center p-4 pt-[12vh]" data-testid="global-search-dialog">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden animate-fade-up">
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search className="h-5 w-5 text-cyan-500 shrink-0" />
          <input
            ref={inputRef}
            data-testid="global-search-input"
            value={q}
            onChange={(e) => { setQ(e.target.value); doSearch(e.target.value); }}
            placeholder={t("globalSearchPlaceholder")}
            className="flex-1 h-14 bg-transparent text-base outline-none placeholder:text-slate-400"
          />
          <button onClick={() => setOpen(false)} data-testid="close-global-search" className="text-slate-400 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading && <p className="px-3 py-6 text-center text-sm text-slate-400">…</p>}
          {!loading && q.trim() && grouped.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-slate-400" data-testid="search-no-results">{t("searchNoResults")}</p>
          )}
          {!loading && !q.trim() && (
            <p className="px-3 py-8 text-center text-sm text-slate-400">{t("searchTypeToStart")}</p>
          )}
          {!loading && grouped.map((g) => {
            const Meta = TYPE_META[g.type];
            const Icon = Meta.icon;
            return (
              <div key={g.type} className="mb-2">
                <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t(`resType_${g.type}`)}</p>
                {g.items.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    data-testid={`search-result-${r.id}`}
                    onClick={() => go(r)}
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-cyan-50 transition-colors"
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${Meta.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{r.title}</p>
                      <p className="truncate text-xs text-slate-500">{r.subtitle}</p>
                    </div>
                    <CornerDownLeft className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearch;
