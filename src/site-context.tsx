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
  /** True for an EPC / parent account: its sites belong to several customers, so screens name the customer. */
  isMultiClient: boolean;
  /** EPC accounts: the customers (one per commercial_clients row among the sites), A-Z. Empty otherwise. */
  customers: { id: number; name: string; siteCount: number }[];
  /** EPC accounts: null = all customers. Narrows the site list, visits and counts to that customer. */
  selectedClientId: number | null;
  setSelectedClientId: (id: number | null) => void;
  /** `sites`, narrowed to the selected customer (the same list when none is selected). */
  visibleSites: Site[];
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
const CLIENT_KEY = 'portalSelectedClientId';

export function SiteProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh } = useSites();
  const [selectedSiteId, setSelected] = useState<number | null>(null);
  const [selectedClientId, setSelectedClient] = useState<number | null>(null);
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
        const rawClient = await SecureStore.getItemAsync(CLIENT_KEY);
        const cid = rawClient ? parseInt(rawClient, 10) : NaN;
        if (!cancelled && Number.isFinite(cid)) setSelectedClient(cid);
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

  // Customers of an EPC account, derived from the sites list.
  const customers = useMemo(() => {
    const map = new Map<number, { id: number; name: string; siteCount: number }>();
    for (const x of sites) {
      if (x.site_client_id == null) continue;
      const cur = map.get(x.site_client_id);
      if (cur) cur.siteCount += 1;
      else map.set(x.site_client_id, { id: x.site_client_id, name: x.client_name || `Customer #${x.site_client_id}`, siteCount: 1 });
    }
    const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    return list.length > 1 ? list : [];
  }, [sites]);

  // A restored customer that is no longer in the list would filter everything to nothing.
  useEffect(() => {
    if (!restored || loading || sites.length === 0 || selectedClientId === null) return;
    if (!customers.some((cu) => cu.id === selectedClientId)) {
      setSelectedClient(null);
      void SecureStore.deleteItemAsync(CLIENT_KEY).catch(() => {});
    }
  }, [restored, loading, sites.length, customers, selectedClientId]);

  const setSelectedClientId = useCallback(
    (id: number | null) => {
      setSelectedClient(id);
      // A site of a different customer must not stay selected under the new customer.
      setSelected((cur) => {
        if (cur === null || id === null) return cur;
        const keep = sites.find((x) => x.id === cur)?.site_client_id === id;
        if (!keep) void SecureStore.deleteItemAsync(SITE_KEY).catch(() => {});
        return keep ? cur : null;
      });
      (async () => {
        try {
          if (id === null) await SecureStore.deleteItemAsync(CLIENT_KEY);
          else await SecureStore.setItemAsync(CLIENT_KEY, String(id));
        } catch {
          // Non-fatal.
        }
      })();
    },
    [sites],
  );

  const visibleSites = useMemo(
    () => (selectedClientId === null ? sites : sites.filter((x) => x.site_client_id === selectedClientId)),
    [sites, selectedClientId],
  );

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
      isMultiClient: customers.length > 1,
      customers,
      selectedClientId,
      setSelectedClientId,
      visibleSites,
    }),
    [sites, selectedSiteId, selectedSite, setSelectedSiteId, loading, error, refresh, customers, selectedClientId, setSelectedClientId, visibleSites],
  );

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSiteContext(): SiteContextValue {
  const ctx = useContext(SiteContext);
  if (!ctx) throw new Error('useSiteContext must be used inside a SiteProvider');
  return ctx;
}

/** Safe outside a SiteProvider (returns false) - for shared components like JobCard. */
export function useIsMultiClient(): boolean {
  return useContext(SiteContext)?.isMultiClient ?? false;
}

/** One-line location for a site card: "Korangi, Karachi". */
export function siteLocation(site: Site | null | undefined): string {
  if (!site) return '';
  return [site.address, site.city, site.state].filter(Boolean).join(', ');
}
