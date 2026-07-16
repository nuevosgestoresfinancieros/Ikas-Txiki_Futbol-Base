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
import { AuthProvider, can } from "@/auth";

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
const Users = lazy(() => import("@/pages/Users"));

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

const AuthorizedRoute = ({ user, resource, children }) =>
  can(user, resource) ? children : <Navigate to="/" replace />;

function App() {
  const [user, setUser] = useState(undefined); // undefined=cargando, null=no auth, objeto=autenticado

  useEffect(() => {
    api.get("/auth/me")
      .then((r) => setUser(r.data))
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
              <AuthProvider user={user}><Layout onLogout={handleLogout} user={user}>
                <Suspense fallback={<AppLoader />}>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/inscripciones" element={<AuthorizedRoute user={user} resource="inscriptions"><Inscriptions /></AuthorizedRoute>} />
                    <Route path="/jugadores" element={<AuthorizedRoute user={user} resource="players"><Players /></AuthorizedRoute>} />
                    <Route path="/familias" element={<AuthorizedRoute user={user} resource="families"><Families /></AuthorizedRoute>} />
                    <Route path="/equipos" element={<AuthorizedRoute user={user} resource="teams"><Teams /></AuthorizedRoute>} />
                    <Route path="/entrenamientos" element={<AuthorizedRoute user={user} resource="trainings"><Trainings /></AuthorizedRoute>} />
                    <Route path="/partidos" element={<AuthorizedRoute user={user} resource="matches"><Matches /></AuthorizedRoute>} />
                    <Route path="/convocatorias" element={<AuthorizedRoute user={user} resource="callups"><Callups /></AuthorizedRoute>} />
                    <Route path="/estadisticas" element={<AuthorizedRoute user={user} resource="stats"><Stats /></AuthorizedRoute>} />
                    <Route path="/pagos" element={<AuthorizedRoute user={user} resource="payments"><Payments /></AuthorizedRoute>} />
                    <Route path="/autorizaciones" element={<AuthorizedRoute user={user} resource="authorizations"><Authorizations /></AuthorizedRoute>} />
                    <Route path="/comunicacion" element={<AuthorizedRoute user={user} resource="communications"><Communications /></AuthorizedRoute>} />
                    <Route path="/informes" element={<AuthorizedRoute user={user} resource="reports"><Reports /></AuthorizedRoute>} />
                    <Route path="/configuracion" element={<AuthorizedRoute user={user} resource="settings"><Settings /></AuthorizedRoute>} />
                    <Route path="/equipamiento" element={<AuthorizedRoute user={user} resource="equipment"><Equipment /></AuthorizedRoute>} />
                    <Route path="/usuarios" element={<AuthorizedRoute user={user} resource="users"><Users /></AuthorizedRoute>} />
                  </Routes>
                </Suspense>
              </Layout></AuthProvider>
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
