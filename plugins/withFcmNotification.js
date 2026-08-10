// plugins/withFcmNotification.js
//
// Gives FCM tray notifications a real icon and brand colour on Android.
//
// WHY THIS EXISTS INSTEAD OF expo-notifications
// ---------------------------------------------
// The usual way to set a notification icon in Expo is the expo-notifications
// config plugin. We cannot use it: expo-notifications registers its own
// FirebaseMessagingService, and so does @react-native-firebase/messaging (which
// src/push.ts is built on). Android delivers to only ONE such service, so
// installing expo-notifications silently breaks the RNFirebase background
// handler. This plugin does the two things we actually wanted from it — the
// icon and the colour — and touches nothing else.
//
// WHAT ANDROID DOES WITH THE ICON
// -------------------------------
// Android 5+ ignores the RGB channels of a notification icon completely. It
// uses the ALPHA channel as a stencil and fills it with the accent colour
// below. That is why assets/notification-icon.png is the monochrome chevron
// (alpha silhouette) and not the full-colour app icon: hand it a colour icon
// and every opaque pixel becomes solid white — the "white square" bug.
//
// NOT HANDLED HERE: the channel name. services/customerPush.js sends a
// `notification` block with no channel, so Android files these under its
// fallback channel, displayed as "Miscellaneous" in system settings. Renaming
// that requires *creating* a channel, which has no JS API outside notifee or
// expo-notifications — both of which cost more than the cosmetic win.

const {
  AndroidConfig,
  withAndroidManifest,
  withAndroidColors,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ICON_RESOURCE = 'notification_icon';
const COLOR_RESOURCE = 'notification_icon_color';

const META_ICON = 'com.google.firebase.messaging.default_notification_icon';
const META_COLOR = 'com.google.firebase.messaging.default_notification_color';

/** Android notification icons are 24dp; these are the px sizes per density. */
const DENSITIES = [
  ['mdpi', 24],
  ['hdpi', 36],
  ['xhdpi', 48],
  ['xxhdpi', 72],
  ['xxxhdpi', 96],
];

/** Point FCM at our drawable + colour. */
const withMetaData = (config) =>
  withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      META_ICON,
      `@drawable/${ICON_RESOURCE}`,
      'resource',
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      META_COLOR,
      `@color/${COLOR_RESOURCE}`,
      'resource',
    );
    return cfg;
  });

/** The tint Android fills the stencil with. */
const withColor = (config, { color }) =>
  withAndroidColors(config, (cfg) => {
    cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, {
      name: COLOR_RESOURCE,
      value: color,
    });
    return cfg;
  });

/**
 * Write the drawable into every density bucket.
 *
 * generateImageAsync needs sharp (present on EAS Build) or jimp. jimp is NOT
 * reliably resolvable in this repo — it is an optional peer of
 * @expo/image-utils and the installed version has a mismatched API — so a local
 * `expo prebuild` would otherwise crash here. The fallback drops the source PNG
 * into the density-independent `drawable/` folder and lets Android scale it:
 * slightly softer at small sizes, but never a broken build.
 */
const withIconAsset = (config, { icon }) =>
  withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const srcPath = path.resolve(projectRoot, icon);

      if (!fs.existsSync(srcPath)) {
        throw new Error(`withFcmNotification: icon not found at ${srcPath}`);
      }

      // Takes the PROJECT root, not the platform root — it appends `android/`
      // itself. Passing platformProjectRoot here looks for android/android.
      const resPath = await AndroidConfig.Paths.getResourceFolderAsync(projectRoot);

      let generateImageAsync;
      try {
        ({ generateImageAsync } = require('@expo/image-utils'));
      } catch {
        generateImageAsync = null;
      }

      let wroteScaled = false;

      if (generateImageAsync) {
        try {
          for (const [density, size] of DENSITIES) {
            const outDir = path.join(resPath, `drawable-${density}`);
            fs.mkdirSync(outDir, { recursive: true });

            const { source } = await generateImageAsync(
              { projectRoot, cacheType: 'sowash-notification-icon' },
              {
                src: srcPath,
                width: size,
                height: size,
                resizeMode: 'contain',
                backgroundColor: 'transparent',
              },
            );
            fs.writeFileSync(path.join(outDir, `${ICON_RESOURCE}.png`), source);
          }
          wroteScaled = true;
        } catch (err) {
          console.warn(
            `withFcmNotification: could not resize the icon (${err.message}). ` +
              'Falling back to an unscaled drawable.',
          );
        }
      }

      if (!wroteScaled) {
        const outDir = path.join(resPath, 'drawable');
        fs.mkdirSync(outDir, { recursive: true });
        fs.copyFileSync(srcPath, path.join(outDir, `${ICON_RESOURCE}.png`));
      }

      return cfg;
    },
  ]);

/**
 * @param {object} config
 * @param {{ icon?: string, color?: string }} props
 *   icon  — path to a white-on-transparent PNG (alpha is all that matters)
 *   color — hex tint Android fills the stencil with
 */
module.exports = function withFcmNotification(config, props = {}) {
  const icon = props.icon ?? './assets/notification-icon.png';
  const color = props.color ?? '#2E6BFF';

  config = withMetaData(config);
  config = withColor(config, { color });
  config = withIconAsset(config, { icon });
  return config;
};
