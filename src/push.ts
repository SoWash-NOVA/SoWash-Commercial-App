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

import { AppState, NativeModules, Platform } from 'react-native';
import { router } from 'expo-router';
import { notificationTarget, pushArrived, registerPushToken, registerStaffPushToken } from './hooks';
import { AppRole } from './auth/AuthContext';

/**
 * What services/commercialNotifications.js puts in the FCM data block.
 *
 * Every value is a STRING — FCM rejects a data payload containing anything
 * else, and rejects the whole multicast rather than the offending key, so the
 * backend coerces on the way out and this parses on the way in.
 */
interface PushData {
  type?: string;
  /** Set on crew_started / visit_approved. */
  schedule_id?: string;
  /** Set on chat_reply. */
  thread_id?: string;
  /** Set on team_message (internal staff chat). */
  conversation_id?: string;
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

/**
 * Resolve where a tapped push should land, from its data block.
 *
 * Routing lives in notificationTarget() in src/hooks.ts, shared with the bell
 * screen, so a notification opened from the tray and the same notification
 * opened from the feed can never disagree about where they go.
 */
export function targetFromPushData(data: PushData | undefined): string | null {
  if (!data?.type) return null;

  const scheduleId = data.schedule_id ? Number(data.schedule_id) : null;
  const threadId = data.thread_id ? Number(data.thread_id) : null;
  const conversationId = data.conversation_id ? Number(data.conversation_id) : null;

  return notificationTarget({
    type: data.type,
    schedule_id: Number.isFinite(scheduleId) && scheduleId ? scheduleId : null,
    thread_id: Number.isFinite(threadId) && threadId ? threadId : null,
    conversation_id: Number.isFinite(conversationId) && conversationId ? conversationId : null,
  });
}

function navigateTo(data: PushData | undefined) {
  const target = targetFromPushData(data);
  // No target means the visit was deleted, or this is a type the build does
  // not know yet. Staying put beats throwing the customer somewhere odd.
  if (target) router.push(target as never);
}

/**
 * A one-shot registration attempt with no retry was the actual cause of a
 * real incident: a transient network failure right after launch left a
 * device's token stale for as long as the app stayed alive in the
 * background (days, if never force-closed) — nothing ever tried again
 * until the next cold start or sign-out/in. Retries a few times with
 * backoff before giving up; called again from the AppState 'active'
 * listener below as an ongoing safety net for exactly that "logged in for
 * days" case, rather than doing anything disruptive like forcing a
 * sign-out over what's usually a one-second network blip.
 */
const REGISTER_RETRY_DELAYS_MS = [5_000, 20_000, 60_000];

/**
 * Every exit from this function is a plain `return` — never a `throw` — so
 * its promise always RESOLVES, never rejects, no matter how many attempts
 * fail. That's deliberate: every call site below fires this without
 * `await`ing it (registration shouldn't block anything else `initPush` is
 * doing), and an un-awaited promise that rejects becomes an unhandled
 * rejection. Making rejection structurally impossible here is what makes
 * "fire and forget" actually safe to do, rather than something that could
 * eventually surface as a red-box/crash report for a background retry
 * nobody's even watching.
 */
async function registerWithRetry(
  register: (t: string) => Promise<void>,
  token: string,
  label: string,
  cancelled: { current: boolean },
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    if (cancelled.current) {
      console.log(`[push] ${label}: registration retry cancelled (session ended)`);
      return;
    }
    try {
      await register(token);
      console.log(`[push] ${label}: token registered with backend${attempt > 0 ? ` (after ${attempt} retr${attempt === 1 ? 'y' : 'ies'})` : ''}`);
      return;
    } catch (err: any) {
      const delay = REGISTER_RETRY_DELAYS_MS[attempt];
      if (delay === undefined) {
        console.error(
          `[push] ${label}: registering token FAILED, giving up after ${attempt} retries —`,
          err?.response?.status,
          err?.response?.data || err?.message || err,
        );
        return;
      }
      console.warn(
        `[push] ${label}: registering token failed, retrying in ${delay / 1000}s —`,
        err?.response?.status,
        err?.response?.data || err?.message || err,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/**
 * Register this device and wire up notification taps.
 *
 * Call once the user is signed in — registering the token needs the JWT, which
 * the axios interceptor only attaches after login. `role` decides WHICH
 * registration endpoint gets the token: a client session calling the staff
 * one (or vice versa) 403s, since each is gated to its own token kind — see
 * registerPushToken vs registerStaffPushToken in src/hooks.ts for exactly
 * why this split exists.
 *
 * Returns a teardown for the listeners. Safe to call on every launch, and safe
 * to fail: everything here is caught, because a site manager who declined
 * notifications must still get a working app.
 */
/**
 * Android notification channels. FCM "notification" messages are drawn by the
 * OS into whichever channel the message names (`android.notification.channel_id`
 * on the backend) — and that channel has to exist on the device first. Without
 * it every push lands in the one default channel, so a mention sounds exactly
 * like a plain message and a user who muted chatter mutes mentions too.
 *
 * @notifee/react-native is used ONLY to create the channel — it never displays
 * anything here (FCM + the OS still do that), so it can't conflict with the
 * RNFirebase background handling the way expo-notifications did (see
 * plugins/withFcmNotification.js). Lazy-required inside try/catch: an APK
 * built before this dependency was added has no native module, and that must
 * degrade to "mentions use the default channel", never crash startup.
 */
export const MENTIONS_CHANNEL_ID = 'mentions';

async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Check for the native module BEFORE requiring the JS: with no native side
  // (an APK built before notifee was added) notifee's own constructor calls
  // console.error, which pops a red error box in dev for what is a
  // perfectly expected "this build predates the channel" situation.
  if (!NativeModules.NotifeeApiModule) {
    console.log('[push] Notifee is not in this build — Mentions channel skipped (mentions use the default channel)');
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const notifee = require('@notifee/react-native');
    const api = notifee.default ?? notifee;
    const { AndroidImportance } = notifee;
    await api.createChannel({
      id: MENTIONS_CHANNEL_ID,
      name: 'Mentions',
      description: 'When a colleague @mentions you or the whole group',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
      vibrationPattern: [0, 300, 200, 300],
      lights: true,
    });
  } catch (err) {
    console.warn('[push] could not create the Mentions channel —', err instanceof Error ? err.message : err);
  }
}

export async function initPush(role: AppRole): Promise<Unsubscribe> {
  const noop: Unsubscribe = () => {};

  if (Platform.OS === 'web') return noop;

  try {
    // Before permission/token work: channels are independent of both, and
    // the channel must exist before the first mention push can use it.
    await ensureAndroidChannels();

    const allowed = await ensurePermission();
    if (!allowed) {
      // This used to fail with zero visible trace — worth knowing WHICH of
      // the two permission paths (denied outright vs. some other reason)
      // when chasing why a device's token in user_fcm_tokens never updates.
      console.warn('[push] initPush: permission not granted, push disabled for this session');
      return noop;
    }

    const {
      getMessaging,
      getToken,
      onTokenRefresh,
      onMessage,
      onNotificationOpenedApp,
      getInitialNotification,
    } = loadMessaging();

    const messaging = getMessaging();

    const register = (t: string) =>
      role === 'staff' ? registerStaffPushToken(t) : registerPushToken(t, Platform.OS);

    // Stops any retry loop still waiting on its next backoff once this
    // initPush session ends (sign-out, or the effect re-running) — without
    // this, a pending retry from an OLD session could fire minutes later
    // under a NEW one (different account, possibly different role), which
    // isn't a crash but is exactly the kind of stale-background-work bug
    // that's easy to ship by accident with fire-and-forget retries.
    const cancelled = { current: false };

    const token = await getToken(messaging);
    console.log(`[push] initPush: getToken() -> ${token ? `${token.slice(0, 12)}…` : 'null'} (role=${role})`);
    if (token) {
      // Not awaited on purpose — its own retries/backoff run in the
      // background rather than delaying the rest of initPush (the
      // notification-tap listeners below don't depend on this finishing).
      registerWithRetry(register, token, 'initPush', cancelled);
    }

    // A token can be reissued at any time — reinstall, restore, cache clear.
    // Missing this is the classic "push worked for a week then stopped".
    const offRefresh = onTokenRefresh(messaging, (next: string) => {
      console.log(`[push] onTokenRefresh: ${next.slice(0, 12)}… (role=${role})`);
      registerWithRetry(register, next, 'onTokenRefresh', cancelled);
    });

    // Safety net for a session that stays open for days without a cold
    // restart: initPush() only ever runs once per launch, so a device
    // whose one registration attempt (and its retries above) all happened
    // to fail would otherwise sit silently unregistered until the user
    // eventually force-closes and reopens the app, or signs out and back
    // in. Re-registering is cheap and idempotent (the backend upserts on
    // the token, see routes/userRoutes.js), so just doing it every time
    // the app comes back to the foreground is simpler and more robust than
    // trying to track "did the last attempt actually succeed."
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || cancelled.current) return;
      getToken(messaging)
        .then((t: string | null) => {
          if (!t || cancelled.current) return;
          registerWithRetry(register, t, 'app foregrounded', cancelled);
        })
        .catch(() => {});
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
      cancelled.current = true;
      offRefresh?.();
      offMessage?.();
      offOpened?.();
      appStateSub.remove();
    };
  } catch (err) {
    // No Firebase config, no dev build, or permission machinery unavailable —
    // still logged (not silent) so a genuine failure here is distinguishable
    // from those three expected/benign cases when chasing a token that never
    // updates in user_fcm_tokens. The app still keeps working on polling
    // alone regardless — this log is diagnostic only, nothing depends on it.
    console.error('[push] initPush FAILED —', err instanceof Error ? err.message : err);
    return noop;
  }
}
