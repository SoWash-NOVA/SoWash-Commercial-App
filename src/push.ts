// src/push.ts
//
// FCM registration and notification taps for the commercial portal app.
//
// The backend half already exists and is live: services/commercialPush.js
// sends, services/commercialNotifications.js decides when, and
// POST /customer-portal/push/register stores the token. This is the side that
// asks for permission and hands a token up. Without it every push the server
// sends goes nowhere.
//
// ⚠ @react-native-firebase/* has NO web build. Every reference below is a lazy
//   require behind a Platform check, the same shape src/auth/AuthContext.tsx
//   uses, so `expo start --web` still loads instead of dying at import time.
//   That preview is the only way to see this app without a device.
//
// ⚠ Native module: this needs the EAS dev build. It cannot work in Expo Go,
//   and it cannot work at all until `eas init` has been run for this project.
//   Until then initPush() fails quietly and the app is unaffected — the feed
//   and its badge work regardless, because they are polled over plain HTTP.
//
// ⚠ NO background message handler is registered, on purpose. The server sends
//   a `notification` block (see services/commercialPush.js), so Android and
//   iOS draw the tray notification themselves with no JS involved. A
//   setBackgroundMessageHandler is only needed for data-only pushes, and
//   adding one would require moving `main` off expo-router/entry to a custom
//   entry file — which is exactly the change that complicated the FO app.

import { Platform } from 'react-native';
import { router } from 'expo-router';
import { notificationTarget, pushArrived, registerPushToken } from './hooks';

/** What services/commercialNotifications.js puts in the FCM data block. */
interface PushData {
  type?: string;
  schedule_id?: string;
}

type Unsubscribe = () => void;

function loadMessaging() {
  if (Platform.OS === 'web') {
    throw new Error('Push is not available in the browser preview.');
  }
  // Required lazily so the web bundle never resolves the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-firebase/messaging') as typeof import('@react-native-firebase/messaging');
}

/**
 * Ask for notification permission.
 *
 * Two different systems, which is easy to get wrong:
 *   • iOS — Firebase's own requestPermission() drives the OS prompt.
 *   • Android 13+ (API 33) — needs the runtime POST_NOTIFICATIONS grant.
 *     Firebase's requestPermission() reports AUTHORIZED there WITHOUT ever
 *     prompting, so trusting it alone yields a token that never delivers and
 *     no visible sign of the problem.
 */
async function ensurePermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      if (typeof Platform.Version === 'number' && Platform.Version >= 33) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PermissionsAndroid } = require('react-native');
        const granted = await PermissionsAndroid.request(
          'android.permission.POST_NOTIFICATIONS',
        );
        return granted === 'granted';
      }
      return true;
    }

    const { getMessaging, requestPermission, AuthorizationStatus } = loadMessaging();
    const status = await requestPermission(getMessaging());
    return (
      status === AuthorizationStatus.AUTHORIZED ||
      status === AuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

/** Resolve where a tapped push should land, from its data block. */
export function targetFromPushData(data: PushData | undefined): string | null {
  if (!data?.type) return null;

  const scheduleId = data.schedule_id ? Number(data.schedule_id) : null;

  return notificationTarget({
    schedule_id: Number.isFinite(scheduleId) && scheduleId ? scheduleId : null,
  });
}

function navigateTo(data: PushData | undefined) {
  const target = targetFromPushData(data);
  // No target means the visit was deleted, or this is a type the build does
  // not know yet. Staying put beats throwing the customer somewhere odd.
  if (target) router.push(target as never);
}

/**
 * Register this device and wire up notification taps.
 *
 * Call once the user is signed in — registering the token needs the JWT, which
 * the axios interceptor only attaches after login.
 *
 * Returns a teardown for the listeners. Safe to call on every launch, and safe
 * to fail: everything here is caught, because a site manager who declined
 * notifications must still get a working app.
 */
export async function initPush(): Promise<Unsubscribe> {
  const noop: Unsubscribe = () => {};

  if (Platform.OS === 'web') return noop;

  try {
    const allowed = await ensurePermission();
    if (!allowed) return noop;

    const {
      getMessaging,
      getToken,
      onTokenRefresh,
      onMessage,
      onNotificationOpenedApp,
      getInitialNotification,
    } = loadMessaging();

    const messaging = getMessaging();

    const token = await getToken(messaging);
    if (token) {
      await registerPushToken(token, Platform.OS).catch(() => {});
    }

    // A token can be reissued at any time — reinstall, restore, cache clear.
    // Missing this is the classic "push worked for a week then stopped".
    const offRefresh = onTokenRefresh(messaging, (next: string) => {
      registerPushToken(next, Platform.OS).catch(() => {});
    });

    // Foreground: FCM draws no tray notification, so the only visible sign is
    // the badge and feed updating. pushArrived() drives both.
    const offMessage = onMessage(messaging, async () => {
      pushArrived();
    });

    // Opened from the tray while the app was backgrounded.
    const offOpened = onNotificationOpenedApp(messaging, (message: { data?: PushData }) => {
      pushArrived();
      navigateTo(message?.data);
    });

    // Opened from the tray while the app was fully closed. Resolves once, and
    // only for the notification that launched the app.
    getInitialNotification(messaging)
      .then((message: { data?: PushData } | null) => {
        if (message?.data) {
          pushArrived();
          navigateTo(message.data);
        }
      })
      .catch(() => {});

    return () => {
      offRefresh?.();
      offMessage?.();
      offOpened?.();
    };
  } catch {
    // No Firebase config, no dev build, or permission machinery unavailable.
    // The app keeps working on polling alone.
    return noop;
  }
}
