// src/top-inset-color.tsx
//
// Lets a chat header extend its look up behind the phone's status bar.
//
// The root layout wraps every route in a SafeAreaView (pale background), so the
// status-bar area is always pale. A coloured chat header therefore started BELOW
// that pale strip. Pulling the header up with a negative margin didn't survive
// Android's clipping.
//
// So: the root layout renders <TopInsetFill/> — an absolute strip exactly the
// height of the top inset, painted after the navigator — and a focused header
// publishes its gradient here. Since 2026-10-05 the header gradient is HORIZONTAL
// (the logo's blue → lime, left to right), which is identical at every height, so
// the strip simply draws the same gradient and the two read as one surface. The
// header's top-right sheen orb is drawn in both so it isn't cut at the seam.
// Everything else leaves the strip plain pale.

import React, { createContext, useContext, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from './theme';

/** The header's horizontal gradient (left → right) and its measured height. */
export interface BarSpec {
  colors: readonly string[];
  locations: readonly number[];
  headerHeight: number;
}

/** The header's big top-right orb (a soft white sheen) — drawn in both the header and the strip so it isn't cut at the seam. */
export const ORB_A = { size: 210, top: -96, right: -60, opacity: 0.18, color: '#FFFFFF' };

interface TopInsetValue {
  bar: BarSpec | null;
  setBar: (bar: BarSpec | null) => void;
}

const TopInsetContext = createContext<TopInsetValue>({ bar: null, setBar: () => {} });

export function TopInsetProvider({ children }: { children: React.ReactNode }) {
  const [bar, setBar] = useState<BarSpec | null>(null);
  const value = useMemo(() => ({ bar, setBar }), [bar]);
  return <TopInsetContext.Provider value={value}>{children}</TopInsetContext.Provider>;
}

export const useTopInset = () => useContext(TopInsetContext);

/** The strip itself. Render it AFTER the navigator so it paints on top; it only covers the (empty) inset area. */
export function TopInsetFill() {
  const { bar } = useTopInset();
  const insets = useSafeAreaInsets();
  const segments = useSegments();

  // The login screen draws edge to edge under the status bar itself (see Shell in
  // app/_layout.tsx) — a strip here would paint a pale band over its design.
  if ((segments as string[])[0] === 'login') return null;

  if (!bar) {
    return <View pointerEvents="none" style={[styles.strip, { height: insets.top, backgroundColor: palette.bg }]} />;
  }

  return (
    <View pointerEvents="none" style={[styles.strip, { height: insets.top, overflow: 'hidden' }]}>
      <LinearGradient
        colors={bar.colors as [string, string, ...string[]]}
        locations={bar.locations as [number, number, ...number[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      {/* the header's top-right orb, shifted up by the strip's height so it continues through the seam */}
      <View
        style={{
          position: 'absolute',
          top: insets.top + ORB_A.top,
          right: ORB_A.right,
          width: ORB_A.size,
          height: ORB_A.size,
          borderRadius: 999,
          backgroundColor: ORB_A.color,
          opacity: ORB_A.opacity,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', top: 0, left: 0, right: 0 },
});
