// src/components/ChatHeaderBar.tsx
//
// The coloured top bar every page and chat screen shares, in the LOGO's colours: a
// horizontal sky-blue → aqua → lime gradient (HEADER_GRADIENT in src/brand.ts), a soft
// white sheen top-right, a gentle darkening toward the bottom edge (so white text reads)
// and — on the rounded page/list headers — two frosted white waves along the bottom.
// White content on top.
//
// The gradient is HORIZONTAL on purpose: the strip behind the status bar (see
// src/top-inset-color.tsx) draws the same gradient, so the clock/signal area and the
// header read as one surface; the top-right orb is drawn in both. The darkening layer
// starts transparent at the top edge for the same reason.
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
import Svg, { Path } from 'react-native-svg';
import { HEADER_GRADIENT } from '../brand';
import { ORB_A, useTopInset } from '../top-inset-color';
import { isDark } from '../themeEngine';

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

  // The SoWash brand gradient (src/brand.ts) — deliberately NOT the user-selectable accent.
  const spec = HEADER_GRADIENT;

  // Measured so the strip knows how much of the surface it covers. A sensible
  // first guess keeps the first frame close; onLayout corrects it.
  const [headerH, setHeaderH] = useState(96);
  const registered = useRef(false);

  const publish = useCallback(
    (h: number) => setBar({ colors: spec.colors, locations: spec.locations, headerHeight: h }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setBar, spec],
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
            setStatusBarStyle(isDark() ? 'light' : 'dark', false);
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


  return (
    <View style={[styles.shadow, rounded ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius } : null]}>
      <LinearGradient
        colors={spec.colors as unknown as [string, string, ...string[]]}
        locations={spec.locations as unknown as [number, number, ...number[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        onLayout={onLayout}
        style={[
          styles.bar,
          rounded ? { borderBottomLeftRadius: radius, borderBottomRightRadius: radius } : null,
          style,
          // room for the wave under whatever padding the caller asked for
          rounded ? { paddingBottom: ((style?.paddingBottom as number | undefined) ?? 14) + WAVE_H - 6 } : null,
        ]}
      >
        {/* depth: a gentle darkening toward the bottom (transparent at the top edge, so the seam with the status strip stays invisible) */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(4,48,84,0)', 'rgba(4,48,84,0.16)']}
          start={{ x: 0, y: 0.25 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* two soft orbs, clipped by the bar. orbA continues into the status strip. */}
        <View
          pointerEvents="none"
          style={[
            styles.orb,
            { width: ORB_A.size, height: ORB_A.size, top: ORB_A.top, right: ORB_A.right, opacity: ORB_A.opacity, backgroundColor: ORB_A.color },
          ]}
        />
        <View pointerEvents="none" style={[styles.orb, styles.orbB]} />
        {rounded ? <BottomWave /> : null}
        {children}
      </LinearGradient>
    </View>
  );
}

/**
 * Two frosted white waves along the bottom edge (rounded headers only — the bar's rounded,
 * clipped corners shape them).
 */
function BottomWave() {
  return (
    <Svg pointerEvents="none" width="100%" height={WAVE_H} viewBox="0 0 400 40" preserveAspectRatio="none" style={styles.wave}>
      <Path d="M0 16 C60 2 120 30 200 15 C280 0 334 26 400 8 V40 H0 Z" fill="#FFFFFF" opacity={0.12} />
      <Path d="M0 27 C70 13 132 37 212 24 C292 11 342 33 400 19 V40 H0 Z" fill="#FFFFFF" opacity={0.2} />
    </Svg>
  );
}

/** Height of the bottom wave; the rounded headers get this much extra bottom padding so content clears it. */
const WAVE_H = 20;

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
  orbB: { width: 150, height: 150, bottom: -84, left: -44, opacity: 0.1, backgroundColor: '#FFFFFF' },
  wave: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
