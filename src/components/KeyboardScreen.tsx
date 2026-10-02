// src/components/KeyboardScreen.tsx
//
// A full-screen container that keeps its bottom (the chat composer) above the
// keyboard. Replaces <KeyboardAvoidingView>, which on Android edge-to-edge builds
// under-compensates (it reads the keyboard height against a frame that isn't in
// window coordinates), leaving the input and send button half-hidden behind the keys.
//
// This measures the container in the WINDOW, compares its bottom edge with the top of
// the keyboard (from the keyboard event) and pads the difference — exact whatever the
// status bar, nav bar or tab bar are doing.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, StyleProp, View, ViewStyle } from 'react-native';

export default function KeyboardScreen({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const ref = useRef<View>(null);
  const [overlap, setOverlap] = useState(0);

  const onShow = useCallback((e: { endCoordinates: { height: number; screenY: number } }) => {
    const kbTop = e.endCoordinates.screenY;
    const kbHeight = e.endCoordinates.height;
    ref.current?.measureInWindow((_x, y, _w, h) => {
      const bottom = y + h;
      // how far the keyboard reaches up into this container (never more than the keyboard itself)
      const raw = bottom - kbTop;
      setOverlap(Math.max(0, Math.min(raw, kbHeight)));
    });
  }, []);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, onShow as never);
    const b = Keyboard.addListener(hideEvt, () => setOverlap(0));
    // keyboard height can change while open (emoji / suggestion bar / one-handed mode)
    const c = Keyboard.addListener('keyboardDidChangeFrame' as never, ((e: { endCoordinates: { height: number; screenY: number } }) => {
      if (e.endCoordinates.height > 0) onShow(e);
    }) as never);
    return () => {
      a.remove();
      b.remove();
      c.remove();
    };
  }, [onShow]);

  return (
    <View ref={ref} style={[style, { paddingBottom: overlap }]}>
      {children}
    </View>
  );
}
