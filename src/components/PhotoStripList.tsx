// src/components/PhotoStripList.tsx
//
// The horizontal photo rows inside the visit-detail popups (staff job sheet, the
// client's visit report and the chat "visit" popup) — rebuilt for slow connections
// and budget phones.
//
// What was wrong before: every photo in a row was mounted at once (a plain
// horizontal ScrollView over `.map`), each a full-resolution camera original (the
// backend has no thumbnailing). Opening the popup therefore started a dozen-plus
// multi-MB downloads in parallel — on a poor connection they all crawled together,
// none finished quickly — and the images decoding as they landed made scrolling
// stutter. A failed photo also just stayed blank.
//
// What this does instead:
//  • VIRTUALISED: a horizontal FlatList that mounts only the photos on / next to the
//    screen (initialNumToRender 2, windowSize 3). The rest don't download until you
//    scroll toward them — so there is no cap or "+N" any more, every photo is reachable.
//  • PRIORITISED: the first two photos load at high priority, the rest low, so the ones
//    you can see win the bandwidth.
//  • FIXED-SIZE tiles with a spinner (never a layout jump), cached to memory + disk
//    (expo-image), recycled by URL.
//  • RETRYABLE: if a photo fails (offline, timeout), the tile says so and a tap reloads it.
//  • Loading never blocks scrolling: tiles are plain native views and network/decoding
//    happen off the JS thread; the popup itself opens first (see useAfterOpen) and the
//    photo rows mount a beat later, so the slide-in animation isn't competing with them.

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { ImageOff, RotateCw } from 'lucide-react-native';

const TILE_BG = '#e9eff5';

/**
 * True shortly after the component mounts — after the first frame, after any running
 * interactions, plus `extraMs` for a native modal's slide-in. Lets a popup show its
 * text content instantly and defer the heavy photo rows (use a skeleton meanwhile).
 */
export function useAfterOpen(extraMs = 220): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handle = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => setReady(true), extraMs);
    });
    return () => {
      handle.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [extraMs]);
  return ready;
}

/** One photo tile: spinner while loading, a retry affordance on failure. */
export function PhotoThumb({
  url,
  width,
  height,
  radius = 12,
  priority = 'normal',
}: {
  url: string;
  width: number;
  height: number;
  radius?: number;
  priority?: 'low' | 'normal' | 'high';
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  // Bumping this remounts the <Image>, which re-requests the file.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState('loading');
    setAttempt((n) => n + 1);
  }, []);

  return (
    <View style={{ width, height, borderRadius: radius, overflow: 'hidden', backgroundColor: TILE_BG }}>
      <Image
        key={attempt}
        source={{ uri: url }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        cachePolicy="memory-disk"
        priority={priority}
        recyclingKey={url}
        transition={140}
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
      />
      {state === 'loading' ? (
        <View style={local.center} pointerEvents="none">
          <ActivityIndicator size="small" color="#94a3b8" />
        </View>
      ) : null}
      {state === 'error' ? (
        <TouchableOpacity style={local.center} onPress={retry} activeOpacity={0.8} accessibilityLabel="Photo failed to load. Tap to retry">
          <ImageOff size={18} color="#94a3b8" />
          <View style={local.retryRow}>
            <RotateCw size={11} color="#64748b" />
            <Text style={local.retryText}>Tap to retry</Text>
          </View>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** A horizontally scrolling, virtualised row of photos. */
export function PhotoStripList({
  urls,
  width,
  height,
  gap = 8,
  radius = 12,
}: {
  urls: string[];
  width: number;
  height: number;
  gap?: number;
  radius?: number;
}) {
  const step = width + gap;
  return (
    <FlatList
      horizontal
      data={urls}
      keyExtractor={(u, i) => `${i}-${u}`}
      style={{ height, flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      // Only what's near the screen is mounted; the rest doesn't start downloading until you scroll to it.
      initialNumToRender={2}
      maxToRenderPerBatch={2}
      updateCellsBatchingPeriod={60}
      windowSize={3}
      removeClippedSubviews
      // Inside the popup's vertical ScrollView (Android needs this to hand gestures over cleanly).
      nestedScrollEnabled
      getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
      renderItem={({ item, index }) => (
        <View style={{ width: step }}>
          <PhotoThumb url={item} width={width} height={height} radius={radius} priority={index < 2 ? 'high' : 'low'} />
        </View>
      )}
    />
  );
}

/** Stand-in for a photo row while the popup is still sliding in. */
export function PhotoStripSkeleton({ width, height, radius = 12 }: { width: number; height: number; radius?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, height }}>
      <View style={{ width, height, borderRadius: radius, backgroundColor: TILE_BG }} />
      <View style={{ width: width * 0.6, height, borderRadius: radius, backgroundColor: TILE_BG, opacity: 0.6 }} />
    </View>
  );
}

const local = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  retryText: { fontSize: 11, fontWeight: '800', color: '#64748b' },
});
