// src/components/FadeInRow.tsx
//
// A list row that eases in (fade + a short rise) the first time it mounts, with a
// small per-index delay so a list "cascades" in instead of popping. Native-driven,
// runs once per mount (so pull-to-refresh and polling never re-trigger it), and
// the delay is capped so a long list doesn't make the bottom rows wait.

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export default function FadeInRow({ index, children }: { index: number; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 320,
      delay: Math.min(index, 8) * 45,
      useNativeDriver: true,
    }).start();
  }, [v, index]);

  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}
