import React, { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import api from "@/api";
import ClubLogo from "@/components/ClubLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ActivateAccount() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [state, setState] = useState({ loading: false, error: "", completed: false });
  const submit = async (event) => {
    event.preventDefault();
    if (!params.get("token")) return setState({ loading: false, error: "El enlace de activación no es válido.", completed: false });
    if (password !== confirmation) return setState({ loading: false, error: "Las contraseñas no coinciden.", completed: false });
    setState({ loading: true, error: "", completed: false });
    try {
      await api.post("/auth/activate", { token: params.get("token"), password, password_confirmation: confirmation });
      setState({ loading: false, error: "", completed: true });
    } catch (error) { setState({ loading: false, completed: false, error: error.response?.data?.detail || "No se ha podido activar la cuenta." }); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"><section className="w-full max-w-md rounded-3xl border bg-white p-7 shadow-xl"><div className="mb-6 flex items-center gap-3"><ClubLogo className="h-12 w-12" /><div><h1 className="font-heading text-xl font-bold">Activa tu acceso familiar</h1><p className="text-sm text-slate-600">Crea una contraseña personal y segura.</p></div></div>{state.completed ? <div className="space-y-4 text-center"><ShieldCheck className="mx-auto h-12 w-12 text-emerald-600" /><p className="font-semibold">Tu cuenta ya está activa.</p><Button asChild><Link to="/login">Ir a iniciar sesión</Link></Button></div> : <form className="space-y-4" onSubmit={submit}><label className="block text-sm font-semibold">Contraseña nueva<Input className="mt-1" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} /></label><label className="block text-sm font-semibold">Repite la contraseña<Input className="mt-1" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required /></label><p className="text-xs text-slate-500">Mínimo 12 caracteres, con mayúscula, minúscula, número y símbolo.</p>{state.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}<Button className="w-full" disabled={state.loading}>{state.loading ? "Activando…" : "Activar cuenta"}</Button></form>}</section></main>;
}
