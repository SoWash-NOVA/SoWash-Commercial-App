// src/theme-mode.tsx
//
// The user's Light / Dark choice (Account → Appearance), persisted on the device.
//
// <ThemeModeProvider> loads the stored choice BEFORE rendering anything (so the first
// frame is already in the right theme), applies it to the theme engine
// (src/themeEngine.ts — every StyleSheet) and to the live palette (src/theme.ts), and
// exposes `useThemeMode()`. Changing it re-applies both and bumps `epoch`;
// <ThemeRemount> keys its children on that, so the tree below it remounts and every
// component re-reads its styles. AuthProvider sits ABOVE the remount boundary (in
// app/_layout.tsx), so a theme switch never re-runs the session restore, and the
// in-memory data cache (src/dataCache.ts) makes the remounted screens paint instantly.
//
// The remount resets navigation to the start of the stack, so `setMode(mode, returnTo)`
// takes the path to come back to (the Account screen the switch lives on) — see
// RootNavigator in app/_layout.tsx.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { setStatusBarStyle } from 'expo-status-bar';
import { ThemeMode, setEngineMode } from './themeEngine';
import { applyPalette } from './theme';

const STORE_KEY = 'appThemeMode';

type Value = {
  mode: ThemeMode;
  /** Remount counter — changes on every switch. */
  epoch: number;
  setMode: (mode: ThemeMode, returnTo?: string) => void;
  /** Where to navigate after the remount a switch causes (consumed once). */
  takeReturnTo: () => string | null;
};

const Ctx = createContext<Value>({
  mode: 'light',
  epoch: 0,
  setMode: () => {},
  takeReturnTo: () => null,
});

function apply(mode: ThemeMode) {
  setEngineMode(mode);
  applyPalette(mode);
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode | null>(null);
  const [epoch, setEpoch] = useState(0);
  const returnTo = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let stored: ThemeMode = 'light';
      try {
        const v = await SecureStore.getItemAsync(STORE_KEY);
        if (v === 'dark' || v === 'light') stored = v;
      } catch {
        // unreadable store → light
      }
      if (!alive) return;
      apply(stored);
      setModeState(stored);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode, back?: string) => {
    setModeState((cur) => {
      if (cur === next) return cur;
      apply(next);
      returnTo.current = back ?? null;
      setStatusBarStyle(next === 'dark' ? 'light' : 'dark', false);
      SecureStore.setItemAsync(STORE_KEY, next).catch(() => {});
      setEpoch((e) => e + 1);
      return next;
    });
  }, []);

  const takeReturnTo = useCallback(() => {
    const r = returnTo.current;
    returnTo.current = null;
    return r;
  }, []);

  const value = useMemo(
    () => ({ mode: mode ?? 'light', epoch, setMode, takeReturnTo }),
    [mode, epoch, setMode, takeReturnTo],
  );

  // Nothing renders until the stored choice is known — a few ms, and it avoids a light
  // first frame flashing before switching to dark.
  if (mode === null) return null;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useThemeMode = () => useContext(Ctx);

/** Remounts its children whenever the theme changes. */
export function ThemeRemount({ children }: { children: React.ReactNode }) {
  const { epoch } = useThemeMode();
  return <React.Fragment key={epoch}>{children}</React.Fragment>;
}
