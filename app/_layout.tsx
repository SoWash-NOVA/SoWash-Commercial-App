// app/_layout.tsx
//
// Root layout. Mirrors sowash-customer-app's, including initPush() — added in
// Phase 5, in the slot this comment used to reserve for it.

import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { TopInsetFill, TopInsetProvider } from '../src/top-inset-color';
import { initPush } from '../src/push';
import { palette, ACCENT_DEFAULT } from '../src/theme';
import { ThemeModeProvider, ThemeRemount, useThemeMode } from '../src/theme-mode';

/**
 * Routes a signed-out user may sit on. Everything else requires a session.
 * There is no onboarding here — unlike the residential app, these accounts are
 * created by SoWash and handed to someone who already knows what the app is.
 */
const PUBLIC_SEGMENTS = ['login'];

/**
 * Phase 2: office/staff sessions (appRole === 'staff', see
 * src/auth/AuthContext.tsx) live under app/staff/* — a real path segment, not
 * a route group, because a route group adds no URL segment and app/(tabs)/
 * already claims "/" for the client experience; two different route trees
 * cannot both resolve to "/" in expo-router.
 *
 * '/staff', not '/staff/index': confirmed against a freshly-rebuilt
 * .expo/types/router.d.ts (after a full `expo start -c` restart) that '/staff'
 * is the one real, navigable route for app/staff/index.tsx — matching
 * app/documentation/index.tsx's own '/documentation'. An earlier version of
 * this file used '/staff/index' to work around a typecheck error, based on a
 * STALE, incompletely-regenerated type snapshot that briefly listed
 * '/staff/index' and not '/staff' — that string doesn't correspond to a real
 * route and produced "Unmatched Route" at runtime. Don't reintroduce it.
 */
const STAFF_ROOT = '/staff';

function RootNavigator() {
  const { status, appRole } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { takeReturnTo } = useThemeMode();

  // A light/dark switch remounts this navigator (src/theme-mode.tsx), which lands on the
  // first screen again; go back to where the switch was made (the Account screen).
  useEffect(() => {
    if (status !== 'signedIn') return;
    const back = takeReturnTo();
    if (back) setTimeout(() => router.replace(back as never), 0);
    // once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    // Wait for the stored session to be restored before redirecting anywhere,
    // otherwise a returning user is bounced to login for a frame.
    if (status === 'loading') return;

    const onPublicRoute = PUBLIC_SEGMENTS.includes(segments[0] as string);
    const onStaffRoute = segments[0] === 'staff';

    if (status === 'signedOut') {
      if (!onPublicRoute) router.replace('/login');
      return;
    }

    // status === 'signedIn' from here down.
    if (onPublicRoute) {
      router.replace(appRole === 'staff' ? STAFF_ROOT : '/');
      return;
    }

    // A staff session landing anywhere outside app/staff/* (e.g. the very
    // first redirect after sign-in, which always lands on "/") belongs there
    // instead — the client tab tree assumes a client_id that a staff user
    // does not have.
    if (appRole === 'staff' && !onStaffRoute) {
      router.replace(STAFF_ROOT);
      return;
    }

    // Defence in depth: a client session should never be able to sit on
    // app/staff/* (nothing currently produces this, since only a staff-role
    // login ever sets appRole to 'staff', but a stale deep link should not be
    // trusted to route a client account into the staff tree).
    if (appRole === 'client' && onStaffRoute) {
      router.replace('/');
    }
  }, [status, appRole, segments, router]);

  // Push registration runs only once signed in: handing the token to the
  // backend needs the JWT, which the axios interceptor attaches only after
  // login. initPush() never throws and returns a no-op teardown when push is
  // unavailable (web preview, no dev build, permission denied), so nothing
  // here needs a try/catch.
  //
  // appRole gates WHICH registration endpoint gets the token — see
  // initPush()'s own header comment. It should never be null once
  // status === 'signedIn' (appRoleOf() always resolves a non-null user to a
  // role), but the guard keeps this effect from ever calling initPush with a
  // role it can't act on rather than trusting that invariant silently.
  useEffect(() => {
    if (status !== 'signedIn' || !appRole) return;

    let teardown: (() => void) | undefined;
    let cancelled = false;

    initPush(appRole).then((off) => {
      // Signing out while permission was still being requested would otherwise
      // leave the listeners attached with no way to reach them.
      if (cancelled) off();
      else teardown = off;
    });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [status, appRole]);

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

/** React Navigation's own theme (scene backgrounds, transitions) — follows the light/dark choice. */
function NavTheme({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeMode();
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, background: palette.bg, card: palette.surface, border: palette.border, text: palette.ink },
  };
  return <NavThemeProvider value={theme}>{children}</NavThemeProvider>;
}

/** The default status-bar icon colour: dark icons on the light theme, light on the dark one. */
function ThemedStatusBar() {
  const { mode } = useThemeMode();
  return <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />;
}

/**
 * The app-wide safe-area shell. Every route gets top/bottom insets as padding —
 * EXCEPT the login screen, which paints its own backdrop edge to edge (gradient,
 * spheres) and so must reach under the status bar and the nav bar itself;
 * otherwise a pale strip of this shell's background shows above and below it.
 * (Login adds the insets back as padding on its own content.)
 */
function Shell({ children }: { children: React.ReactNode }) {
  const segments = useSegments();
  const onLogin = (segments as string[])[0] === 'login';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={onLogin ? [] : ['top', 'bottom']}>
      {children}
    </SafeAreaView>
  );
}

export default function RootLayout() {
  // GestureHandlerRootView: the chat photo viewer's ZoomableImage uses RNGH's
  // handlers, which throw without one as an ancestor.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Light/dark: loads the stored choice before the first frame; ThemeRemount remounts
            everything below AuthProvider when it changes (src/theme-mode.tsx). */}
        <ThemeModeProvider>
          <ThemeProvider>
            <AuthProvider>
              <ThemeRemount>
                <NavTheme>
                  <TopInsetProvider>
                    <Shell>
                      <ThemedStatusBar />
                      <RootNavigator />
                      {/* After the navigator so it paints over the (empty) status-bar inset; a chat header colours it. */}
                      <TopInsetFill />
                    </Shell>
                  </TopInsetProvider>
                </NavTheme>
              </ThemeRemount>
            </AuthProvider>
          </ThemeProvider>
        </ThemeModeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
