import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.STAGING_BASE_URL;
const user = __ENV.STAGING_USER;
const password = __ENV.STAGING_PASSWORD;
if (!base || !user || !password) throw new Error('Define STAGING_BASE_URL, STAGING_USER y STAGING_PASSWORD');

export const options = {
  scenarios: {
    navigation: { executor: 'ramping-vus', exec: 'navigate', startVUs: 0, stages: [
      { duration: '2m', target: 25 }, { duration: '3m', target: 100 }, { duration: '5m', target: 250 },
      { duration: '10m', target: 350 }, { duration: '2m', target: 0 }] },
    login: { executor: 'ramping-vus', exec: 'loginOnly', startVUs: 0, stages: [
      { duration: '2m', target: 5 }, { duration: '3m', target: 15 }, { duration: '5m', target: 35 },
      { duration: '10m', target: 75 }, { duration: '2m', target: 0 }] },
    operations: { executor: 'ramping-vus', exec: 'operation', startVUs: 0, stages: [
      { duration: '2m', target: 2 }, { duration: '3m', target: 10 }, { duration: '5m', target: 25 },
      { duration: '10m', target: 75 }, { duration: '2m', target: 0 }] },
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<500', 'p(99)<2000'] },
};

function login() {
  const r = http.post(`${base}/api/auth/login`, JSON.stringify({ username: user, password }), { headers: { 'Content-Type': 'application/json' } });
  check(r, { 'login 200': (x) => x.status === 200 });
  return r.status === 200;
}

export function navigate() {
  if (!login()) return;
  const r = http.batch([['GET', `${base}/api/dashboard`], ['GET', `${base}/api/players`], ['GET', `${base}/api/calendar/events`]]);
  check(r[0], { 'dashboard 200': (x) => x.status === 200 });
  sleep(1 + Math.random() * 3);
}

export function loginOnly() { login(); sleep(2 + Math.random() * 4); }

export function operation() {
  if (!login()) return;
  const id = `${__VU}-${__ITER}-${Date.now()}`;
  const r = http.post(`${base}/api/players`, JSON.stringify({ nombre: 'Carga', apellidos: id, estado: 'activo' }), { headers: { 'Content-Type': 'application/json' } });
  check(r, { 'player creation 200': (x) => x.status === 200 });
  sleep(2 + Math.random() * 3);
