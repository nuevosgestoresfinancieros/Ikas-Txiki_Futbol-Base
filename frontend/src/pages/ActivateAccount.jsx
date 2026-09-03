import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CalendarDays, CheckCircle2, ChevronRight, Circle, Eye, EyeOff, Info,
  KeyRound, Laptop, Loader2, LockKeyhole, MessageCircle, ShieldCheck,
  Share2, Smartphone, Users, XCircle,
} from "lucide-react";
import api from "@/api";
import ClubLogo from "@/components/ClubLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PublicLegalLinks from "@/components/PublicLegalLinks";
import { passwordIsValid, passwordRequirements } from "./resetPasswordValidation";

const valueCards = [
  [Users, "Información de tus hijos e hijas", "Consulta la información deportiva y los datos necesarios de cada jugador o jugadora."],
  [CalendarDays, "Calendario y actividad", "Revisa entrenamientos, eventos, convocatorias y planificación."],
  [MessageCircle, "Comunicación con la escuela", "Recibe avisos importantes y mantén actualizados los datos familiares."],
];

function PasswordField({ id, label, value, onChange, visible, onVisibilityChange, testId, error }) {
  return <div className="space-y-2">
    <label htmlFor={id} className="text-sm font-extrabold text-[#0E3554]">{label}</label>
    <div className="relative">
      <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#2B75B0]" aria-hidden="true" />
      <Input id={id} className="h-14 rounded-2xl border-slate-300 pl-12 pr-14 text-base shadow-sm transition-[border-color,box-shadow] focus-visible:border-[#2B75B0] focus-visible:ring-4 focus-visible:ring-[#93C8EE]/60" type={visible ? "text" : "password"} autoComplete="new-password" value={value} onChange={onChange} required minLength={12} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : `${id}-help`} data-testid={testId} />
      <button type="button" onClick={() => onVisibilityChange(!visible)} aria-label={`${visible ? "Ocultar" : "Mostrar"} ${label.toLowerCase()}`} aria-pressed={visible} className="absolute right-1.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-[#EAF6FD] hover:text-[#0E3554] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2B75B0]">
        {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
    {error ? <p id={`${id}-error`} className="text-sm font-bold text-red-700">{error}</p> : <p id={`${id}-help`} className="sr-only">Usa al menos 12 caracteres e incluye mayúsculas, minúsculas, números y símbolos.</p>}
  </div>;
}

function Requirement({ rule, started }) {
  const fulfilled = started && rule.valid;
  const Icon = !started ? Circle : fulfilled ? CheckCircle2 : XCircle;
  const status = !started ? "Pendiente" : fulfilled ? "Cumplido" : "Pendiente";
  return <li className="flex gap-2 rounded-xl px-2 py-1.5 text-sm text-slate-700 transition-colors duration-200">
    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${fulfilled ? "text-emerald-700" : "text-slate-500"}`} aria-hidden="true" />
    <span><span className="font-bold">{status}:</span> {rule.label}.</span>
  </li>;
}

function WelcomePanel() {
  return <aside className="relative overflow-hidden bg-gradient-to-br from-[#0E3554] via-[#1B5C8F] to-[#2B75B0] p-6 text-white sm:p-9 lg:p-10" aria-labelledby="welcome-title">
    <div className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full border-[28px] border-white/[.07]" />
    <div className="pointer-events-none absolute -bottom-24 -left-20 h-72 w-72 rounded-full border border-[#93C8EE]/30" />
    <div className="pointer-events-none absolute bottom-20 right-0 h-px w-44 rotate-[-32deg] bg-white/20" />
    <div className="relative">
      <header>
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/10 p-2 shadow-lg shadow-blue-950/20"><ClubLogo className="h-full w-full" /></div>
          <div><p className="text-xs font-extrabold uppercase tracking-[.14em] text-[#CFE9FA]">Zornotzako Futbol Eskola</p><p className="mt-1 font-heading text-lg font-extrabold">Ikastxiki</p></div>
        </div>
        <h1 id="welcome-title" className="mt-8 font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">Bienvenido a Ikastxiki</h1>
        <p className="mt-4 max-w-xl text-[15px] leading-7 text-slate-100">Ikastxiki es el espacio digital de tu familia dentro de la escuela de fútbol. Desde aquí podrás acompañar la actividad deportiva de tus hijos e hijas, consultar su información, seguir el calendario y recibir las comunicaciones importantes de la escuela.</p>
      </header>
      <div className="mt-7 grid gap-3">{valueCards.map(([Icon, title, text]) => <section key={title} className="flex gap-3 rounded-2xl border border-white/15 bg-white/[.09] p-4 backdrop-blur-sm"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#93C8EE]/20 text-[#CFE9FA]"><Icon className="h-5 w-5" aria-hidden="true" /></div><div><h2 className="text-sm font-extrabold">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-200">{text}</p></div></section>)}</div>
      <section className="mt-6 rounded-2xl border border-white/20 bg-white/[.08] p-4" aria-labelledby="install-title">
        <div className="flex gap-3"><Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[#93C8EE]" aria-hidden="true" /><div><h2 id="install-title" className="font-heading text-base font-extrabold">Lleva Ikastxiki contigo</h2><p className="mt-1 text-sm leading-5 text-slate-200">Instálala como aplicación web desde tu navegador.</p></div></div>
        <ul className="mt-4 space-y-2 text-sm leading-5 text-slate-100"><li className="flex gap-2"><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[#93C8EE]" aria-hidden="true" /><span><b>Android:</b> Chrome → menú ⋮ → Instalar aplicación.</span></li><li className="flex gap-2"><Share2 className="mt-0.5 h-4 w-4 shrink-0 text-[#93C8EE]" aria-hidden="true" /><span><b>iPhone/iPad:</b> Safari → Compartir → Añadir a pantalla de inicio.</span></li><li className="flex gap-2"><Laptop className="mt-0.5 h-4 w-4 shrink-0 text-[#93C8EE]" aria-hidden="true" /><span><b>Ordenador:</b> Chrome o Edge → icono de instalación.</span></li></ul>
      </section>
    </div>
  </aside>;
}

export default function ActivateAccount() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [touched, setTouched] = useState({});
  const [state, setState] = useState({ loading: false, error: "", completed: false, username: "" });
  const requirements = useMemo(() => passwordRequirements(password), [password]);
  const match = { id: "match", label: "Ambas contraseñas coinciden", valid: Boolean(confirmation) && password === confirmation };
  const allRequirements = [...requirements, match];
  const satisfiedCount = requirements.filter((rule) => rule.valid).length;
  const security = !password ? "Aún no evaluada" : satisfiedCount >= 5 ? "Alta" : satisfiedCount >= 3 ? "Media" : "Baja";
  const confirmationError = touched.confirmation && confirmation && password !== confirmation ? "Las contraseñas no coinciden. Revisa ambos campos." : "";
  const updatePassword = (event) => { setPassword(event.target.value); setTouched((current) => ({ ...current, password: true })); setState((current) => ({ ...current, error: "" })); };
  const updateConfirmation = (event) => { setConfirmation(event.target.value); setTouched((current) => ({ ...current, confirmation: true })); setState((current) => ({ ...current, error: "" })); };
  const submit = async (event) => {
    event.preventDefault();
    if (state.loading) return;
    setTouched({ password: true, confirmation: true });
    const token = params.get("token") || params.get("invitation");
    if (!token) return setState({ loading: false, error: "El enlace de activación no es válido o está incompleto.", completed: false, username: "" });
    if (password !== confirmation) return setState({ loading: false, error: "Las contraseñas no coinciden. Revisa ambos campos.", completed: false, username: "" });
    if (!passwordIsValid(password)) return setState({ loading: false, error: "Revisa los requisitos de seguridad de la contraseña.", completed: false, username: "" });
    setState({ loading: true, error: "", completed: false, username: "" });
    try { const { data } = await api.post("/auth/activate", { token, password, password_confirmation: confirmation }); setState({ loading: false, error: "", completed: true, username: data.username || "" }); } catch (error) { setState({ loading: false, completed: false, username: "", error: error.response?.data?.detail || "No se ha podido activar la cuenta. Solicita una nueva invitación si el enlace ha caducado." }); }
  };
  return <main className="relative min-h-screen min-h-[100dvh] overflow-hidden bg-[#F5F8FC] px-4 py-6 sm:px-6 sm:py-10">
    <div className="pointer-events-none absolute -left-28 top-1/4 h-80 w-80 rounded-full bg-[#93C8EE]/30 blur-3xl" /><div className="pointer-events-none absolute -right-24 top-0 h-96 w-96 rounded-full border-[52px] border-[#93C8EE]/20" />
    <div className="relative mx-auto grid max-w-[1240px] overflow-hidden rounded-[2rem] border border-white/90 bg-white shadow-[0_24px_70px_rgba(14,53,84,.16)] lg:grid-cols-[1.08fr_.92fr] motion-safe:animate-fade-up">
      <WelcomePanel />
      <section className="p-6 sm:p-9 lg:p-10" aria-labelledby="activation-title">
        {state.completed ? <div className="flex min-h-full flex-col justify-center text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><ShieldCheck className="h-9 w-9" aria-hidden="true" /></div><p className="mt-6 text-sm font-extrabold uppercase tracking-[.12em] text-[#1B5C8F]">Cuenta activada</p><h2 id="activation-title" className="mt-2 font-heading text-3xl font-extrabold text-[#0E3554]">Tu acceso está listo</h2><p className="mt-3 leading-7 text-slate-600">Ya puedes iniciar sesión y entrar en el espacio de tu familia.</p>{state.username && <p className="mt-5 rounded-2xl border border-[#CFE9FA] bg-[#EAF6FD] p-4 text-sm text-[#0E3554]">Tu usuario es <strong>{state.username}</strong>. Guárdalo para iniciar sesión.</p>}<Button asChild className="mt-6 h-14 w-full rounded-2xl text-base shadow-lg shadow-blue-900/15"><Link to="/login">Ir a iniciar sesión <ChevronRight className="h-5 w-5" /></Link></Button></div> : <>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#CFE9FA] bg-[#EAF6FD] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.1em] text-[#1B5C8F]"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Acceso seguro</div><h2 id="activation-title" className="mt-5 font-heading text-3xl font-extrabold tracking-tight text-[#0E3554] sm:text-4xl">Crea tu contraseña</h2><p className="mt-3 leading-7 text-slate-600">Esta contraseña protegerá el acceso de tu familia. Al activarla correctamente, entrarás directamente en tu espacio familiar.</p><div className="mt-5 flex gap-3 rounded-2xl border border-[#CFE9FA] bg-[#F5F8FC] p-4 text-sm leading-6 text-[#0E3554]"><Info className="mt-0.5 h-5 w-5 shrink-0 text-[#2B75B0]" aria-hidden="true" /><p><strong>Tu enlace es personal</strong> y solo puede utilizarse una vez.</p></div>
          <form className="mt-6 space-y-5" onSubmit={submit} noValidate><PasswordField id="activation-password" label="Nueva contraseña" value={password} onChange={updatePassword} visible={showPassword} onVisibilityChange={setShowPassword} testId="activation-password" /><div className="rounded-2xl border border-[#CFE9FA] bg-[#F5F8FC] p-4" aria-live="polite"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-[#0E3554]">Seguridad de la contraseña</p><p className="mt-0.5 text-sm font-semibold text-slate-600">Nivel: {security}</p></div><ShieldCheck className="h-7 w-7 shrink-0 text-[#2B75B0]" aria-hidden="true" /></div><div className="mt-3 flex gap-1.5" role="img" aria-label={`Seguridad de la contraseña: ${security}`}>{[1, 2, 3, 4].map((segment) => <span key={segment} className={`h-2 flex-1 rounded-full transition-colors duration-200 ${password && segment <= Math.max(1, Math.ceil(satisfiedCount * 4 / requirements.length)) ? "bg-[#2B75B0]" : "bg-slate-200"}`} />)}</div></div><div className="rounded-2xl border border-[#CFE9FA] bg-[#F5F8FC] p-4" aria-live="polite"><p className="text-sm font-extrabold text-[#0E3554]">Requisitos de seguridad</p><ul className="mt-2 grid gap-1 sm:grid-cols-2">{allRequirements.map((rule) => <Requirement key={rule.id} rule={rule} started={rule.id === "match" ? Boolean(confirmation) : Boolean(password)} />)}</ul></div><PasswordField id="activation-password-confirmation" label="Confirmar contraseña" value={confirmation} onChange={updateConfirmation} visible={showConfirmation} onVisibilityChange={setShowConfirmation} testId="activation-password-confirmation" error={confirmationError} /><div className="flex gap-3 rounded-2xl border border-[#CFE9FA] bg-[#EAF6FD] p-4 text-sm leading-6 text-[#0E3554]"><KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-[#1B5C8F]" aria-hidden="true" /><p><strong>Tu contraseña es personal.</strong> No la compartas con otras personas.</p></div><div role="alert" aria-live="assertive" className={state.error ? "rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700" : "min-h-0"}>{state.error}</div><Button type="submit" disabled={state.loading} className="h-14 w-full rounded-2xl text-base shadow-lg shadow-blue-900/15">{state.loading ? <><Loader2 className="h-5 w-5 animate-spin" />Activando cuenta…</> : <><ShieldCheck className="h-5 w-5" />Activar cuenta y entrar</>}</Button></form>
        </>}
        <footer className="mt-7 border-t border-slate-100 pt-5"><p className="mb-3 text-center text-xs leading-5 text-slate-500">Al continuar, utilizas un acceso protegido para tu familia.</p><PublicLegalLinks /></footer>
      </section>
    </div>
  </main>;
}
