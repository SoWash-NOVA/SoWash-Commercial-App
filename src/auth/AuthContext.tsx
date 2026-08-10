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
// The backend refuses to issue a token to anything that is not a `users` row
// with "Type" = 'customer' and a client_id, so a staff member entering valid
// credentials gets a 403 with a readable message rather than a broken session.
// See routes/portalAuthRoutes.js and middleware/portalAuth.js.

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

interface AuthContextValue {
  status: AuthStatus;
  user: PortalUser | null;
  /** commercial_clients.client_name, resolved on restore/sign-in for the header. */
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

  const value = useMemo(
    () => ({ status, user, clientName, signIn, signOut }),
    [status, user, clientName, signIn, signOut],
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
