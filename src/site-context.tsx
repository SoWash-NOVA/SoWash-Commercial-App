// src/site-context.tsx
//
// The structural difference between this app and the residential one.
//
// A residential customer has one address. A commercial client has many sites —
// Power Cement alone runs several — so almost every screen here needs to know
// "which site am I looking at?", and that answer has to survive navigation
// between tabs. Hence a context rather than per-screen state.
//
// null means "All sites", which is the default and a legitimate view, not an
// unset value. Screens must handle it rather than waiting for a selection.

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
import { useSites } from './hooks';
import { Site } from './api/types';

interface SiteContextValue {
  sites: Site[];
  /** null = All sites. */
  selectedSiteId: number | null;
  selectedSite: Site | null;
  setSelectedSiteId: (id: number | null) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** True when the client has one site, so the switcher can hide itself. */
  isSingleSite: boolean;
}

const SiteContext = createContext<SiteContextValue | null>(null);

/**
 * Remembering the choice is worth the storage: someone who manages one plant
 * out of nine should not re-pick it on every launch.
 *
 * SecureStore rather than AsyncStorage only because it is already a dependency
 * — this is a UI preference, not a secret.
 */
const SITE_KEY = 'portalSelectedSiteId';

export function SiteProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh } = useSites();
  const [selectedSiteId, setSelected] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  const sites = useMemo(() => data?.sites ?? [], [data]);

  // Restore the last choice once, before the first render that could act on it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(SITE_KEY);
        const id = raw ? parseInt(raw, 10) : NaN;
        if (!cancelled && Number.isFinite(id)) setSelected(id);
      } catch {
        // Fall back to All sites.
      } finally {
        if (!cancelled) setRestored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Drop a restored selection that no longer exists — a site can be removed, or
   * the account moved to a different client. Without this the app filters every
   * list by a dead id and shows a convincing "no jobs" instead of an error.
   */
  useEffect(() => {
    if (!restored || loading || sites.length === 0 || selectedSiteId === null) return;
    if (!sites.some((s) => s.id === selectedSiteId)) {
      setSelected(null);
      void SecureStore.deleteItemAsync(SITE_KEY).catch(() => {});
    }
  }, [restored, loading, sites, selectedSiteId]);

  const setSelectedSiteId = useCallback((id: number | null) => {
    setSelected(id);
    (async () => {
      try {
        if (id === null) await SecureStore.deleteItemAsync(SITE_KEY);
        else await SecureStore.setItemAsync(SITE_KEY, String(id));
      } catch {
        // Non-fatal — it only costs the preference on next launch.
      }
    })();
  }, []);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId],
  );

  const value = useMemo(
    () => ({
      sites,
      selectedSiteId,
      selectedSite,
      setSelectedSiteId,
      loading,
      error,
      refresh,
      isSingleSite: sites.length === 1,
    }),
    [sites, selectedSiteId, selectedSite, setSelectedSiteId, loading, error, refresh],
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSiteContext(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSiteContext must be used inside a SiteProvider');
  return ctx;
}

/** One-line location for a site card: "Korangi, Karachi". */
export function siteLocation(site: Site | null | undefined): string {
  if (!site) return '';
  return [site.address, site.city, site.state].filter(Boolean).join(', ');
}
