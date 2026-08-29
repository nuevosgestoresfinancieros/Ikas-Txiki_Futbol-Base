import React, { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Shield, Home, CornerDownLeft, X } from "lucide-react";
import api from "@/api";
import { useI18n } from "@/i18n";

const TYPE_META = {
  player: { icon: Users, color: "text-emerald-600 bg-emerald-100" },
  team: { icon: Shield, color: "text-orange-600 bg-orange-100" },
  family: { icon: Home, color: "text-cyan-600 bg-cyan-100" },
};
const TYPE_ORDER = ["player", "family", "team"];

const GlobalSearch = ({ open, setOpen }) => {
  const { t } = useI18n();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef();
  const timer = useRef();
  const requestId = useRef(0);

  const runSearch = useCallback(async (value) => {
    const request = ++requestId.current;
    const query = value.trim();
    if (!query) { setResults([]); setLoading(false); setError(""); return []; }
    setLoading(true); setError("");
    try {
      const response = await api.get("/search", { params: { q: query } });
      const next = Array.isArray(response.data) ? response.data : [];
      if (request === requestId.current) { setResults(next); setActiveIndex(0); }
      return next;
    } catch (requestError) {
      if (request === requestId.current) { setResults([]); setError(requestError.response?.data?.detail || t("globalSearchError")); }
      return [];
    } finally { if (request === requestId.current) setLoading(false); }
  }, [t]);

  const scheduleSearch = useCallback((value) => {
    clearTimeout(timer.current);
    if (!value.trim()) { setResults([]); setLoading(false); setError(""); return; }
    timer.current = setTimeout(() => runSearch(value), 250);
  }, [runSearch]);

  useEffect(() => {
    if (open) { setQ(""); setResults([]); setError(""); setActiveIndex(0); setTimeout(() => inputRef.current?.focus(), 80); }
  }, [open]);
  useEffect(() => {
    const onEscape = (event) => { if (event.key === "Escape") setOpen(false); };
    if (open) window.addEventListener("keydown", onEscape);
    return () => { window.removeEventListener("keydown", onEscape); clearTimeout(timer.current); };
  }, [open, setOpen]);
  if (!open) return null;

  const grouped = TYPE_ORDER.map((type) => ({ type, items: results.filter((result) => result.type === type) })).filter((group) => group.items.length);
  const flatResults = grouped.flatMap((group) => group.items);
  const go = (result) => { if (!result) return; setOpen(false); nav(result.route); };
  const submit = async () => { clearTimeout(timer.current); const next = await runSearch(q); if (next.length) go(next[0]); };
  const onKeyDown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
    else if (event.key === "ArrowDown" && flatResults.length) { event.preventDefault(); setActiveIndex((index) => (index + 1) % flatResults.length); }
    else if (event.key === "ArrowUp" && flatResults.length) { event.preventDefault(); setActiveIndex((index) => (index - 1 + flatResults.length) % flatResults.length); }
    else if (event.key === "Enter") { event.preventDefault(); if (flatResults[activeIndex]) go(flatResults[activeIndex]); else submit(); }
  };

  return <div className="fixed inset-0 z-[100] flex items-start justify-center p-3 pt-[8vh] sm:p-4 sm:pt-[12vh]" data-testid="global-search-dialog" role="dialog" aria-modal="true" aria-labelledby="global-search-title">
    <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
    <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-fade-up">
      <h2 id="global-search-title" className="sr-only">{t("globalSearch")}</h2>
      <form className="flex items-center gap-3 border-b border-slate-100 px-3 sm:px-4" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <button type="submit" aria-label={t("search")} data-testid="global-search-submit" className="flex h-11 w-11 items-center justify-center rounded-xl text-cyan-600 hover:bg-cyan-50"><Search className="h-5 w-5" /></button>
        <input ref={inputRef} data-testid="global-search-input" value={q} onChange={(event) => { setQ(event.target.value); setResults([]); setActiveIndex(0); scheduleSearch(event.target.value); }} onKeyDown={onKeyDown} placeholder={t("globalSearchPlaceholder")} aria-label={t("globalSearch")} className="h-16 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400" />
        <button type="button" aria-label={t("dismiss")} onClick={() => setOpen(false)} data-testid="close-global-search" className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
      </form>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {loading && <p className="px-3 py-6 text-center text-sm text-slate-400">…</p>}
        {!loading && error && <p className="px-3 py-8 text-center text-sm text-red-700" role="alert" data-testid="search-error">{error}</p>}
        {!loading && !error && q.trim() && !grouped.length && <p className="px-3 py-8 text-center text-sm text-slate-400" data-testid="search-no-results">{t("searchNoResults")}</p>}
        {!loading && !q.trim() && <p className="px-3 py-8 text-center text-sm text-slate-400">{t("searchTypeToStart")}</p>}
        {!loading && grouped.map((group) => { const Meta = TYPE_META[group.type]; const Icon = Meta.icon; return <div key={group.type} className="mb-2"><p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t(`resType_${group.type}`)}</p>{group.items.map((result) => { const index = flatResults.indexOf(result); return <button key={`${result.type}-${result.id}`} data-testid={`search-result-${result.id}`} onClick={() => go(result)} className={`group flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#EAF6FD] focus-visible:bg-[#EAF6FD] ${index === activeIndex ? "bg-[#EAF6FD]" : ""}`}><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${Meta.color}`}><Icon className="h-4 w-4" /></div><div className="flex-1 min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{result.title}</p><p className="truncate text-xs text-slate-500">{result.subtitle}</p></div><CornerDownLeft className="h-4 w-4 text-slate-300" /></button>; })}</div>; })}
      </div>
    </div>
  </div>;
};
export default GlobalSearch;
