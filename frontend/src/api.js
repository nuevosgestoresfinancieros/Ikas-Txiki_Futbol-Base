import axios from "axios";

const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  timeout: 20_000,
  withCredentials: true, // envía y recibe cookies HttpOnly
});

// Si el servidor devuelve 401 → redirigir al login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const publicPath = ["/login", "/recuperar-contrasena", "/nueva-contrasena", "/activar", "/privacidad", "/condiciones-de-uso"]
      .includes(window.location.pathname);
    if (err.response?.status === 401 && !publicPath) {
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
