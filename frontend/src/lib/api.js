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

// fetch wrapper: attaches the Bearer token, parses JSON, and throws an
// Error carrying the API's own error message on non-2xx responses.
export async function apiFetch(path, { method = 'GET', body } = {}) {
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
