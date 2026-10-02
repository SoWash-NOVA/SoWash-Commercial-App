// src/top-inset-color.tsx
//
// Lets a chat header extend its look up behind the phone's status bar.
//
// The root layout wraps every route in a SafeAreaView (pale background), so the
// status-bar area is always pale. A coloured chat header therefore started BELOW
// that pale strip. Pulling the header up with a negative margin didn't survive
// Android's clipping, and a flat colour strip looked like a different surface
// from the gradient header under it.
//
// So: the root layout renders <TopInsetFill/> — an absolute strip exactly the
// height of the top inset, painted after the navigator — and a focused chat
// header publishes its gradient (and its own height) here. The strip then draws
// the slice of that SAME vertical gradient that would sit above the header, plus
// the slice of the header's top-right orb that overlaps it, so the two read as one
// continuous surface. Everything else leaves it plain pale.

import React, { createContext, useContext, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from './theme';
import { mix } from './utils/color';
import { BRAND_GREEN } from './brand';

/** The header's gradient (top → mid → end, vertical) and measured height. */
export interface BarSpec {
  top: string;
  mid: string;
  end: string;
  headerHeight: number;
}

/** Where the middle colour sits along the gradient. */
export const MID_STOP = 0.55;

/** The header's big top-right orb (a soft lime glow) — drawn in both the header and the strip so it isn't cut at the seam. */
export const ORB_A = { size: 190, top: -80, right: -50, opacity: 0.42, color: BRAND_GREEN };

/** Colour of the full (status strip + header) gradient at t∈[0,1] down the surface. */
export function barColorAt(spec: Pick<BarSpec, 'top' | 'mid' | 'end'>, t: number): string {
  if (t <= MID_STOP) return mix(spec.top, spec.mid, t / MID_STOP);
  return mix(spec.mid, spec.end, (t - MID_STOP) / (1 - MID_STOP));
}

/**
 * The header's own gradient stops once the strip has taken the first `f` of the
 * surface: sampled at f, the mid stop (if it's still ahead), and 1 — with
 * locations re-based to the header's 0..1.
 */
export function headerStops(spec: Pick<BarSpec, 'top' | 'mid' | 'end'>, f: number) {
  const colors = [barColorAt(spec, f)];
  const locations = [0];
  if (f < MID_STOP) {
    colors.push(spec.mid);
    locations.push((MID_STOP - f) / (1 - f));
  }
  colors.push(spec.end);
  locations.push(1);
  return { colors, locations };
}

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

  const total = insets.top + bar.headerHeight;
  const f = total > 0 ? insets.top / total : 0;

  return (
    <View pointerEvents="none" style={[styles.strip, { height: insets.top, overflow: 'hidden' }]}>
      <LinearGradient
        colors={[barColorAt(bar, 0), barColorAt(bar, f)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
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
