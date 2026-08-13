// app/_layout.tsx
//
// Root layout. Mirrors sowash-customer-app's, including initPush() — added in
// Phase 5, in the slot this comment used to reserve for it.

import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { initPush } from '../src/push';
import { palette, ACCENT_DEFAULT } from '../src/theme';

/**
 * Routes a signed-out user may sit on. Everything else requires a session.
 * There is no onboarding here — unlike the residential app, these accounts are
 * created by SoWash and handed to someone who already knows what the app is.
 */
const PUBLIC_SEGMENTS = ['login'];

function RootNavigator() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Wait for the stored session to be restored before redirecting anywhere,
    // otherwise a returning user is bounced to login for a frame.
    if (status === 'loading') return;

    const onPublicRoute = PUBLIC_SEGMENTS.includes(segments[0] as string);

    if (status === 'signedOut' && !onPublicRoute) {
      router.replace('/login');
    } else if (status === 'signedIn' && onPublicRoute) {
      router.replace('/');
    }
  }, [status, segments, router]);

  // Push registration runs only once signed in: handing the token to the
  // backend needs the JWT, which the axios interceptor attaches only after
  // login. initPush() never throws and returns a no-op teardown when push is
  // unavailable (web preview, no dev build, permission denied), so nothing
  // here needs a try/catch.
  useEffect(() => {
    if (status !== 'signedIn') return;

    let teardown: (() => void) | undefined;
    let cancelled = false;

    initPush().then((off) => {
      // Signing out while permission was still being requested would otherwise
      // leave the listeners attached with no way to reach them.
      if (cancelled) off();
      else teardown = off;
    });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [status]);

  if (status === 'loading') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.bg,
        }}
      >
        <ActivityIndicator size="large" color={ACCENT_DEFAULT} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}
    />
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top', 'bottom']}>
            <StatusBar style="dark" />
            <RootNavigator />
          </SafeAreaView>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
