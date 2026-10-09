// src/voiceRecorder.tsx
//
// Hold-to-record voice notes, WhatsApp style: press and HOLD the mic → recording starts,
// release → it is sent, slide the finger left → cancel. Shared by all three chat composers.
//
// useVoiceHold() returns PanResponder handlers for the mic button plus the live state the
// composer needs to swap its text pill for <VoiceRecordingBar/> while recording.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, PanResponder, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';
import { ChevronLeft, ChevronUp, Lock, Mic, Send, Trash2 } from 'lucide-react-native';
import { ChatPhotoInput } from './hooks';
import { formatClock, MAX_VOICE_SECONDS, waveToHex } from './chat-media';
import { palette } from './theme';

const CANCEL_DX = -90; // slide this far left to cancel
const LOCK_DY = -70; // slide this far UP to lock (keep recording hands-free, like WhatsApp)
const MIN_SECONDS = 1; // shorter than this is treated as an accidental tap

/**
 * Opening the microphone can be refused for reasons that clear up a moment later (it is still released by the camera,
 * a phone dislikes one setting). So: try the normal settings, then without level metering, then plain mono 22 kHz AAC -
 * each time letting the recorder reset first. The file stays .m4a, which is what the server accepts for voice notes.
 */
const PREPARE_ATTEMPTS: Array<Partial<RecordingOptions>> = [
  {},
  { isMeteringEnabled: false },
  { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: false, sampleRate: 22050, numberOfChannels: 1, bitRate: 64000 },
];

async function prepareWithFallback(recorder: { prepareToRecordAsync: (o?: Partial<RecordingOptions>) => Promise<void>; stop: () => Promise<void> }) {
  let lastError: unknown;
  for (let i = 0; i < PREPARE_ATTEMPTS.length; i++) {
    try {
      await recorder.prepareToRecordAsync(PREPARE_ATTEMPTS[i]);
      return;
    } catch (e) {
      lastError = e;
      console.warn('[voice] prepareToRecordAsync attempt ' + (i + 1) + ' failed:', e);
      try {
        await recorder.stop();
      } catch {
        /* nothing was recording */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw lastError;
}

export function useVoiceHold(onRecorded: (file: ChatPhotoInput) => void) {
  // Metering on: the loudness while recording becomes the waveform drawn on the voice note.
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const meterRef = useRef<number[]>([]);
  const [recording, setRecording] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
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
      lockedRef.current = false;
      setLocked(false);
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
      // voice-<seconds>-<waveform hex>.m4a — the name carries the duration and the loudness bars (see chat-media.ts).
      const wave = waveToHex(meterRef.current);
      onRecordedRef.current({ uri, name: wave ? `voice-${elapsed}-${wave}.m4a` : `voice-${elapsed}.m4a`, mimeType: 'audio/m4a' });
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
      try {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      } catch (e) {
        console.warn('[voice] setAudioModeAsync failed (continuing):', e);
      }
      await prepareWithFallback(recorder);
      if (!holdingRef.current) return; // released while preparing
      recorder.record();
      activeRef.current = true;
      startedAtRef.current = Date.now();
      meterRef.current = [];
      setRecording(true);
      setSeconds(0);
      tickRef.current = setInterval(() => {
        const s = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setSeconds(s);
        // loudness sample (dB, about -60 quiet … 0 loud) for the waveform; skipped if the device sends none
        try {
          const db = recorder.getStatus().metering;
          if (typeof db === 'number' && Number.isFinite(db)) meterRef.current.push(db);
        } catch {
          /* no metering on this device */
        }
        if (s >= MAX_VOICE_SECONDS) {
          holdingRef.current = false;
          finish(false);
        }
      }, 100);
    } catch (e) {
      console.warn('[voice] recording failed to start:', e);
      // Show the real reason (it is what tells a permission / device / config problem apart).
      Alert.alert('Could not record', `Voice recording failed to start.

${e instanceof Error ? e.message : String(e)}`);
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
          lockedRef.current = false;
          begin();
        },
        onPanResponderMove: (_e, g) => {
          if (lockedRef.current) return;
          // Slide UP → lock: recording carries on after the finger lifts.
          if (activeRef.current && g.dy < LOCK_DY && g.dx > CANCEL_DX / 2) {
            lockedRef.current = true;
            cancelRef.current = false;
            setCancelling(false);
            setLocked(true);
            return;
          }
          const c = g.dx < CANCEL_DX;
          cancelRef.current = c;
          setCancelling((prev) => (prev === c ? prev : c));
        },
        onPanResponderRelease: () => {
          holdingRef.current = false;
          if (lockedRef.current) return; // keeps recording until Send / the trash button
          finish(cancelRef.current);
        },
        onPanResponderTerminate: () => {
          holdingRef.current = false;
          // Locking swaps the mic for a Send button, which drops this responder — not a cancel.
          if (lockedRef.current) return;
          finish(true);
        },
      }),
    [begin, finish],
  );

  const sendLocked = useCallback(() => finish(false), [finish]);
  const cancelLocked = useCallback(() => finish(true), [finish]);

  return { panHandlers: panResponder.panHandlers, recording, cancelling, locked, seconds, sendLocked, cancelLocked };
}

export type VoiceHold = ReturnType<typeof useVoiceHold>;

/** Replaces the text pill while a voice note is being recorded. */
export function VoiceRecordingBar({ voice }: { voice: VoiceHold }) {
  const { seconds, cancelling, locked, cancelLocked } = voice;
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setBlink((b) => !b), 600);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={st.bar}>
      {locked ? (
        <TouchableOpacity onPress={cancelLocked} hitSlop={10} accessibilityLabel="Delete recording">
          <Trash2 size={20} color="#dc2626" />
        </TouchableOpacity>
      ) : (
        <View style={[st.dot, { opacity: blink ? 1 : 0.25 }]} />
      )}
      <Text style={st.time}>{formatClock(seconds)}</Text>
      {locked ? (
        <View style={st.hint}>
          <View style={[st.dot, { opacity: blink ? 1 : 0.25 }]} />
          <Text style={st.hintText}>Recording… tap send</Text>
        </View>
      ) : (
        <View style={st.hint}>
          <ChevronLeft size={16} color={cancelling ? '#dc2626' : palette.muted} />
          <Text style={[st.hintText, cancelling && { color: '#dc2626' }]}>
            {cancelling ? 'Release to cancel' : 'Slide to cancel'}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * The round mic button. Holding it shows a "slide up to lock" hint above it; once locked it
 * becomes a Send button.
 */
export function VoiceMicButton({
  voice,
  accent,
  buttonStyle,
}: {
  voice: VoiceHold;
  accent: string;
  buttonStyle: StyleProp<ViewStyle>;
}) {
  if (voice.locked) {
    return (
      <TouchableOpacity
        onPress={voice.sendLocked}
        accessibilityLabel="Send voice message"
        style={[buttonStyle, { backgroundColor: accent }]}
      >
        <Send size={18} color="#fff" />
      </TouchableOpacity>
    );
  }
  return (
    <View>
      {voice.recording ? (
        <View style={st.lockHint} pointerEvents="none">
          <Lock size={14} color={palette.muted} />
          <ChevronUp size={14} color={palette.muted} />
        </View>
      ) : null}
      <View
        {...voice.panHandlers}
        accessibilityLabel="Hold to record a voice message"
        style={[
          buttonStyle,
          { backgroundColor: voice.cancelling ? '#dc2626' : accent, transform: [{ scale: voice.recording ? 1.2 : 1 }] },
        ]}
      >
        <Mic size={20} color="#fff" />
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
  lockHint: {
    position: 'absolute',
    bottom: 64,
    alignSelf: 'center',
    width: 36,
    paddingVertical: 8,
    borderRadius: 18,
    alignItems: 'center',
    gap: 2,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
});
