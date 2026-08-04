import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3, CalendarDays, ChevronDown, ClipboardList, Dumbbell, Euro,
  FileSignature, FileText, Home, LayoutDashboard, LogOut, Menu,
  MessageSquare, MoreHorizontal, Search, Settings as SettingsIcon,
  HeartHandshake, Shield, Shirt, UserPlus, Users,
} from "lucide-react";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import GlobalSearch from "@/components/GlobalSearch";
import NotificationCenter from "@/components/NotificationCenter";
import AssistantPanel from "@/components/AssistantPanel";
import ClubLogo from "@/components/ClubLogo";
import { can, ROUTE_RESOURCES } from "@/auth";

const navGroups = [
  {
    key: "navStart",
    items: [
      { to: "/", key: "dashboard", icon: LayoutDashboard, testid: "dashboard" },
      { to: "/portal", key: "familyPlayerPortal", icon: HeartHandshake, testid: "portal", roles: ["family", "player"] },
    ],
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
      { to: "/calendario", key: "calendar", icon: CalendarDays, testid: "calendar" },
      { to: "/convocatorias", key: "callups", icon: ClipboardList, testid: "callups" },
      { to: "/estadisticas", key: "stats", icon: BarChart3, testid: "stats", roles: ["admin", "coordinator", "coach"] },
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
    items: [
      { to: "/configuracion", key: "settings", icon: SettingsIcon, testid: "settings" },
      { to: "/usuarios", key: "usersAndPermissions", icon: Shield, testid: "users" },
    ],
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
            lang === language ? "bg-[#1B5C8F] text-white shadow-sm" : "text-sky-100/70 hover:bg-white/10 hover:text-white"
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
  const visibleGroups = useMemo(() => navGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => (!item.roles || item.roles.includes(user?.role)) && can(user, ROUTE_RESOURCES[item.to])) }))
    .filter((group) => group.items.length > 0), [user]);
  const activeGroup = useMemo(
    () => visibleGroups.find((group) => group.items.some((item) => item.to === pathname))?.key,
    [pathname, visibleGroups],
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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-gradient-to-b from-[#0E3554] to-[#1B5C8F] text-white">
      <div className="pointer-events-none absolute -right-28 -top-24 h-72 w-72 rounded-full bg-[#5EA8DC]/15 blur-3xl" aria-hidden="true" />
      <div className="relative flex items-center gap-3 border-b border-white/10 px-5 pb-5 pt-6">
        <ClubLogo className="h-16 w-16 drop-shadow-[0_10px_22px_rgba(0,0,0,0.22)]" />
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-bold leading-tight">Ikas-Txiki Manager</p>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.06em] text-sky-200">Zornotzako Futbol Eskola</p>
        </div>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          data-testid="open-global-search"
          onClick={() => { onSearch(); onNavigate?.(); }}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/15 bg-white/[0.08] px-3 text-sm font-medium text-sky-50/80 shadow-inner shadow-white/[0.03] backdrop-blur-sm transition-all hover:border-white/25 hover:bg-white/[0.14] hover:text-white"
        >
          <Search className="h-5 w-5 text-[#93C8EE]" aria-hidden="true" />
          <span className="flex-1 text-left">{t("globalSearch")}</span>
          <kbd className="hidden rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-300 xl:inline">⌘K</kbd>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3" aria-label={t("mainNavigation")}>
        {visibleGroups.map((group) => {
          const isExpanded = expanded[group.key];
          return (
            <div key={group.key} className="mb-2">
              <button
                type="button"
                onClick={() => setExpanded((current) => ({ ...current, [group.key]: !current[group.key] }))}
                aria-expanded={isExpanded}
                className="flex min-h-9 w-full items-center justify-between rounded-lg px-3 text-left text-[11px] font-bold uppercase tracking-[0.16em] text-sky-100/45 transition-colors hover:bg-white/5 hover:text-sky-50/80"
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
                            ? "border-white/20 bg-white/[0.15] text-white shadow-[0_8px_22px_rgba(2,24,44,0.18)]"
                            : "border-transparent text-sky-50/75 hover:translate-x-0.5 hover:bg-white/[0.09] hover:text-white"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon className={`h-5 w-5 shrink-0 ${isActive ? "text-[#93C8EE]" : "text-sky-100/45 group-hover:text-[#93C8EE]"}`} aria-hidden="true" />
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
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-sm font-bold text-[#93C8EE] shadow-sm">
              {user.username?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-200">{user.username}</span>
              <span className="block truncate text-[10px] font-bold uppercase tracking-wide text-[#93C8EE]">{t(`role_${user.role}`)}</span>
            </div>
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

const MobileBottomNav = ({ onMenu, onSearch, user }) => {
  const { t } = useI18n();
  const items = user?.role === "family" || user?.role === "player" ? [
    { to: "/portal", key: "familyPlayerPortal", icon: HeartHandshake },
    { to: "/calendario", key: "calendar", icon: CalendarDays },
    { to: "/convocatorias", key: "callups", icon: ClipboardList },
  ] : [
    { to: "/", key: "navStart", icon: LayoutDashboard },
    { to: "/jugadores", key: "players", icon: Users },
    { to: "/calendario", key: "calendar", icon: CalendarDays },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_35px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden" aria-label={t("mainNavigation")}>
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1 py-1.5">
        {items.filter((item) => can(user, ROUTE_RESOURCES[item.to])).map((item) => (
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
      <a href="#main-content" className="fixed left-4 top-3 z-[120] -translate-y-24 rounded-xl bg-[#0E3554] px-4 py-3 text-sm font-bold text-white shadow-xl transition-transform focus:translate-y-0">
        {t("skipToContent")}
      </a>
      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} />

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col shadow-[14px_0_40px_rgba(14,53,84,0.16)] lg:flex">
        <SidebarContent pathname={location.pathname} onSearch={() => setSearchOpen(true)} user={user} onLogout={onLogout} />
      </aside>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" closeLabel={t("closeMenu")} className="w-[min(88vw,20rem)] max-w-none border-0 bg-[#0E3554] p-0 text-white [&>button]:right-2 [&>button]:top-2 [&>button]:z-10 [&>button]:text-sky-100 [&>button:hover]:bg-white/10 [&>button:hover]:text-white">
          <SheetTitle className="sr-only">{t("mainNavigation")}</SheetTitle>
          <SidebarContent pathname={location.pathname} onNavigate={() => setOpen(false)} onSearch={() => setSearchOpen(true)} user={user} onLogout={onLogout} />
        </SheetContent>
      </Sheet>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 hidden min-h-[4.5rem] items-center justify-between border-b border-[#CFE9FA]/80 bg-white/95 px-8 shadow-[0_8px_24px_rgba(14,53,84,0.055)] backdrop-blur-xl lg:flex">
          <div className="flex items-center gap-3">
            <ClubLogo className="h-9 w-9" />
            <span className="font-heading text-sm font-extrabold text-[#0E3554]">{current ? t(current.key) : "Ikas-Txiki Manager"}</span>
          </div>
          <NotificationCenter user={user} />
        </header>
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-white/10 bg-gradient-to-r from-[#0E3554]/95 to-[#1B5C8F]/95 px-3 text-white shadow-[0_8px_24px_rgba(14,53,84,0.18)] backdrop-blur-xl lg:hidden">
          <Button data-testid="open-sidebar-btn" variant="ghost" size="icon" aria-label={t("openMenu")} className="text-white hover:bg-white/10 hover:text-white" onClick={() => setOpen(true)}>
            <Menu className="h-6 w-6" aria-hidden="true" />
          </Button>
          <ClubLogo className="h-11 w-11" />
          <div className="flex items-center"><NotificationCenter user={user} dark /><Button data-testid="mobile-search-btn" variant="ghost" size="icon" aria-label={t("globalSearch")} className="text-white hover:bg-white/10 hover:text-white" onClick={() => setSearchOpen(true)}><Search className="h-5 w-5" aria-hidden="true" /></Button></div>
        </header>

        <main id="main-content" tabIndex="-1" className="mx-auto max-w-[1440px] px-4 pb-28 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pb-10 lg:pt-8 xl:px-10">
          {children}
        </main>
      </div>

      <MobileBottomNav user={user} onMenu={() => setOpen(true)} onSearch={() => setSearchOpen(true)} />
      <AssistantPanel user={user} />
    </div>
  );
};

export default Layout;
