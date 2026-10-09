// src/components/ChatSkeleton.tsx
//
// What a chat shows while its FIRST messages are still loading (no cached copy yet): the real screen —
// header, wallpaper, composer — is already there, and the message area holds a few softly pulsing
// placeholder bubbles instead of a full-screen spinner. Opening a chat you have opened before never
// shows this at all (the last copy is kept in memory — see useChat).

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { palette } from '../theme';

// [alignRight, width %, height] — a believable little conversation
const ROWS: Array<[boolean, number, number]> = [
  [false, 62, 54],
  [true, 48, 40],
  [false, 74, 78],
  [true, 58, 44],
  [false, 40, 38],
  [true, 66, 60],
];

export default function ChatSkeleton({ accent }: { accent: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={st.wrap} pointerEvents="none">
      {ROWS.map(([right, w, h], i) => (
        <Animated.View
          key={i}
          style={[
            st.bubble,
            { width: `${w}%`, height: h, opacity: pulse },
            right ? { alignSelf: 'flex-end', backgroundColor: accent + '33' } : { alignSelf: 'flex-start', backgroundColor: palette.border },
          ]}
        />
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 14, paddingTop: 18, gap: 12, justifyContent: 'flex-end', paddingBottom: 16 },
  bubble: { borderRadius: 20 },
});
