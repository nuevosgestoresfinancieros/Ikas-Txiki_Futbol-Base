import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3, CalendarDays, ChevronDown, ClipboardList, Dumbbell, Euro,
  FileSignature, FileText, Home, LayoutDashboard, LogOut, Menu,
  MessageSquare, MoreHorizontal, Search, Settings as SettingsIcon,
  Shield, Shirt, Trophy, UserPlus, Users,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import GlobalSearch from "@/components/GlobalSearch";

const navGroups = [
  {
    key: "navStart",
    items: [{ to: "/", key: "dashboard", icon: LayoutDashboard, testid: "dashboard" }],
  },
  {
    key: "navPeople",
    items: [
      { to: "/inscripciones", key: "inscriptions", icon: UserPlus, testid: "inscriptions" },
      { to: "/jugadores", key: "players", icon: Users, testid: "players" },
      { to: "/familias", key: "families", icon: Home, testid: "families" },
    ],
  },
  {
    key: "navSport",
    items: [
      { to: "/equipos", key: "teams", icon: Shield, testid: "teams" },
      { to: "/equipamiento", key: "equipment", icon: Shirt, testid: "equipment" },
      { to: "/entrenamientos", key: "trainings", icon: Dumbbell, testid: "trainings" },
      { to: "/partidos", key: "matches", icon: CalendarDays, testid: "matches" },
      { to: "/convocatorias", key: "callups", icon: ClipboardList, testid: "callups" },
      { to: "/estadisticas", key: "stats", icon: BarChart3, testid: "stats" },
    ],
  },
  {
    key: "navManagement",
    items: [
      { to: "/pagos", key: "payments", icon: Euro, testid: "payments" },
      { to: "/autorizaciones", key: "authorizations", icon: FileSignature, testid: "authorizations" },
      { to: "/comunicacion", key: "communications", icon: MessageSquare, testid: "communications" },
      { to: "/informes", key: "reports", icon: FileText, testid: "reports" },
    ],
  },
  {
    key: "navSystem",
    items: [{ to: "/configuracion", key: "settings", icon: SettingsIcon, testid: "settings" }],
  },
];

const navItems = navGroups.flatMap((group) => group.items);

const LangToggle = () => {
  const { lang, setLang } = useI18n();
  return (
    <div className="flex rounded-xl border border-white/10 bg-white/[0.06] p-1" aria-label="Idioma">
      {["es", "eu"].map((language) => (
        <button
          key={language}
          type="button"
          data-testid={`lang-${language}`}
          onClick={() => setLang(language)}
          aria-pressed={lang === language}
          className={`min-h-10 flex-1 rounded-lg px-3 text-xs font-bold uppercase transition-colors ${
            lang === language ? "bg-teal-500 text-white shadow-sm" : "text-slate-400 hover:bg-white/10 hover:text-white"
          }`}
        >
          {language}
        </button>
      ))}
    </div>
  );
};

const SidebarContent = ({ onNavigate, onSearch, user, onLogout, pathname }) => {
  const { t } = useI18n();
  const activeGroup = useMemo(
    () => navGroups.find((group) => group.items.some((item) => item.to === pathname))?.key,
    [pathname],
  );
  const [expanded, setExpanded] = useState(() => ({
    navStart: true,
    navPeople: true,
    navSport: activeGroup === "navSport",
    navManagement: activeGroup === "navManagement",
    navSystem: activeGroup === "navSystem",
  }));

  useEffect(() => {
    if (activeGroup) setExpanded((current) => ({ ...current, [activeGroup]: true }));
  }, [activeGroup]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#091c2f] text-white">
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-teal-400 to-emerald-500 text-white shadow-lg shadow-teal-950/35">
          <Trophy className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-heading text-xl font-bold leading-tight">Ikas-Txiki</p>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-300">Manager</p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          data-testid="open-global-search"
          onClick={() => { onSearch(); onNavigate?.(); }}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          <Search className="h-5 w-5 text-teal-300" aria-hidden="true" />
          <span className="flex-1 text-left">{t("globalSearch")}</span>
          <kbd className="hidden rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300 xl:inline">⌘K</kbd>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label={t("mainNavigation")}>
        {navGroups.map((group) => {
          const isExpanded = expanded[group.key];
          return (
            <div key={group.key} className="mb-2">
              <button
                type="button"
                onClick={() => setExpanded((current) => ({ ...current, [group.key]: !current[group.key] }))}
                aria-expanded={isExpanded}
                className="flex min-h-9 w-full items-center justify-between rounded-lg px-3 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
              >
                {t(group.key)}
                <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
              {isExpanded && (
                <div className="mt-1 space-y-1">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      onClick={onNavigate}
                      data-testid={`sidebar-nav-${item.testid}`}
                      className={({ isActive }) =>
                        `group flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm font-semibold transition-[color,background-color,border-color] duration-150 ${
                          isActive
                            ? "border-teal-400/20 bg-teal-400/15 text-white"
                            : "border-transparent text-slate-300 hover:bg-white/[0.07] hover:text-white"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-teal-300" : "text-slate-500 group-hover:text-slate-300"}`} aria-hidden="true" />
                          <span>{t(item.key)}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-3">
        {user && (
          <div className="mb-2 flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-400/15 text-sm font-bold text-teal-300">
              {user[0]?.toUpperCase()}
            </div>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-200">{user}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onLogout}
          className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{t("logout")}</span>
        </button>
      </div>
      <div className="border-t border-white/10 px-4 py-4"><LangToggle /></div>
    </div>
  );
};

const MobileBottomNav = ({ onMenu, onSearch }) => {
  const { t } = useI18n();
  const items = [
    { to: "/", key: "navStart", icon: LayoutDashboard },
    { to: "/jugadores", key: "players", icon: Users },
    { to: "/partidos", key: "matches", icon: CalendarDays },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_35px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden" aria-label={t("mainNavigation")}>
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1 py-1.5">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>
            <item.icon className="h-5 w-5" aria-hidden="true" />
            <span>{t(item.key)}</span>
          </NavLink>
        ))}
        <button type="button" onClick={onSearch} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
          <Search className="h-5 w-5" aria-hidden="true" />
          <span>{t("search").replace("...", "")}</span>
        </button>
        <button type="button" onClick={onMenu} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900">
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          <span>{t("more")}</span>
        </button>
      </div>
    </nav>
  );
};

const Layout = ({ children, onLogout, user }) => {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const { t } = useI18n();
  const current = navItems.find((item) => item.to === location.pathname);

  useEffect(() => {
    document.body.classList.add("app-authenticated");
    return () => document.body.classList.remove("app-authenticated");
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  return (
    <div className="min-h-screen min-h-[100dvh]">
      <a href="#main-content" className="fixed left-4 top-3 z-[120] -translate-y-24 rounded-xl bg-[#102a43] px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform focus:translate-y-0">
        {t("skipToContent")}
      </a>
      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col shadow-2xl lg:flex">
        <SidebarContent pathname={location.pathname} onSearch={() => setSearchOpen(true)} user={user} onLogout={onLogout} />
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" closeLabel={t("closeMenu")} className="w-[min(88vw,20rem)] max-w-none border-0 bg-[#091c2f] p-0 text-white [&>button]:right-2 [&>button]:top-2 [&>button]:z-10 [&>button]:text-slate-300 [&>button:hover]:bg-white/10 [&>button:hover]:text-white">
          <SheetTitle className="sr-only">{t("mainNavigation")}</SheetTitle>
          <SidebarContent pathname={location.pathname} onNavigate={() => setOpen(false)} onSearch={() => setSearchOpen(true)} user={user} onLogout={onLogout} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-white/10 bg-[#102a43]/95 px-3 text-white shadow-md backdrop-blur-xl lg:hidden">
          <Button data-testid="open-sidebar-btn" variant="ghost" size="icon" aria-label={t("openMenu")} className="text-white hover:bg-white/10 hover:text-white" onClick={() => setOpen(true)}>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </Button>
          <span className="max-w-[60vw] truncate font-heading font-bold">{current ? t(current.key) : "Ikas-Txiki"}</span>
          <Button data-testid="mobile-search-btn" variant="ghost" size="icon" aria-label={t("globalSearch")} className="text-white hover:bg-white/10 hover:text-white" onClick={() => setSearchOpen(true)}>
            <Search className="h-5 w-5" aria-hidden="true" />
          </Button>
        </header>

        <main id="main-content" tabIndex="-1" className="mx-auto max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10 lg:pt-8 xl:px-10">
          {children}
        </main>
      </div>

      <MobileBottomNav onMenu={() => setOpen(true)} onSearch={() => setSearchOpen(true)} />
    </div>
  );
};

export default Layout;
