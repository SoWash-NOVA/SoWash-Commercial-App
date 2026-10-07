// src/voiceRecorder.tsx
//
// Hold-to-record voice notes, WhatsApp style: press and HOLD the mic → recording starts,
// release → it is sent, slide the finger left → cancel. Shared by all three chat composers.
//
// useVoiceHold() returns PanResponder handlers for the mic button plus the live state the
// composer needs to swap its text pill for <VoiceRecordingBar/> while recording.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, PanResponder, StyleSheet, Text, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { ChevronLeft } from 'lucide-react-native';
import { ChatPhotoInput } from './hooks';
import { formatClock, MAX_VOICE_SECONDS } from './chat-media';
import { palette } from './theme';

const CANCEL_DX = -90; // slide this far left to cancel
const MIN_SECONDS = 1; // shorter than this is treated as an accidental tap

export function useVoiceHold(onRecorded: (file: ChatPhotoInput) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const holdingRef = useRef(false); // finger is still down
  const activeRef = useRef(false); // recorder is actually running
  const startingRef = useRef(false);
  const startedAtRef = useRef(0);
  const cancelRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const clearTick = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const finish = useCallback(
    async (discard: boolean) => {
      if (!activeRef.current) return;
      activeRef.current = false;
      clearTick();
      const elapsed = Math.round((Date.now() - startedAtRef.current) / 1000);
      setRecording(false);
      setCancelling(false);
      setSeconds(0);
      try {
        await recorder.stop();
      } catch {
        /* nothing recorded */
      }
      const uri = recorder.uri;
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {
        /* ignore */
      }
      if (discard || !uri || elapsed < MIN_SECONDS) return;
      onRecordedRef.current({ uri, name: `voice-${elapsed}.m4a`, mimeType: 'audio/m4a' });
    },
    [recorder],
  );

  const begin = useCallback(async () => {
    if (startingRef.current || activeRef.current) return;
    startingRef.current = true;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        // Android stops showing the system prompt after two denials ("don't ask again"), so
        // the only way back is the app's Settings page.
        Alert.alert(
          'Microphone needed',
          'Allow microphone access for SoWash in Settings to send voice messages.',
          perm.canAskAgain
            ? [{ text: 'OK' }]
            : [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
        );
        return;
      }
      if (!holdingRef.current) return; // the permission prompt ate the press
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!holdingRef.current) return; // released while preparing
      recorder.record();
      activeRef.current = true;
      startedAtRef.current = Date.now();
      setRecording(true);
      setSeconds(0);
      tickRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setSeconds(s);
        if (s >= MAX_VOICE_SECONDS) {
          holdingRef.current = false;
          finish(false);
        }
      }, 250);
    } catch {
      Alert.alert('Could not record', 'Voice recording failed to start. Please try again.');
    } finally {
      startingRef.current = false;
    }
  }, [recorder, finish]);

  useEffect(
    () => () => {
      clearTick();
      if (activeRef.current) {
        activeRef.current = false;
        recorder.stop().catch(() => {});
      }
    },
    [recorder],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          holdingRef.current = true;
          cancelRef.current = false;
          begin();
        },
        onPanResponderMove: (_e, g) => {
          const c = g.dx < CANCEL_DX;
          cancelRef.current = c;
          setCancelling((prev) => (prev === c ? prev : c));
        },
        onPanResponderRelease: () => {
          holdingRef.current = false;
          finish(cancelRef.current);
        },
        onPanResponderTerminate: () => {
          holdingRef.current = false;
          finish(true);
        },
      }),
    [begin, finish],
  );

  return { panHandlers: panResponder.panHandlers, recording, cancelling, seconds };
}

/** Replaces the text pill while a voice note is being recorded. */
export function VoiceRecordingBar({ seconds, cancelling }: { seconds: number; cancelling: boolean }) {
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setBlink((b) => !b), 600);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={st.bar}>
      <View style={[st.dot, { opacity: blink ? 1 : 0.25 }]} />
      <Text style={st.time}>{formatClock(seconds)}</Text>
      <View style={st.hint}>
        <ChevronLeft size={16} color={cancelling ? '#dc2626' : palette.muted} />
        <Text style={[st.hintText, cancelling && { color: '#dc2626' }]}>
          {cancelling ? 'Release to cancel' : 'Slide to cancel'}
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  bar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surface,
    borderRadius: 26,
    paddingHorizontal: 16,
    minHeight: 50,
    borderWidth: 1,
    borderColor: palette.border,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#dc2626' },
  time: { fontSize: 15, fontWeight: '700', color: palette.ink, minWidth: 40 },
  hint: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
  hintText: { fontSize: 13, color: palette.muted },
});
