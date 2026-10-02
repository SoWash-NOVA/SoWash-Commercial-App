// src/components/ChatHeaderBar.tsx
//
// The coloured top bar every chat screen shares: a deep-to-bright gradient of the
// user's accent colour, with two soft translucent "orbs" for depth and white
// content on top.
//
// The gradient is VERTICAL on purpose: the strip behind the status bar (see
// src/top-inset-color.tsx) draws the slice of the same gradient that sits above
// this header, so the clock/signal area and the header read as one surface. For
// that to be seamless the header's own gradient starts where the strip's ends
// (`headerStops`) and the top-right orb is drawn in both.
//
// While it's on screen (focused) it publishes itself to that strip and switches
// the status-bar icons to light. Tab screens stay mounted when you leave them, so
// both are tied to focus.
//
// Switching Support <-> Team (or list <-> thread) UNMOUNTS one header and mounts
// another. If each header reset the strip/icons on unmount and set them again on
// mount, the status area flashed pale/dark for a frame in between. So headers
// register in a module-level counter, and the "put it back to normal" step is
// deferred a beat and only happens if no other header has registered by then.

import React, { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BRAND_BLUE, HEADER_STOPS } from '../brand';
import { headerStops, ORB_A, useTopInset } from '../top-inset-color';

/** How many chat headers are currently focused. Only when it drops to 0 (and stays there) do we restore the normal status area. */
let activeHeaders = 0;

export default function ChatHeaderBar({
  children,
  rounded = false,
  radius = 28,
  style,
}: {
  children: React.ReactNode;
  /** Rounded bottom corners — used on the list headers; thread headers stay flat. */
  rounded?: boolean;
  /** Corner radius when `rounded` (the login hero uses a bigger one). */
  radius?: number;
  /** Layout overrides for the inner content area (padding, direction, gap). */
  style?: ViewStyle;
}) {
  const { setBar } = useTopInset();
  const insets = useSafeAreaInsets();

  // The SoWash brand gradient (src/brand.ts) — deliberately NOT the user-selectable accent.
  const spec = HEADER_STOPS;

  // Measured so the strip knows how much of the surface it covers. A sensible
  // first guess keeps the first frame close; onLayout corrects it.
  const [headerH, setHeaderH] = useState(96);
  const registered = useRef(false);

  const publish = useCallback(
    (h: number) => setBar({ ...spec, headerHeight: h }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setBar, spec.top, spec.mid, spec.end],
  );

  useFocusEffect(
    useCallback(() => {
      activeHeaders += 1;
      registered.current = true;
      publish(headerH);
      setStatusBarStyle('light', false);
      return () => {
        registered.current = false;
        activeHeaders -= 1;
        // Deferred: if another header mounts in the next beat (a section or
        // list/thread switch) it re-registers and this reset is skipped — no flash.
        setTimeout(() => {
          if (activeHeaders === 0) {
            setBar(null);
            setStatusBarStyle('dark', false);
          }
        }, 80);
      };
      // headerH is read once on focus; later changes go through onLayout below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [publish, setBar]),
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && h !== headerH) {
      setHeaderH(h);
      if (registered.current) publish(h);
    }
  };

  const total = insets.top + headerH;
  const { colors, locations } = headerStops(spec, total > 0 ? insets.top / total : 0);

  return (
    <View style={[styles.shadow, rounded ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius } : null]}>
      <LinearGradient
        colors={colors as [string, string, ...string[]]}
        locations={locations as [number, number, ...number[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        onLayout={onLayout}
        style={[styles.bar, rounded ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius } : null, style]}
      >
        {/* depth: two soft orbs, clipped by the bar. orbA continues into the status strip. */}
        <View
          pointerEvents="none"
          style={[
            styles.orb,
            { width: ORB_A.size, height: ORB_A.size, top: ORB_A.top, right: ORB_A.right, opacity: ORB_A.opacity, backgroundColor: ORB_A.color },
          ]}
        />
        <View pointerEvents="none" style={[styles.orb, styles.orbB]} />
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outer view carries the shadow; the gradient inside clips its own orbs (a
  // view can't both clip children and cast an iOS shadow).
  shadow: {
    zIndex: 5,
    shadowColor: '#0f172a',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 10,
    overflow: 'hidden',
  },
  rounded: { borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: '#ffffff' },
  orbB: { width: 120, height: 120, bottom: -60, left: -30, opacity: 0.38, backgroundColor: BRAND_BLUE },
});
