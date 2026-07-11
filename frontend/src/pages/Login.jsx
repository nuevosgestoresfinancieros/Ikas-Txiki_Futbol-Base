import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays, Eye, EyeOff, FileCheck2, Loader2, Lock,
  ShieldCheck, Trophy, User, Users,
} from "lucide-react";
import api from "@/api";
import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";

const featureIcons = [Users, CalendarDays, FileCheck2];
const featureKeys = ["loginFeaturePlayers", "loginFeatureSchedule", "loginFeatureAdmin"];

const Login = ({ onLogin }) => {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [capsLock, setCapsLock] = useState(false);
  const [branding, setBranding] = useState({
    club_nombre: "Ikas-Txiki",
    club_logo: "",
    temporada_actual: "",
  });

  useEffect(() => {
    api.get("/public/branding")
      .then(({ data }) => setBranding((current) => ({ ...current, ...data })))
      .catch(() => {});
  }, []);

  const update = (key) => (event) => {
    setError("");
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.username.trim() || !form.password) {
      setError(t("loginRequired"));
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await api.post("/auth/login", {
        username: form.username.trim(),
        password: form.password,
      });
      onLogin?.(response.data.username);
      const destination = location.state?.from?.pathname || "/";
      navigate(destination, { replace: true });
    } catch (requestError) {
      const status = requestError.response?.status;
      setError(status === 401 ? t("loginInvalid") : status === 429 ? t("loginTooMany") : t("loginNetworkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen min-h-[100dvh] overflow-hidden bg-slate-50 lg:grid lg:grid-cols-[minmax(420px,0.95fr)_minmax(520px,1.05fr)]">
      <section className="relative hidden overflow-hidden bg-[#102a43] px-12 py-10 text-white lg:flex lg:flex-col lg:justify-between" aria-label={t("appName")}>
        <div className="absolute inset-0 opacity-25" aria-hidden="true">
          <div className="absolute inset-[7%] rounded-[2.5rem] border-2 border-white/40" />
          <div className="absolute bottom-[7%] left-1/2 top-[7%] w-0 -translate-x-1/2 border-l-2 border-white/40" />
          <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/40" />
          <div className="absolute -left-16 top-1/2 h-52 w-36 -translate-y-1/2 rounded-r-[3rem] border-2 border-l-0 border-white/40" />
          <div className="absolute -right-16 top-1/2 h-52 w-36 -translate-y-1/2 rounded-l-[3rem] border-2 border-r-0 border-white/40" />
        </div>
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal-400/20 blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-28 -left-20 h-96 w-96 rounded-full bg-emerald-400/15 blur-3xl" aria-hidden="true" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/20 bg-white/10 shadow-lg">
            {branding.club_logo ? (
              <img src={branding.club_logo} alt="" className="h-full w-full object-contain p-1.5" />
            ) : (
              <Trophy className="h-6 w-6 text-teal-300" aria-hidden="true" />
            )}
          </div>
          <div>
            <p className="font-heading text-xl font-bold leading-none">{branding.club_nombre || "Ikas-Txiki"}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">Manager</p>
          </div>
        </div>

        <div className="relative z-10 max-w-xl py-12">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-teal-100 backdrop-blur-sm">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {t("secureAccess")}
          </div>
          <h1 className="font-heading text-5xl font-bold leading-[1.05] tracking-tight xl:text-6xl">
            {t("appTagline")}
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
            {t("splashDescription")}
          </p>

          <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
            {featureKeys.map((key, index) => {
              const Icon = featureIcons[index];
              return (
                <div key={key} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm transition-colors hover:bg-white/[0.12]">
                  <Icon className="mb-3 h-5 w-5 text-teal-300" aria-hidden="true" />
                  <p className="text-sm font-semibold leading-5 text-slate-100">{t(key)}</p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="relative z-10 text-sm text-slate-400">
          {branding.temporada_actual ? `${branding.temporada_actual} · ` : ""}{t("appName")}
        </p>
      </section>

      <section className="relative flex min-h-screen min-h-[100dvh] items-center justify-center px-4 py-20 sm:px-8 lg:py-12">
        <div className="absolute right-4 top-4 flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:right-8 sm:top-7" aria-label="Idioma">
          {["es", "eu"].map((language) => (
            <button
              key={language}
              type="button"
              onClick={() => setLang(language)}
              aria-pressed={lang === language}
              className={`min-h-10 min-w-11 rounded-lg px-3 text-xs font-bold uppercase transition-colors ${
                lang === language ? "bg-[#102a43] text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {language}
            </button>
          ))}
        </div>

        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-[#102a43] text-white shadow-lg shadow-slate-900/15">
              {branding.club_logo ? (
                <img src={branding.club_logo} alt="" className="h-full w-full object-contain p-1.5" />
              ) : (
                <Trophy className="h-7 w-7 text-teal-300" aria-hidden="true" />
              )}
            </div>
            <p className="font-heading text-lg font-bold text-[#102a43]">{branding.club_nombre || "Ikas-Txiki"}</p>
          </div>

          <div className="mb-8">
            <p className="eyebrow mb-3">{t("secureAccess")}</p>
            <h2 className="font-heading text-4xl font-bold tracking-tight text-[#102a43]">{t("loginTitle")}</h2>
            <p className="mt-3 text-base leading-7 text-slate-600">{t("loginSubtitle")}</p>
          </div>

          <form onSubmit={submit} className="space-y-5" noValidate>
            <div className="space-y-2">
              <label htmlFor="login-username" className="text-sm font-semibold text-slate-700">{t("username")}</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="login-username"
                  type="text"
                  value={form.username}
                  onChange={update("username")}
                  placeholder={t("usernamePlaceholder")}
                  autoComplete="username"
                  autoCapitalize="none"
                  autoFocus
                  aria-invalid={!!error}
                  className="h-14 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-4 text-base text-slate-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-semibold text-slate-700">{t("password")}</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="login-password"
                  type={showPwd ? "text" : "password"}
                  value={form.password}
                  onChange={update("password")}
                  onKeyUp={(event) => setCapsLock(event.getModifierState?.("CapsLock") || false)}
                  onKeyDown={(event) => setCapsLock(event.getModifierState?.("CapsLock") || false)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-error" : capsLock ? "caps-lock-note" : undefined}
                  className="h-14 w-full rounded-2xl border border-slate-300 bg-white pl-12 pr-14 text-base text-slate-900 shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((visible) => !visible)}
                  aria-label={showPwd ? t("hidePassword") : t("showPassword")}
                  className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                >
                  {showPwd ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
                </button>
              </div>
              {capsLock && !error && (
                <p id="caps-lock-note" className="text-xs font-medium text-amber-700">
                  {t("capsLockOn")}
                </p>
              )}
            </div>

            <div id="login-error" role="alert" aria-live="polite" className={`min-h-6 rounded-xl text-sm font-medium ${error ? "border border-red-200 bg-red-50 px-3 py-2.5 text-red-700" : ""}`}>
              {error}
            </div>

            <Button type="submit" disabled={loading} className="h-14 w-full rounded-2xl bg-[#102a43] text-base shadow-lg shadow-slate-900/15 hover:bg-[#183b5c]">
              {loading ? (
                <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />{t("loggingIn")}</>
              ) : (
                <>{t("loginButton")}<ShieldCheck className="h-5 w-5" aria-hidden="true" /></>
              )}
            </Button>
          </form>

          <div className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>{t("privacyBody")}</span>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Login;
