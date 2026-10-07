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
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { RefreshCw, X } from 'lucide-react-native';
import { ChatPhotoInput } from './hooks';
import { formatClock, MAX_VIDEO_SECONDS } from './chat-media';

type Listener = (open: boolean) => void;
let pendingCallback: ((file: ChatPhotoInput) => void) | null = null;
let listener: Listener | null = null;

/** Open the camera; `onPicked` receives the photo or video the user captured. */
export function openCameraCapture(onPicked: (file: ChatPhotoInput) => void): void {
  pendingCallback = onPicked;
  listener?.(true);
}

export function CameraCaptureHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    listener = setOpen;
    return () => {
      listener = null;
    };
  }, []);
  if (!open) return null;
  return (
    <CameraModal
      onClose={() => {
        pendingCallback = null;
        setOpen(false);
      }}
      onCaptured={(file) => {
        const cb = pendingCallback;
        pendingCallback = null;
        setOpen(false);
        cb?.(file);
      }}
    />
  );
}

function CameraModal({ onClose, onCaptured }: { onClose: () => void; onCaptured: (f: ChatPhotoInput) => void }) {
  const camRef = useRef<CameraView>(null);
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
    } catch {
      Alert.alert('Could not take photo', 'Please try again.');
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
    } catch {
      Alert.alert('Could not record video', 'Please try again.');
    } finally {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      setRecording(false);
    }
  }, [ready, busy, recording, micPerm, requestMic, onCaptured]);

  const stopVideo = useCallback(() => {
    if (recording) camRef.current?.stopRecording();
  }, [recording]);

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
            mode="video"
            videoQuality="480p"
            onCameraReady={() => setReady(true)}
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
          <Text style={st.hint}>{recording ? 'Release to send' : 'Tap for photo · hold for video'}</Text>
          <View style={st.controlsRow}>
            <View style={st.side} />
            <Pressable
              onPress={takePhoto}
              onLongPress={startVideo}
              onPressOut={stopVideo}
              delayLongPress={250}
              disabled={!camPerm?.granted || !ready}
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
