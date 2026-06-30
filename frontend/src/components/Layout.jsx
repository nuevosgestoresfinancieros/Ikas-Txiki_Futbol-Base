import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Home, Shield, CalendarDays, ClipboardList,
  Euro, FileSignature, Settings as SettingsIcon, Menu, X, Trophy,
  UserPlus, Dumbbell, BarChart3, MessageSquare, FileText, Search
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import GlobalSearch from "@/components/GlobalSearch";

const navItems = [
  { to: "/", key: "dashboard", icon: LayoutDashboard, testid: "dashboard" },
  { to: "/inscripciones", key: "inscriptions", icon: UserPlus, testid: "inscriptions" },
  { to: "/jugadores", key: "players", icon: Users, testid: "players" },
  { to: "/familias", key: "families", icon: Home, testid: "families" },
  { to: "/equipos", key: "teams", icon: Shield, testid: "teams" },
  { to: "/entrenamientos", key: "trainings", icon: Dumbbell, testid: "trainings" },
  { to: "/partidos", key: "matches", icon: CalendarDays, testid: "matches" },
  { to: "/convocatorias", key: "callups", icon: ClipboardList, testid: "callups" },
  { to: "/estadisticas", key: "stats", icon: BarChart3, testid: "stats" },
  { to: "/pagos", key: "payments", icon: Euro, testid: "payments" },
  { to: "/autorizaciones", key: "authorizations", icon: FileSignature, testid: "authorizations" },
  { to: "/comunicacion", key: "communications", icon: MessageSquare, testid: "communications" },
  { to: "/informes", key: "reports", icon: FileText, testid: "reports" },
  { to: "/configuracion", key: "settings", icon: SettingsIcon, testid: "settings" },
];

const LangToggle = () => {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1">
      {["es", "eu"].map((l) => (
        <button
          key={l}
          data-testid={`lang-${l}`}
          onClick={() => setLang(l)}
          className={`px-3 py-1 rounded-md text-xs font-bold uppercase transition-colors ${
            lang === l ? "bg-primary text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          {l === "es" ? "ES" : "EU"}
        </button>
      ))}
    </div>
  );
};

const SidebarContent = ({ onNavigate, onSearch }) => {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-white shadow-lg shadow-cyan-500/40">
          <Trophy className="h-6 w-6" />
        </div>
        <div>
          <p className="font-heading text-lg font-bold leading-tight text-white">Ikas-Txiki</p>
          <p className="text-[11px] uppercase tracking-widest text-slate-400">Manager</p>
        </div>
      </div>
      <div className="px-3 pb-2">
        <button
          data-testid="open-global-search"
          onClick={() => { window.dispatchEvent(new CustomEvent("ikastxiki-open-search")); onNavigate?.(); }}
          className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">{t("globalSearch")}</span>
          <kbd className="hidden lg:inline rounded bg-white/10 px-1.5 text-[10px] font-bold">⌘K</kbd>
        </button>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            onClick={onNavigate}
            data-testid={`sidebar-nav-${item.testid}`}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-cyan-500 to-emerald-500 text-white shadow-lg shadow-cyan-500/30 scale-[1.02]"
                  : "text-slate-300 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span>{t(item.key)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-5 border-t border-slate-800">
        <LangToggle />
      </div>
    </div>
  );
};

const Layout = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const { t } = useI18n();
  const current = navItems.find((n) => n.to === location.pathname);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    const onOpen = () => setSearchOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ikastxiki-open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ikastxiki-open-search", onOpen);
    };
  }, []);

  return (
    <div className="min-h-screen">
      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} />
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 z-30 shadow-2xl">
        <SidebarContent onSearch={() => setSearchOpen(true)} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-64 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950">
            <button
              data-testid="close-sidebar-btn"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 text-slate-400 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} onSearch={() => setSearchOpen(true)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between bg-gradient-to-r from-slate-900 to-indigo-950 px-4 py-3 shadow-lg">
          <Button data-testid="open-sidebar-btn" variant="ghost" size="icon" className="text-white hover:bg-slate-800" onClick={() => setOpen(true)}>
            <Menu className="h-6 w-6" />
          </Button>
          <span className="font-heading font-bold text-white">{current ? t(current.key) : "Ikas-Txiki"}</span>
          <Button data-testid="mobile-search-btn" variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => window.dispatchEvent(new CustomEvent("ikastxiki-open-search"))}>
            <Search className="h-5 w-5" />
          </Button>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
