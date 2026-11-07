// src/screenshot.tsx
//
// "Screenshot" button for a visit report (client visit screen + staff visit sheet): captures the
// whole report view as one PNG (including the part scrolled off screen) and opens the share sheet,
// so it can be saved to the gallery or sent to WhatsApp / chat. Needs react-native-view-shot
// (native module -> a build made after it was added).

import React, { useCallback, useRef, useState } from 'react';
import { Alert, ActivityIndicator, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Camera } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { keep } from './themeEngine';

export function useScreenshot() {
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const take = useCallback(async () => {
    if (busy || !ref.current) return;
    setBusy(true);
    try {
      // Loaded only now: in a build made before the library was added the native module is missing, and importing it
      // at the top of the file would log a warning on every app start.
      const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot');
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) throw new Error('This phone cannot share files from the app.');
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share screenshot' });
    } catch (e: any) {
      const msg = String(e?.message || '');
      Alert.alert(
        'Could not take the screenshot',
        /RNViewShot|native|linked/i.test(msg) ? 'Screenshots need the latest version of the app. Please install the new build.' : msg || 'Try again.',
      );
    } finally {
      setBusy(false);
    }
  }, [busy]);
  return { ref, busy, take };
}

/** Round camera button for a header's right edge. */
export function ScreenshotButton({ onPress, busy, color }: { onPress: () => void; busy: boolean; color?: string }) {
  const c = color ?? keep('#fff');
  return (
    <TouchableOpacity onPress={onPress} disabled={busy} hitSlop={8} style={st.btn} accessibilityLabel="Take a screenshot of this visit">
      {busy ? <ActivityIndicator size="small" color={c} /> : <Camera size={19} color={c} />}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  btn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
