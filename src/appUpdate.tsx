// src/appUpdate.tsx
//
// Keeps installed apps up to date once the app is on Google Play.
//
//  1. GOOGLE IN-APP UPDATES (automatic, the main mechanism). Every time the app opens (and whenever it comes back to
//     the foreground) it asks Google Play "is there a newer version for THIS phone?" (expo-in-app-updates -> the
//     official Play Core API). If so it starts an IMMEDIATE update: Google's own full-screen update screen, the user
//     must update, it installs in place and the app restarts - no SQL, no manual announcement, and it is correct
//     for staged rollouts (only phones Play actually offers the update to are asked). If the user backs out of
//     Google's screen, our blocking "Update required" card takes over (no way past it except updating).
//     Only works for an app INSTALLED FROM PLAY (a dev build / side-loaded APK is told "no update" - nothing breaks).
//
//  2. SERVER MINIMUM VERSION (backup / emergency brake). GET /api/app-version/commercial (routes/appVersionRoutes.js,
//     table app_release_info): if the running version is older than min_supported_version the same blocking card
//     is shown. Raise it only to cut off a version that must not be used any more.
//
// Any failure (offline, API missing, Play not installed) = no popup. The module is loaded defensively: a build
// made before expo-in-app-updates was added must not crash at startup.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowRight, CircleCheck, Rocket } from 'lucide-react-native';
import { SERVER_BASE } from './api/client';
import { HEADER_GRADIENT } from './brand';
import { palette } from './theme';

const PACKAGE_ID = 'com.sowash.commercial';
const STORE_MARKET_URL = `market://details?id=${PACKAGE_ID}`;
const STORE_WEB_URL = `https://play.google.com/store/apps/details?id=${PACKAGE_ID}`;
const CHECK_EVERY_MS = 10 * 60 * 1000;

type InAppUpdates = typeof import('expo-in-app-updates');

/** Loaded lazily + defensively (see the header comment). */
function loadInAppUpdates(): InAppUpdates | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-in-app-updates') as InAppUpdates;
  } catch {
    return null;
  }
}

/** "1.2.10" -> [1,2,10]; anything unparsable counts as 0. */
function parts(v: string): number[] {
  return v
    .split('.')
    .map((x) => parseInt(x.replace(/[^0-9]/g, ''), 10))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

/** <0 if a is older than b, 0 if equal, >0 if newer. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

const runningVersion = (): string => Constants.expoConfig?.version ?? '0.0.0';

interface VersionInfo {
  latest_version: string | null;
  min_supported_version: string | null;
  message: string | null;
}

type Blocker = { latest: string | null; message: string | null };

export default function AppUpdateHost() {
  const [blocker, setBlocker] = useState<Blocker | null>(null);
  const [busy, setBusy] = useState(false);
  const lastCheckRef = useRef(0);
  const startingRef = useRef(false);

  /** Start Google's immediate update. Returns true when its screen was started. */
  const startGoogleUpdate = useCallback(async (): Promise<boolean> => {
    const mod = loadInAppUpdates();
    if (!mod || startingRef.current) return false;
    startingRef.current = true;
    try {
      return await mod.startUpdate(true);
    } catch {
      return false;
    } finally {
      startingRef.current = false;
    }
  }, []);

  const check = useCallback(
    async (force = false) => {
      if (Platform.OS !== 'android') return;
      if (!force && lastCheckRef.current !== 0 && Date.now() - lastCheckRef.current < CHECK_EVERY_MS) return;
      lastCheckRef.current = Date.now();

      // 1) Google Play says there is a newer version for this phone -> immediate update.
      const mod = !__DEV__ ? loadInAppUpdates() : null;
      if (mod) {
        try {
          const r = await mod.checkForUpdate();
          // updateInProgress: an immediate update that was interrupted (app closed mid-way) must be resumed.
          if (r.updateAvailable || r.updateInProgress) {
            const started = await startGoogleUpdate();
            if (!started) setBlocker({ latest: r.storeVersion ?? null, message: null });
            return; // Google's screen is showing (or our blocker); skip the server check this round
          }
        } catch {
          /* not installed from Play / Play unavailable: fall through to the server check */
        }
      }

      // 2) Emergency brake: the server says this version is no longer allowed.
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`${SERVER_BASE}/api/app-version/commercial`, { signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) return;
        const info = (await res.json()) as VersionInfo;
        if (info?.min_supported_version && compareVersions(runningVersion(), info.min_supported_version) < 0) {
          setBlocker({ latest: info.latest_version ?? info.min_supported_version, message: info.message });
        } else {
          setBlocker(null);
        }
      } catch {
        /* offline / server down: no popup, no error */
      }
    },
    [startGoogleUpdate],
  );

  useEffect(() => {
    check(true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    // The user closed Google's update screen without updating -> block the app until they do.
    const mod = !__DEV__ && Platform.OS === 'android' ? loadInAppUpdates() : null;
    let unsub: (() => void) | undefined;
    try {
      unsub = mod?.addUpdateListener('updateCancelled', () => setBlocker((b) => b ?? { latest: null, message: null }));
    } catch {
      /* ignore */
    }
    return () => {
      sub.remove();
      unsub?.();
    };
  }, [check]);

  const onUpdatePress = async () => {
    setBusy(true);
    try {
      // First try Google's in-place update again; if it cannot start, send the user to the Play Store listing.
      if (await startGoogleUpdate()) return;
      try {
        await Linking.openURL(STORE_MARKET_URL);
      } catch {
        await Linking.openURL(STORE_WEB_URL).catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  if (!blocker) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      // Android back does nothing: the only way on is to update.
      onRequestClose={() => {}}
    >
      <View style={st.backdrop}>
        {/* The icon floats over the top edge of the card (the same layout as the field-officer app's popup). */}
        <View style={st.cardWrap}>
          <View style={st.floatingIcon}>
            <LinearGradient
              colors={[...HEADER_GRADIENT.colors]}
              locations={[...HEADER_GRADIENT.locations]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={st.iconCircle}
            >
              <Rocket size={34} color="#fff" />
            </LinearGradient>
          </View>

          <View style={st.card}>
            <Text style={st.title}>Time to update!</Text>

            <View style={st.versionPill}>
              <Text style={st.versionPillText}>
                {blocker.latest ? `A new version is available · you have ${runningVersion()}` : `You have version ${runningVersion()}`}
              </Text>
            </View>

            <Text style={st.body}>
              {blocker.message ||
                "We've made improvements. Update the app now to keep using SoWash Commercial and get the best experience."}
            </Text>

            {blocker.message ? null : (
              <View style={st.features}>
                {['Faster performance', 'Bug fixes', 'New features'].map((f) => (
                  <View key={f} style={st.feature}>
                    <CircleCheck size={16} color="#10b981" />
                    <Text style={st.featureText}>{f}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity activeOpacity={0.9} onPress={onUpdatePress} disabled={busy} style={st.primaryWrap}>
              <LinearGradient
                colors={[...HEADER_GRADIENT.colors]}
                locations={[...HEADER_GRADIENT.locations]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={st.primary}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={st.primaryText}>UPDATE NOW</Text>
                    <ArrowRight size={19} color="#fff" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,20,32,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  cardWrap: { width: '100%', maxWidth: 380, paddingTop: 36 },
  floatingIcon: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', zIndex: 2 },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: palette.surface,
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  title: { fontSize: 23, fontWeight: '900', color: palette.ink, textAlign: 'center' },
  versionPill: { marginTop: 10, backgroundColor: '#E3F2FB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  versionPillText: { fontSize: 12, fontWeight: '800', color: '#0B6FA8' },
  body: { fontSize: 14.5, lineHeight: 21, color: palette.inkSoft, textAlign: 'center', marginTop: 14 },
  features: { alignSelf: 'stretch', marginTop: 14, gap: 8, backgroundColor: palette.bg, borderRadius: 16, padding: 14 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { fontSize: 13.5, fontWeight: '700', color: palette.inkSoft },
  primaryWrap: { alignSelf: 'stretch', marginTop: 20 },
  primary: { borderRadius: 16, paddingVertical: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 15.5, fontWeight: '900', letterSpacing: 0.4 },
});
