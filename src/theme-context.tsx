import React, { createContext, useContext, useMemo, useState } from 'react';
import { ACCENT_DEFAULT } from './theme';

type AccentContextValue = {
  accent: string;
  setAccent: (color: string) => void;
};

const AccentContext = createContext<AccentContextValue>({
  accent: ACCENT_DEFAULT,
  setAccent: () => {},
});

/**
 * Holds the app-wide accent colour. Replaces the `themeColor` useState that
 * lived in the old single-file App.tsx and was prop-drilled into every screen.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccent] = useState(ACCENT_DEFAULT);
  const value = useMemo(() => ({ accent, setAccent }), [accent]);
  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export function useAccent() {
  return useContext(AccentContext);
}
