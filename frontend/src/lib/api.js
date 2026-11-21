// Shared session + API helper for the authenticated pages (account, cart,
// seller center, admin). Public pages (Home/Search/Product) fetch directly;
// these pages need the JWT, so they all go through apiFetch here.
// Single API base for every request in the app, so all URLs are built
// from one place. Overridable at build time with VITE_API_URL — set it
// when the frontend is hosted separately from the API, e.g.
// VITE_API_URL=https://vorqon-api.onrender.com/api
// Default '/api' keeps the current behaviour: same-origin requests,
// proxied to the API by Vite in development (see vite.config.js).
export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

// Callers pass paths in their current '/api/...' form; apiUrl re-bases
// them onto API_BASE. With the default base this returns the path
// unchanged.
export function apiUrl(path) {
  return API_BASE + String(path).replace(/^\/api(?=\/|$)/, '');
}

const ACCESS_KEY = 'vorqon-access';
const REFRESH_KEY = 'vorqon-refresh';
const USER_KEY = 'vorqon-user';
export const SESSION_EVENT = 'vorqon-session';

export function getAccessToken() {
  return localStorage.getItem(ACCESS_KEY);
}

// The signed-in/guest branch for cart + checkout decisions: what
// matters is a usable access token, not the stored user profile
// (which outlives the token and made the old branch lie).
export function hasAuthToken() {
  return !!getAccessToken();
}

export function getSessionUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSession({ user, access, refresh }) {
  if (access) localStorage.setItem(ACCESS_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSession() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

// Access tokens live 15 minutes; the stored refresh token (7 days)
// exchanges for a fresh pair at POST /api/auth/refresh. Returns true
// when a new session was saved. Raw fetch, so a failing refresh can
// never recurse into apiFetch.
async function tryRefresh() {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return false;
  try {
    const res = await fetch(apiUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    if (!data.access) return false;
    saveSession(data);
    return true;
  } catch {
    return false;
  }
}

// fetch wrapper: attaches the Bearer token, parses JSON, and throws an
// Error carrying the API's own error message on non-2xx responses.
// On a 401 (expired access token) it first tries one refresh + retry;
// the session is cleared only when the refresh also fails.
export async function apiFetch(path, { method = 'GET', body } = {}, _retried = false) {
  const token = getAccessToken();
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && !_retried && !path.startsWith('/api/auth/')
      && (await tryRefresh())) {
      return apiFetch(path, { method, body }, true);
    }
    if (res.status === 401 && token) clearSession();
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// Bilingual name picker. API rows arrive in three shapes: raw SQL
// (name_ar / name_en), Prisma objects (nameAr / nameEn), or localized
// rows that already carry a computed `name`.
export function pickName(row, lang) {
  if (!row) return '';
  if (row.name) return row.name;
  return lang === 'en'
    ? row.nameEn || row.name_en || row.nameAr || row.name_ar || ''
    : row.nameAr || row.name_ar || row.nameEn || row.name_en || '';
}
