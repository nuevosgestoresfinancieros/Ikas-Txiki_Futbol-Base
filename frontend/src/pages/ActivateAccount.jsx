import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import api from "@/api";
import ClubLogo from "@/components/ClubLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ActivateAccount() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [state, setState] = useState({ loading: false, error: "", completed: false, username: "" });
  const submit = async (event) => {
    event.preventDefault();
    if (!params.get("token")) return setState({ loading: false, error: "El enlace de activación no es válido o está incompleto.", completed: false, username: "" });
    if (password !== confirmation) return setState({ loading: false, error: "Las contraseñas no coinciden. Revisa ambos campos.", completed: false, username: "" });
    const passwordChecks = [
      [password.length >= 12, "Debe tener al menos 12 caracteres."],
      [/[A-Z]/.test(password), "Debe incluir una letra mayúscula."],
      [/[a-z]/.test(password), "Debe incluir una letra minúscula."],
      [/\d/.test(password), "Debe incluir un número."],
      [/[^A-Za-z0-9]/.test(password), "Debe incluir un símbolo."],
    ];
    const failedCheck = passwordChecks.find(([valid]) => !valid);
    if (failedCheck) return setState({ loading: false, error: failedCheck[1], completed: false, username: "" });
    setState({ loading: true, error: "", completed: false, username: "" });
    try {
      const { data } = await api.post("/auth/activate", { token: params.get("token"), password, password_confirmation: confirmation });
      setState({ loading: false, error: "", completed: true, username: data.username || "" });
    } catch (error) { setState({ loading: false, completed: false, username: "", error: error.response?.data?.detail || "No se ha podido activar la cuenta. Solicita una nueva invitación si el enlace ha caducado." }); }
  };
  const PasswordField = ({ label, value, onChange, visible, onVisibilityChange, testId }) => <label className="block text-sm font-semibold">{label}<span className="relative mt-1 block"><Input className="pr-12" type={visible ? "text" : "password"} autoComplete="new-password" value={value} onChange={onChange} required minLength={12} data-testid={testId} /><button type="button" onClick={() => onVisibilityChange(!visible)} aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visible} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><span className="sr-only">{visible ? "Ocultar contraseña" : "Mostrar contraseña"}</span>{visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}</button></span></label>;
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"><section className="w-full max-w-md rounded-3xl border bg-white p-7 shadow-xl"><div className="mb-6 flex items-center gap-3"><ClubLogo className="h-12 w-12" /><div><h1 className="font-heading text-xl font-bold">Activa tu acceso familiar</h1><p className="text-sm text-slate-600">Crea una contraseña personal y segura.</p></div></div>{state.completed ? <div className="space-y-4 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-emerald-600" /><p className="font-semibold">Tu cuenta ya está activa.</p>{state.username && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-950">Tu usuario es <strong>{state.username}</strong>. Guárdalo para iniciar sesión.</p>}<Button asChild><Link to="/login">Ir a iniciar sesión</Link></Button></div> : <form className="space-y-4" onSubmit={submit}><PasswordField label="Contraseña nueva" value={password} onChange={(e) => setPassword(e.target.value)} visible={showPassword} onVisibilityChange={setShowPassword} testId="activation-password" /><PasswordField label="Repite la contraseña" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} visible={showConfirmation} onVisibilityChange={setShowConfirmation} testId="activation-password-confirmation" /><p className="text-xs text-slate-500">Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.</p>{state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}<Button className="w-full" disabled={state.loading}>{state.loading ? "Activando…" : "Activar cuenta"}</Button></form>}</section></main>;
}
