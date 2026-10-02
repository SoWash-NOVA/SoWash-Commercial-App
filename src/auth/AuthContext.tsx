// src/auth/AuthContext.tsx
//
// Session state for the commercial portal app.
//
// Flow: email + password → POST /customer-portal/auth/login → a 30-day JWT
//       carrying kind:'portal' → expo-secure-store.
//
// Much simpler than the residential app's, which has to run a Firebase phone
// OTP first. There is no Firebase here at all, so nothing in this file needs a
// Platform guard and the whole app works in `expo start --web`.
//
// Phase 1 (sowash-backend routes/portalAuthRoutes.js) widened this: a `users`
// row with "Type" = 'customer' still gets the client-scoped session described
// above, but "Type" one of OFFICE_ROLES below now ALSO signs in through this
// same endpoint and gets an office/staff session instead (kind:'office_portal'
// on the backend — see middleware/officePortalAuth.js there). appRole below is
// how the rest of the app tells the two apart; app/_layout.tsx routes on it.
//
// A staff user has no client_id, so GET /customer-portal/customer/profile (the
// client-only endpoint this file uses to validate a restored session and fetch
// the header's client name) is meaningless for them and would 403. Every place
// below that calls it is therefore guarded on appRole — see the comments at
// each call site. Nothing about the CUSTOMER path changes: same calls, same
// order, same error handling as before Phase 1.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import api, { setToken, clearToken, getToken, errorMessage } from '../api/client';
import { LoginResponse, PortalUser, ProfileResponse } from '../api/types';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

/** 'client' = a commercial_clients site manager. 'staff' = an office user. */
export type AppRole = 'client' | 'staff';

/**
 * Must stay in step with OFFICE_ROLES in sowash-backend
 * config/staffRoles.js (STAFF_ROLES, which officePortalAuth.js's OFFICE_ROLES
 * imports) — this is the client-side mirror of that
 * login-time gate, used only to route within the app (the backend is what
 * actually enforces it). Compared case-insensitively, matching the backend's
 * own comparison, since users."Type" is free-text varchar.
 */
const OFFICE_ROLES = ['ci_admin', 'operations', 'admin', 'sales', 'accounts'];

export function appRoleOf(user: PortalUser | null): AppRole | null {
  if (!user) return null;
  const role = String(user.role || '').trim().toLowerCase();
  return OFFICE_ROLES.includes(role) ? 'staff' : 'client';
}

interface AuthContextValue {
  status: AuthStatus;
  user: PortalUser | null;
  appRole: AppRole | null;
  /** commercial_clients.client_name, resolved on restore/sign-in for the header. Client sessions only — always null for staff. */
  clientName: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Where the signed-in user's identity is cached between launches.
 *
 * It has to be stored: /customer/profile returns the commercial_clients row,
 * not the users row, so a restored session has no other way to recover the
 * person's name or email. Without this, `user` is null after every app restart
 * and the profile screen renders blank for a perfectly valid session.
 */
const USER_KEY = 'portalUser';

async function readStoredUser(): Promise<PortalUser | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    return raw ? (JSON.parse(raw) as PortalUser) : null;
  } catch {
    // Corrupt entry or a keystore failure — the token is the real session, so
    // carry on without the cached identity rather than forcing a sign-in.
    return null;
  }
}

async function writeStoredUser(user: PortalUser | null): Promise<void> {
  try {
    if (user) await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    else await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    // Non-fatal: it only costs us the cached name on next launch.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PortalUser | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);

  /**
   * Restore a stored session on launch.
   *
   * A token in SecureStore is not proof of a live session — it may have expired,
   * or the account may have been unlinked from its client. So we call
   * /customer/profile once: it is the cheapest authenticated endpoint, it
   * proves the token still works, and it gives us the client name for the
   * header in the same round trip.
   *
   * On a network failure we deliberately keep the session rather than bouncing
   * to login. A site manager opening the app in a basement with no signal
   * should not be signed out; the axios interceptor handles a real 401.
   *
   * STAFF SESSIONS SKIP ALL OF THIS. /customer/profile is client-scoped (it
   * 403s for a client_id-less staff user), so there is nothing useful for a
   * staff session to validate against here — the token is trusted as-is, same
   * as the offline fallback below already trusts it for a client session. A
   * real 401/403 on an actually-expired staff token still gets caught the
   * normal way, by the axios response interceptor in src/api/client.ts the
   * first time the staff screens make a real request.
   */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setStatus('signedOut');
        return;
      }

      // Paint from cache first so the profile screen is never blank while the
      // network call below is in flight.
      const cached = await readStoredUser();
      if (!cancelled && cached) setUser(cached);

      if (appRoleOf(cached) === 'staff') {
        if (!cancelled) setStatus('signedIn');
        return;
      }

      // Client session with a cached identity: open the app NOW and validate
      // the token in the background. Previously every cold start sat on a
      // full-screen spinner for a whole network round trip even when the
      // stored token was perfectly fine (the overwhelmingly common case).
      // Only a real 401/403 below still bounces to /login — exactly as
      // before, just a moment later — and an offline start no longer waits
      // out a request timeout before showing anything. With NO cached
      // identity (an install from before it was cached) we keep the old
      // wait-for-the-server behaviour, since there'd be nothing to paint.
      if (!cancelled && cached) setStatus('signedIn');

      try {
        const { data } = await api.get<ProfileResponse>('customer-portal/customer/profile');
        if (cancelled) return;
        setClientName(data?.customer?.client_name ?? null);
        setStatus('signedIn');
      } catch (err) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
          await clearToken();
          await writeStoredUser(null);
          setUser(null);
          setStatus('signedOut');
        } else {
          // Offline or a 5xx. Trust the stored token; screens show their own
          // error states and the interceptor will sign us out on a real 401.
          setStatus('signedIn');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await api.post<LoginResponse>('customer-portal/auth/login', {
        email: email.trim(),
        password,
      });

      if (!data?.token) throw new Error('No token returned');

      await setToken(data.token);
      await writeStoredUser(data.user ?? null);
      setUser(data.user ?? null);

      // Staff sign-in: no client, so no client profile to fetch — see the
      // restore-effect comment above for why /customer/profile is skipped.
      if (appRoleOf(data.user ?? null) === 'staff') {
        setClientName(null);
        setStatus('signedIn');
        return;
      }

      // Best effort — a failure here must not block a successful sign-in.
      try {
        const { data: profile } = await api.get<ProfileResponse>(
          'customer-portal/customer/profile',
        );
        setClientName(profile?.customer?.client_name ?? null);
      } catch {
        setClientName(null);
      }

      setStatus('signedIn');
    } catch (err) {
      // Surface the backend's own wording — it distinguishes bad credentials
      // (401) from "this is a staff account" and "not linked to a client" (403),
      // and those messages tell the user what to actually do.
      throw new Error(errorMessage(err, 'Could not sign in. Please try again.'));
    }
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    await writeStoredUser(null);
    setUser(null);
    setClientName(null);
    setStatus('signedOut');
  }, []);

  const appRole = useMemo(() => appRoleOf(user), [user]);

  const value = useMemo(
    () => ({ status, user, appRole, clientName, signIn, signOut }),
    [status, user, appRole, clientName, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider');
  return ctx;
}

/** "Fatima Khan" → "FK", for the profile avatar. */
export function initialsOf(first?: string | null, last?: string | null): string {
  const source = [first, last].filter(Boolean).join(' ').trim();
  if (!source) return '?';
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
