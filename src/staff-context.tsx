// src/staff-context.tsx
//
// The office/staff equivalent of src/site-context.tsx: "which CLIENT am I
// looking at?" instead of "which SITE" — a staff session has many clients,
// not one client's many sites, but the same "the answer has to survive
// navigation between tabs" problem, so it gets the same shape: a context
// wrapping the tab tree, not per-screen state.
//
// null means "All clients" — the default. Deliberately NOT persisted to
// SecureStore across restarts, unlike SiteContext's remembered site: picking
// a client to filter Jobs by is closer to an in-session search than a
// standing preference, and starting every app launch back at "All clients"
// is the safer default for someone whose job is to see across the whole book
// of business.

import React, { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';
import { useStaffClients } from './hooks';
import { StaffClient } from './api/types';

interface StaffScopeContextValue {
  clients: StaffClient[];
  /** null = All clients. */
  selectedClientId: number | null;
  selectedClient: StaffClient | null;
  setSelectedClientId: (id: number | null) => void;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const StaffScopeContext = createContext<StaffScopeContextValue | null>(null);

export function StaffScopeProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh } = useStaffClients();
  const [selectedClientId, setSelectedClientIdState] = useState<number | null>(null);

  const clients = useMemo(() => data?.clients ?? [], [data]);

  const setSelectedClientId = useCallback((id: number | null) => {
    setSelectedClientIdState(id);
  }, []);

  const selectedClient = useMemo(
    () => clients.find((c) => c.client_id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const value = useMemo(
    () => ({ clients, selectedClientId, selectedClient, setSelectedClientId, loading, error, refresh }),
    [clients, selectedClientId, selectedClient, setSelectedClientId, loading, error, refresh],
  );

  return <StaffScopeContext.Provider value={value}>{children}</StaffScopeContext.Provider>;
}

export function useStaffScope(): StaffScopeContextValue {
  const ctx = useContext(StaffScopeContext);
  if (!ctx) throw new Error('useStaffScope must be used inside a StaffScopeProvider');
  return ctx;
}
