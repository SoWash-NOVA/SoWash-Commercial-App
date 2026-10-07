// src/components/ChatAttachment.tsx
//
// Voice-note and video bubbles for every chat (client Support, staff Support, Team).
// Photos keep their own existing <Image> rendering at each call site; this handles the
// other two kinds (see src/chat-media.ts for how a kind is told apart).
//
// Players are created LAZILY — a tile is plain views until tapped — because a chat
// can hold dozens of voice notes and each expo-audio player is a native object.

import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Mic, Pause, Play, X, VideoOff } from 'lucide-react-native';
import { palette } from '../theme';
import { keep } from '../themeEngine';
import { durationFromName, formatClock, mediaKind, videoExpired, VIDEO_RETENTION_DAYS } from '../chat-media';

// Only one voice note plays at a time (starting another stops the previous one).
let stopCurrent: (() => void) | null = null;

interface Props {
  /** Resolved URL (server) or local file:// URI (a message still sending). */
  url: string;
  name?: string | null;
  createdAt: string;
  mine: boolean;
  accent: string;
  /** True while the message is still uploading — disables playback of the (local) file. */
  sending?: boolean;
}

export default function ChatAttachment({ url, name, createdAt, mine, accent, sending }: Props) {
  const kind = mediaKind(name || url);
  if (kind === 'audio') return <VoiceNote url={url} name={name} mine={mine} accent={accent} sending={sending} />;
  if (kind === 'video') return <VideoNote url={url} name={name} createdAt={createdAt} mine={mine} sending={sending} />;
  return null;
}

// ───────────────────────────── voice note ─────────────────────────────

function VoiceNote({ url, name, mine, accent, sending }: Omit<Props, 'createdAt'>) {
  const [active, setActive] = useState(false);
  const total = durationFromName(name) ?? 0;
  const fg = mine ? keep('#fff') : accent;
  const track = mine ? 'rgba(255,255,255,0.35)' : palette.border;

  if (!active) {
    return (
      <View style={st.voiceRow}>
        <TouchableOpacity
          style={[st.voiceBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : accent + '1f' }]}
          onPress={() => setActive(true)}
          disabled={sending}
          accessibilityLabel="Play voice message"
        >
          {sending ? <ActivityIndicator size="small" color={fg} /> : <Play size={18} color={fg} fill={fg} />}
        </TouchableOpacity>
        <View style={st.voiceBody}>
          <View style={[st.voiceTrack, { backgroundColor: track }]} />
          <View style={st.voiceMetaRow}>
            <Mic size={11} color={mine ? 'rgba(255,255,255,0.8)' : palette.muted} />
            <Text style={[st.voiceTime, { color: mine ? 'rgba(255,255,255,0.85)' : palette.muted }]}>
              {formatClock(total)}
            </Text>
          </View>
        </View>
      </View>
    );
  }
  return <ActiveVoice url={url} total={total} mine={mine} accent={accent} onEnded={() => setActive(false)} />;
}

function ActiveVoice({
  url,
  total,
  mine,
  accent,
  onEnded,
}: {
  url: string;
  total: number;
  mine: boolean;
  accent: string;
  onEnded: () => void;
}) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const startedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      } catch {
        /* playback still works on the default mode */
      }
      if (cancelled) return;
      stopCurrent?.();
      stopCurrent = () => {
        try {
          player.pause();
        } catch {
          /* already released */
        }
        onEnded();
      };
      player.play();
      startedRef.current = true;
    })();
    return () => {
      cancelled = true;
      if (stopCurrent) stopCurrent = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (startedRef.current && status.didJustFinish) onEnded();
  }, [status.didJustFinish, onEnded]);

  const duration = status.duration > 0 ? status.duration : total;
  const pct = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;
  const fg = mine ? keep('#fff') : accent;

  return (
    <View style={st.voiceRow}>
      <TouchableOpacity
        style={[st.voiceBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : accent + '1f' }]}
        onPress={() => (status.playing ? player.pause() : player.play())}
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
      >
        {status.playing ? <Pause size={18} color={fg} fill={fg} /> : <Play size={18} color={fg} fill={fg} />}
      </TouchableOpacity>
      <View style={st.voiceBody}>
        <View style={[st.voiceTrack, { backgroundColor: mine ? 'rgba(255,255,255,0.35)' : palette.border }]}>
          <View style={[st.voiceFill, { width: `${pct * 100}%`, backgroundColor: fg }]} />
        </View>
        <View style={st.voiceMetaRow}>
          <Mic size={11} color={mine ? 'rgba(255,255,255,0.8)' : palette.muted} />
          <Text style={[st.voiceTime, { color: mine ? 'rgba(255,255,255,0.85)' : palette.muted }]}>
            {formatClock(status.playing || status.currentTime > 0 ? status.currentTime : duration)}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─────────────────────────────── video ───────────────────────────────

function VideoNote({ url, name, createdAt, mine, sending }: Omit<Props, 'accent'>) {
  const [open, setOpen] = useState(false);
  const total = durationFromName(name);
  // Local (still-uploading) files are always playable; a server copy is deleted after 30 days.
  const expired = !sending && videoExpired(createdAt);

  if (expired) {
    return (
      <View style={[st.videoTile, st.videoExpired]}>
        <VideoOff size={22} color={palette.muted} />
        <Text style={st.videoExpiredText}>Video expired</Text>
        <Text style={st.videoExpiredSub}>Videos are kept for {VIDEO_RETENTION_DAYS} days</Text>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[st.videoTile, { backgroundColor: mine ? 'rgba(0,0,0,0.28)' : '#0f172a' }]}
        onPress={() => setOpen(true)}
        disabled={sending}
        accessibilityLabel="Play video"
      >
        <View style={st.videoPlay}>
          {sending ? <ActivityIndicator color="#fff" /> : <Play size={26} color="#fff" fill="#fff" />}
        </View>
        {total != null ? (
          <View style={st.videoBadge}>
            <Text style={st.videoBadgeText}>{formatClock(total)}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
      {open ? <VideoModal url={url} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.modalRoot}>
        <StatusBar hidden />
        <VideoView player={player} style={st.modalVideo} nativeControls contentFit="contain" />
        <TouchableOpacity style={st.modalClose} onPress={onClose} hitSlop={12} accessibilityLabel="Close video">
          <X size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 190, paddingVertical: 2, marginBottom: 4 },
  voiceBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  voiceBody: { flex: 1, gap: 6 },
  voiceTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  voiceFill: { height: 4, borderRadius: 2 },
  voiceMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voiceTime: { fontSize: 11.5, fontWeight: '600' },

  videoTile: {
    width: 200,
    height: 150,
    borderRadius: 14,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  videoPlay: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  videoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  videoExpired: { backgroundColor: '#e2e8f0', gap: 4 },
  videoExpiredText: { color: '#475569', fontSize: 13, fontWeight: '700' },
  videoExpiredSub: { color: '#64748b', fontSize: 11 },

  modalRoot: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  modalVideo: { width: '100%', height: '100%' },
  modalClose: {
    position: 'absolute',
    top: 44,
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
