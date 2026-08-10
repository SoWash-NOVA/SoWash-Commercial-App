// app/_layout.tsx
//
// Root layout. Mirrors sowash-customer-app's, minus the pieces that do not
// exist yet:
//   • AuthProvider + the signed-in/signed-out redirect  → Phase 1
//   • initPush()                                        → Phase 5 (needs Firebase)
// The shape is kept identical so those slot straight in.

import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme-context';
import { palette } from '../src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top', 'bottom']}>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.bg },
            }}
          />
        </SafeAreaView>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
