// src/camera-capture.tsx
//
// WhatsApp-style in-chat camera: TAP the shutter for a photo, HOLD it to record a video
// (max 30 s, released = done). One <CameraCaptureHost/> is mounted in app/_layout.tsx;
// any composer opens it with openCameraCapture(onPicked) (src/photoPicker.ts does, from
// its "Camera" choice), so the three chat composers share one camera.
//
// Video is recorded at 480p to keep files small (a 30 s clip is a few MB) — the server
// deletes chat videos 30 days after upload anyway.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, StatusBar, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Camera as CameraIcon, Image as ImageIcon, RefreshCw, X } from 'lucide-react-native';
import { ChatPhotoInput } from './hooks';
import { formatClock, MAX_VIDEO_SECONDS } from './chat-media';

/** Largest 4:3 size of at most ~2 MP from the camera's list ("1600x1200"); any size ≤ 2 MP otherwise. */
function pickPictureSize(sizes: string[] | undefined): string | undefined {
  const MAX_PIXELS = 2_100_000;
  let best: { size: string; area: number; fourThree: boolean } | null = null;
  for (const size of sizes ?? []) {
    const m = /^(\d+)x(\d+)$/.exec(size);
    if (!m) continue;
    const w = Number(m[1]);
    const h = Number(m[2]);
    const area = w * h;
    if (!w || !h || area > MAX_PIXELS) continue;
    const fourThree = Math.abs(Math.max(w, h) / Math.min(w, h) - 4 / 3) < 0.03;
    if (!best || (fourThree && !best.fourThree) || (fourThree === best.fourThree && area > best.area)) {
      best = { size, area, fourThree };
    }
  }
  return best?.size;
}

type Listener = (open: boolean) => void;
let pendingCallback: ((file: ChatPhotoInput) => void) | null = null;
let listener: Listener | null = null;

let pendingAutoRecord = false;
let pendingLibrary: ((file: ChatPhotoInput) => void) | null = null;

/**
 * Open the camera; `onPicked` receives the photo or video the user captured.
 * `autoRecord` starts recording video as soon as the camera is ready (the composer's camera
 * button was HELD) — hands-free: tap the stop button to finish.
 * `onLibrary` adds WhatsApp's gallery button to the camera screen; a photo chosen there is passed
 * to it (the composers attach it so a caption can be added) and the camera closes.
 */
export function openCameraCapture(
  onPicked: (file: ChatPhotoInput) => void,
  opts?: { autoRecord?: boolean; onLibrary?: (file: ChatPhotoInput) => void },
): void {
  pendingCallback = onPicked;
  pendingAutoRecord = !!opts?.autoRecord;
  pendingLibrary = opts?.onLibrary ?? null;
  listener?.(true);
}

/**
 * The camera button inside every chat composer's pill (WhatsApp): TAP opens the camera (tap
 * the shutter for a photo, hold it for video); HOLD starts recording a video straight away.
 * The result lands in the composer as an attachment, ready to send.
 */
export function CameraPillButton({
  onPicked,
  onLibrary,
  style,
  color,
}: {
  onPicked: (file: ChatPhotoInput) => void;
  /** Photo chosen from the gallery button inside the camera screen. */
  onLibrary?: (file: ChatPhotoInput) => void;
  style?: StyleProp<ViewStyle>;
  color: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => openCameraCapture(onPicked, { onLibrary })}
      onLongPress={() => openCameraCapture(onPicked, { autoRecord: true })}
      delayLongPress={350}
      style={style}
      hitSlop={4}
      accessibilityLabel="Camera: tap for photo, hold to record video"
    >
      <CameraIcon size={20} color={color} />
    </TouchableOpacity>
  );
}

export function CameraCaptureHost() {
  const [open, setOpen] = useState(false);
  const [autoRecord, setAutoRecord] = useState(false);
  const [hasLibrary, setHasLibrary] = useState(false);
  useEffect(() => {
    listener = (o) => {
      setAutoRecord(pendingAutoRecord);
      setHasLibrary(!!pendingLibrary);
      setOpen(o);
    };
    return () => {
      listener = null;
    };
  }, []);
  if (!open) return null;
  return (
    <CameraModal
      autoRecord={autoRecord}
      showLibrary={hasLibrary}
      onClose={() => {
        pendingCallback = null;
        pendingLibrary = null;
        setOpen(false);
      }}
      onCaptured={(file) => {
        const cb = pendingCallback;
        pendingCallback = null;
        pendingLibrary = null;
        setOpen(false);
        cb?.(file);
      }}
      onLibrary={(file) => {
        const cb = pendingLibrary;
        pendingCallback = null;
        pendingLibrary = null;
        setOpen(false);
        cb?.(file);
      }}
    />
  );
}

function CameraModal({
  onClose,
  onCaptured,
  onLibrary,
  showLibrary,
  autoRecord,
}: {
  onClose: () => void;
  onCaptured: (f: ChatPhotoInput) => void;
  onLibrary: (f: ChatPhotoInput) => void;
  showLibrary: boolean;
  autoRecord: boolean;
}) {
  const camRef = useRef<CameraView>(null);
  // Recording that does not depend on a finger staying on the shutter (opened by HOLDING the
  // composer's camera button): the shutter then stops it with a tap instead of on release.
  const handsFreeRef = useRef(false);
  const autoStartedRef = useRef(false);
  // Photos need the camera in 'picture' mode and video in 'video' mode (taking a picture while in
  // video mode fails on Android). It opens in picture mode and switches to video when the shutter
  // is HELD (or immediately when opened by holding the composer's camera button).
  const [mode, setMode] = useState<'picture' | 'video'>(autoRecord ? 'video' : 'picture');
  // Photos are taken at ~1600x1200 instead of the sensor's full 12 MP+: a chat picture doesn't need more,
  // and it is the difference between a 3 MB and a ~400 KB upload (the "lag" when sending a photo).
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const startAfterSwitchRef = useRef(false);
  const pressedRef = useRef(false); // finger currently on the shutter
  const [camPerm, requestCam] = useCameraPermissions();
  const [micPerm, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      if (!camPerm?.granted) await requestCam();
      if (!micPerm?.granted) await requestMic();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current);
    },
    [],
  );

  const takePhoto = useCallback(async () => {
    if (!camRef.current || !ready || busy) return;
    setBusy(true);
    try {
      const pic = await camRef.current.takePictureAsync({ quality: 0.7 });
      if (pic?.uri) onCaptured({ uri: pic.uri, name: 'photo.jpg', mimeType: 'image/jpeg' });
    } catch (e) {
      console.warn('[camera] takePictureAsync failed:', e);
      Alert.alert('Could not take photo', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }, [ready, busy, onCaptured]);

  const startVideo = useCallback(async () => {
    if (!camRef.current || !ready || busy || recording) return;
    if (!micPerm?.granted) {
      const r = await requestMic();
      if (!r.granted) {
        Alert.alert(
          'Microphone needed',
          'Allow microphone access for SoWash in Settings to record video with sound.',
          r.canAskAgain
            ? [{ text: 'OK' }]
            : [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
        );
        return;
      }
    }
    setRecording(true);
    setSeconds(0);
    startedAtRef.current = Date.now();
    tickRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
    try {
      // Resolves when stopRecording() is called or maxDuration is reached.
      const result = await camRef.current.recordAsync({ maxDuration: MAX_VIDEO_SECONDS });
      const elapsed = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      if (result?.uri) {
        onCaptured({ uri: result.uri, name: `video-${Math.min(elapsed, MAX_VIDEO_SECONDS)}.mp4`, mimeType: 'video/mp4' });
      }
    } catch (e) {
      console.warn('[camera] recordAsync failed:', e);
      Alert.alert('Could not record video', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      setRecording(false);
    }
  }, [ready, busy, recording, micPerm, requestMic, onCaptured]);

  // WhatsApp's gallery button on the camera screen: pick a photo instead of taking one.
  const pickFromLibrary = useCallback(async () => {
    if (recording) return;
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      const asset = !res.canceled ? res.assets?.[0] : null;
      if (asset) onLibrary({ uri: asset.uri, name: asset.fileName ?? 'photo.jpg', mimeType: asset.mimeType ?? 'image/jpeg' });
    } catch {
      Alert.alert('Could not open your photos', 'Please try again.');
    }
  }, [recording, onLibrary]);

  const stopVideo = useCallback(() => {
    if (recording) camRef.current?.stopRecording();
  }, [recording]);

  // Shutter HELD while in picture mode: switch the camera to video, then record once it has
  // re-bound. If the finger is already up by then, recording is hands-free (tap to stop).
  const beginVideo = useCallback(() => {
    if (mode === 'picture') {
      startAfterSwitchRef.current = true;
      setReady(false);
      setMode('video');
      return;
    }
    startVideo();
  }, [mode, startVideo]);

  useEffect(() => {
    if (mode !== 'video' || !startAfterSwitchRef.current) return;
    if (ready) {
      startAfterSwitchRef.current = false;
      handsFreeRef.current = !pressedRef.current;
      startVideo();
      return;
    }
    // onCameraReady may not fire again after a mode change — don't wait on it forever.
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, [mode, ready, startVideo]);

  // Opened by holding the composer's camera button → start recording as soon as the camera is up.
  useEffect(() => {
    if (!autoRecord || !ready || autoStartedRef.current) return;
    autoStartedRef.current = true;
    handsFreeRef.current = true;
    startVideo();
  }, [autoRecord, ready, startVideo]);

  const denied = camPerm && !camPerm.granted && !camPerm.canAskAgain;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.root}>
        <StatusBar hidden />
        {camPerm?.granted ? (
          <CameraView
            ref={camRef}
            style={StyleSheet.absoluteFill as never}
            facing={facing}
            mode={mode}
            videoQuality="480p"
            // ~1.5 Mbps: a 30 s clip is ~5 MB, so it uploads quickly on a weak connection.
            videoBitrate={1_500_000}
            pictureSize={mode === 'picture' ? pictureSize : undefined}
            onCameraReady={() => {
              setReady(true);
              if (mode === 'picture' && !pictureSize) {
                camRef.current
                  ?.getAvailablePictureSizesAsync()
                  .then((sizes) => {
                    const pick = pickPictureSize(sizes);
                    if (pick) setPictureSize(pick);
                  })
                  .catch(() => {});
              }
            }}
          />
        ) : (
          <View style={st.center}>
            {denied ? (
              <>
                <Text style={st.msg}>Camera access is turned off. Enable it in Settings to take photos and videos.</Text>
                <TouchableOpacity onPress={() => Linking.openSettings()} style={st.settingsBtn}>
                  <Text style={st.settingsBtnText}>Open Settings</Text>
                </TouchableOpacity>
              </>
            ) : (
              <ActivityIndicator color="#fff" />
            )}
          </View>
        )}

        <TouchableOpacity style={st.close} onPress={onClose} hitSlop={12} accessibilityLabel="Close camera" disabled={recording}>
          <X size={24} color="#fff" />
        </TouchableOpacity>

        {recording ? (
          <View style={st.timerPill}>
            <View style={st.recDot} />
            <Text style={st.timerText}>
              {formatClock(seconds)} / {formatClock(MAX_VIDEO_SECONDS)}
            </Text>
          </View>
        ) : null}

        <View style={st.bottom}>
          <Text style={st.hint}>
            {recording
              ? handsFreeRef.current
                ? 'Recording… tap to stop and attach'
                : 'Release to attach'
              : 'Tap for photo · hold for video'}
          </Text>
          <View style={st.controlsRow}>
            <View style={st.side}>
              {showLibrary && !recording ? (
                <TouchableOpacity
                  onPress={pickFromLibrary}
                  style={st.flip}
                  hitSlop={10}
                  accessibilityLabel="Choose a photo from your gallery"
                >
                  <ImageIcon size={22} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
            <Pressable
              // A tap while recording hands-free stops it; otherwise a tap is a photo.
              onPress={() => (recording ? stopVideo() : takePhoto())}
              onPressIn={() => {
                pressedRef.current = true;
              }}
              onLongPress={beginVideo}
              // Hold-to-record ends on release — but not when recording was started hands-free.
              onPressOut={() => {
                pressedRef.current = false;
                if (!handsFreeRef.current) stopVideo();
              }}
              delayLongPress={250}
              // Not disabled while the camera re-binds for video: a Pressable that becomes disabled
              // mid-press can lose its release event. takePhoto/startVideo check `ready` themselves.
              disabled={!camPerm?.granted}
              accessibilityLabel="Shutter: tap for photo, hold for video"
              style={[st.shutterOuter, recording && st.shutterOuterRec]}
            >
              <View style={[st.shutterInner, recording && st.shutterInnerRec]} />
            </Pressable>
            <View style={st.side}>
              {!recording ? (
                <TouchableOpacity
                  onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
                  style={st.flip}
                  hitSlop={10}
                  accessibilityLabel="Flip camera"
                >
                  <RefreshCw size={22} color="#fff" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  settingsBtn: { marginTop: 16, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 10 },
  settingsBtnText: { color: '#0f172a', fontWeight: '700' },
  msg: { color: '#fff', textAlign: 'center', fontSize: 15, lineHeight: 22 },
  close: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 40,
    left: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerPill: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 46,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  recDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#ef4444' },
  timerText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 34, alignItems: 'center', gap: 14 },
  hint: { color: '#fff', fontSize: 13, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%' },
  side: { flex: 1, alignItems: 'center' },
  shutterOuter: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuterRec: { borderColor: '#ef4444', transform: [{ scale: 1.15 }] },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff' },
  shutterInnerRec: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#ef4444' },
  flip: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
