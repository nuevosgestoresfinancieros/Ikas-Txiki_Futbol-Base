import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider, useI18n } from "@/i18n";
import { lazy, Suspense, useState, useEffect } from "react";
import api from "@/api";
import Layout from "@/components/Layout";
import RgpdBanner from "@/components/RgpdBanner";
import Login from "@/pages/Login";
import SplashScreen from "@/components/SplashScreen";

const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Players = lazy(() => import("@/pages/Players"));
const Families = lazy(() => import("@/pages/Families"));
const Teams = lazy(() => import("@/pages/Teams"));
const Matches = lazy(() => import("@/pages/Matches"));
const Callups = lazy(() => import("@/pages/Callups"));
const Payments = lazy(() => import("@/pages/Payments"));
const Authorizations = lazy(() => import("@/pages/Authorizations"));
const Settings = lazy(() => import("@/pages/Settings"));
const Inscriptions = lazy(() => import("@/pages/Inscriptions"));
const Trainings = lazy(() => import("@/pages/Trainings"));
const Stats = lazy(() => import("@/pages/Stats"));
const Communications = lazy(() => import("@/pages/Communications"));
const Reports = lazy(() => import("@/pages/Reports"));
const Equipment = lazy(() => import("@/pages/Equipment"));

const AppLoader = ({ fullPage = false }) => {
  const { t } = useI18n();
  return (
    <div className={`${fullPage ? "min-h-screen min-h-[100dvh]" : "min-h-[50vh]"} flex items-center justify-center px-6`} role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-2xl bg-primary/15" />
          <div className="absolute inset-1 animate-spin rounded-xl border-2 border-primary border-t-transparent" />
        </div>
        <p className="text-sm font-semibold text-slate-500">{t("loading")}</p>
      </div>
    </div>
  );
};

// Rutas protegidas — verifica sesión activa
const ProtectedRoute = ({ children, user }) => {
  const location = useLocation();
  if (user === null) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user === undefined) return null; // cargando
  return children;
};

function App() {
  const [user, setUser] = useState(undefined); // undefined=cargando, null=no auth, string=autenticado

  useEffect(() => {
    api.get("/auth/me")
      .then((r) => setUser(r.data.username))
      .catch(() => setUser(null));
  }, []);

  const handleLogout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };

  return (
    <I18nProvider>
      <SplashScreen />
      <BrowserRouter>
        <Routes>
          {/* Ruta pública — Login */}
          <Route path="/login" element={
            user === undefined
              ? <AppLoader fullPage />
              : user
                ? <Navigate to="/" replace />
                : <Login onLogin={(u) => setUser(u)} />
          } />

          {/* Rutas protegidas */}
          <Route path="/*" element={
            user === undefined
              ? <AppLoader fullPage />
              : <ProtectedRoute user={user}>
              <Layout onLogout={handleLogout} user={user}>
                <Suspense fallback={<AppLoader />}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inscripciones" element={<Inscriptions />} />
                    <Route path="/jugadores" element={<Players />} />
                    <Route path="/familias" element={<Families />} />
                    <Route path="/equipos" element={<Teams />} />
                    <Route path="/entrenamientos" element={<Trainings />} />
                    <Route path="/partidos" element={<Matches />} />
                    <Route path="/convocatorias" element={<Callups />} />
                    <Route path="/estadisticas" element={<Stats />} />
                    <Route path="/pagos" element={<Payments />} />
                    <Route path="/autorizaciones" element={<Authorizations />} />
                    <Route path="/comunicacion" element={<Communications />} />
                    <Route path="/informes" element={<Reports />} />
                    <Route path="/configuracion" element={<Settings />} />
                    <Route path="/equipamiento" element={<Equipment />} />
                  </Routes>
                </Suspense>
              </Layout>
            </ProtectedRoute>
          }
        />
        </Routes>
        <RgpdBanner />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </I18nProvider>
  );
}

export default App;
