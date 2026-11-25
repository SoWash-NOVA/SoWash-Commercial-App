// src/components/ZoomableImage.tsx
//
// Pinch-to-zoom + pan-when-zoomed + double-tap toggle — WhatsApp's photo-viewer gestures.
// Shared by the staff chats' MediaViewerView (app/staff/chats.tsx) and the client Support chat's
// PhotoViewerModal. Hand-rolled on the classic RNGH ref API + plain Animated (no Reanimated worklets
// in this project — see CLAUDE.md §6).

import React, { useState } from 'react';
import { ActivityIndicator, Animated, View } from 'react-native';

import { Image } from 'expo-image';
import { thumbUrl } from '../api/client';
import { PanGestureHandler, PinchGestureHandler, State, TapGestureHandler } from 'react-native-gesture-handler';

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

/**
 * Pinch-to-zoom + pan-when-zoomed + double-tap toggle, WhatsApp's own photo
 * viewer gestures. Deliberately hand-rolled on the classic RNGH ref API +
 * plain `Animated.Value`s (no `Animated.event` offset-extraction, no
 * Reanimated) rather than the newer Gesture/GestureDetector API — see the
 * import comment above for why. `onZoomChange` tells the parent FlatList
 * page whether a pan is currently meaningful: the Pan handler is fully
 * `enabled` only once zoomed in, so at the default 1x a left/right drag
 * falls straight through to the outer FlatList's own page-swipe instead of
 * being (uselessly) claimed here.
 */
export default function ZoomableImage({
  uri,
  width,
  height,
  onZoomChange,
}: {
  uri: string;
  width: number;
  height: number;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;
  const translateX = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(0)).current;
  const baseScale = React.useRef(1);
  const baseTranslate = React.useRef({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The camera original is several MB and was the whole wait. Open on the small copy the tile already
  // cached (instant), swap to a screen-sized server copy (~100-300 KB), and fetch the original only when
  // the reader actually zooms in.
  const preview = thumbUrl(uri, 130);
  const screenSized = thumbUrl(uri, width);
  const source = isZoomed ? uri : screenSized;

  const pinchRef = React.useRef(null);
  const panRef = React.useRef(null);
  const doubleTapRef = React.useRef(null);

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

  const setZoomed = (zoomed: boolean) => {
    setIsZoomed(zoomed);
    onZoomChange?.(zoomed);
  };

  const resetToIdentity = (animated: boolean) => {
    baseScale.current = ZOOM_MIN;
    baseTranslate.current = { x: 0, y: 0 };
    setZoomed(false);
    const duration = animated ? 180 : 0;
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
    ]).start();
  };

  const onPinchGestureEvent = (event: any) => {
    scale.setValue(clamp(baseScale.current * event.nativeEvent.scale, ZOOM_MIN, ZOOM_MAX));
  };

  const onPinchStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const next = clamp(baseScale.current * event.nativeEvent.scale, ZOOM_MIN, ZOOM_MAX);
      if (next <= ZOOM_MIN) {
        resetToIdentity(true);
      } else {
        baseScale.current = next;
        setZoomed(true);
      }
    }
  };

  const onPanGestureEvent = (event: any) => {
    if (baseScale.current <= ZOOM_MIN) return;
    translateX.setValue(baseTranslate.current.x + event.nativeEvent.translationX);
    translateY.setValue(baseTranslate.current.y + event.nativeEvent.translationY);
  };

  const onPanStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE && baseScale.current > ZOOM_MIN) {
      baseTranslate.current = {
        x: baseTranslate.current.x + event.nativeEvent.translationX,
        y: baseTranslate.current.y + event.nativeEvent.translationY,
      };
    }
  };

  const onDoubleTap = () => {
    if (baseScale.current > ZOOM_MIN) {
      resetToIdentity(true);
      return;
    }
    baseScale.current = 2;
    setZoomed(true);
    Animated.parallel([
      Animated.timing(scale, { toValue: 2, duration: 200, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  return (
    <TapGestureHandler ref={doubleTapRef} numberOfTaps={2} onActivated={onDoubleTap}>
      <Animated.View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
        <PinchGestureHandler
          ref={pinchRef}
          simultaneousHandlers={panRef}
          onGestureEvent={onPinchGestureEvent}
          onHandlerStateChange={onPinchStateChange}
        >
          <Animated.View style={{ width, height }}>
            <PanGestureHandler
              ref={panRef}
              simultaneousHandlers={pinchRef}
              onGestureEvent={onPanGestureEvent}
              onHandlerStateChange={onPanStateChange}
              enabled={isZoomed}
              minPointers={1}
              maxPointers={2}
            >
              <Animated.View
                style={[
                  { width, height, alignItems: 'center', justifyContent: 'center' },
                  { transform: [{ translateX }, { translateY }, { scale }] },
                ]}
              >
                <Image
                  source={{ uri: source }}
                  placeholder={{ uri: preview }}
                  placeholderContentFit="contain"
                  style={{ width, height }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  priority="high"
                  transition={120}
                  onLoad={() => setLoaded(true)}
                />
                {!loaded ? (
                  <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator color="#fff" />
                  </View>
                ) : null}
              </Animated.View>
            </PanGestureHandler>
          </Animated.View>
        </PinchGestureHandler>
      </Animated.View>
    </TapGestureHandler>
  );
}

