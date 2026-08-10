// src/api/client.ts
//
// HTTP transport for the commercial portal app.
//
// Same shape as sowash-customer-app/src/api/client.ts — SecureStore-backed
// token, request interceptor, 401 → sign out — with three differences:
//   • token key is `portalToken`, not `customerToken`. Both apps can be
//     installed on one handset; sharing a key would let one clobber the other.
//   • the auth exchange lives at customer-portal/auth/, not customer-app/auth/.
//   • photo paths need parsing before they need prefixing (see parsePhotos).
//
// Backend: routes/customerJobHistoryRoutes.js (data, mounted at
// /api/customer-portal) and routes/portalAuthRoutes.js (login).

import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

// NO trailing /api — photo paths get prefixed with this. Repeating /api is the
// classic bug in this codebase.
export const SERVER_BASE = 'https://app.sowashusa.com';

const TOKEN_KEY = 'portalToken';

// ─────────────────────────── token storage ───────────────────────────

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // SecureStore can throw on a corrupt keystore entry. Treat as signed out
    // rather than crashing the app on launch.
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Already gone — nothing to do.
  }
}

// ───────────────────────────── the client ─────────────────────────────

export const api = axios.create({
  baseURL: `${SERVER_BASE}/api/`,
  timeout: 15000,
});

// Requests that must NOT trigger the session-expired redirect: the login
// exchange runs while signed out by definition, so a 4xx there is a normal
// outcome the login screen renders itself.
const isAuthExchange = (config?: InternalAxiosRequestConfig) =>
  Boolean(config?.url && config.url.includes('customer-portal/auth/'));

api.interceptors.request.use(
  async (config) => {
    if (!isAuthExchange(config)) {
      const token = await getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401 && !isAuthExchange(error.config)) {
      // Our token is 30 days, so this is a real expiry or a revoked session.
      await clearToken();
      router.replace('/login');
    }
    return Promise.reject(error);
  },
);

// ───────────────────────────── photos ─────────────────────────────

/**
 * site_schedules.before_photos / after_photos are `text` columns holding a
 * JSON array, not Postgres arrays, and the portal endpoints return them raw.
 * Ported from the web portal's parsePhotos (CustomerDashboard.js), which is the
 * battle-tested version.
 */
export function parsePhotos(raw: unknown): string[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr.filter((p): p is string => typeof p === 'string' && !!p) : [];
  } catch {
    // Not JSON. A single bare path in the column is the plausible legacy shape.
    return typeof raw === 'string' && raw.trim() ? [raw.trim()] : [];
  }
}

/**
 * Turn one stored photo path into a loadable URL.
 *
 * The first three branches mirror the web portal exactly. The last one does
 * NOT: the web falls through to `${IMG_BASE}${path}`, which for a bare
 * filename yields "https://app.sowashusa.comfoo.jpg" — no slash, silently
 * broken. That exact bug hid every photo in the residential app for months,
 * because the SPA catch-all answers such URLs with index.html and a 200, so
 * <Image> fails without ever firing onError.
 *
 * Bare filenames are therefore resolved to /uploads/, which is where the
 * residential audit found all 4,372 of them actually live. If a commercial
 * photo ever 404s, this is the first place to look.
 */
export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const s = String(path).trim();
  if (!s) return null;

  if (/^https?:\/\//i.test(s) || /^data:/i.test(s)) return s;

  const idx = s.indexOf('/uploads/');
  if (idx >= 0) return `${SERVER_BASE}${s.substring(idx)}`;

  if (!s.includes('/')) return `${SERVER_BASE}/uploads/${s}`;

  return `${SERVER_BASE}${s.startsWith('/') ? '' : '/'}${s}`;
}

/** parsePhotos + photoUrl in one step, dropping anything unresolvable. */
export function photoUrls(raw: unknown): string[] {
  return parsePhotos(raw)
    .map(photoUrl)
    .filter((u): u is string => !!u);
}

// ───────────────────────────── errors ─────────────────────────────

/**
 * Pull a human-usable message out of an axios failure.
 * The portal API returns { error, message?, details? }; anything else (a proxy
 * error page, a dropped connection) falls back to a generic line.
 */
export function errorMessage(
  err: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  const axiosErr = err as AxiosError<{ error?: string; message?: string }>;
  const data = axiosErr?.response?.data;
  if (data?.message) return data.message;
  if (data?.error) return data.error;
  if (axiosErr?.code === 'ECONNABORTED') {
    return 'The connection timed out. Please check your internet and try again.';
  }
  if (axiosErr?.message === 'Network Error') return 'No internet connection.';
  return fallback;
}

export default api;
