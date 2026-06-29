import React, { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Users, Home, Shield, CalendarDays, ClipboardList,
  Euro, FileSignature, Settings as SettingsIcon, Menu, X, Trophy,
  UserPlus, Dumbbell, BarChart3, MessageSquare, FileText
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";

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

const SidebarContent = ({ onNavigate }) => {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/30">
          <Trophy className="h-6 w-6" />
        </div>
        <div>
          <p className="font-heading text-lg font-bold leading-tight text-white">Ikas-Txiki</p>
          <p className="text-[11px] uppercase tracking-widest text-slate-400">Manager</p>
        </div>
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
              `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-primary text-white shadow-md shadow-primary/20"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
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
  const location = useLocation();
  const { t } = useI18n();
  const current = navItems.find((n) => n.to === location.pathname);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col bg-[#111827] z-30">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative w-64 bg-[#111827]">
            <button
              data-testid="close-sidebar-btn"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-4 text-slate-400 hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <SidebarContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between bg-[#111827] px-4 py-3">
          <Button data-testid="open-sidebar-btn" variant="ghost" size="icon" className="text-white hover:bg-slate-800" onClick={() => setOpen(true)}>
            <Menu className="h-6 w-6" />
          </Button>
          <span className="font-heading font-bold text-white">{current ? t(current.key) : "Ikas-Txiki"}</span>
          <div className="w-9" />
        </header>

        <main className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
