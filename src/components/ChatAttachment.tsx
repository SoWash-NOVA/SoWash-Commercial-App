// src/components/ChatAttachment.tsx
//
// Voice-note and video bubbles for every chat (client Support, staff Support, Team).
// Photos keep their own existing <Image> rendering at each call site; this handles the
// other two kinds (see src/chat-media.ts for how a kind is told apart).
//
// Players are created LAZILY — a tile is plain views until tapped — because a chat
// can hold dozens of voice notes and each expo-audio player is a native object.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync, preload, clearPreloadedSource } from 'expo-audio';
import { Image } from 'expo-image';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { VideoView, createVideoPlayer, useVideoPlayer } from 'expo-video';
import type { VideoThumbnail } from 'expo-video';
import { Mic, Pause, Play, X, VideoOff } from 'lucide-react-native';
import { palette } from '../theme';
import { PhotoThumb } from './PhotoStripList';
import { keep } from '../themeEngine';
import {
  durationFromName,
  fallbackWave,
  formatClock,
  mediaKind,
  videoExpired,
  VIDEO_RETENTION_DAYS,
  waveFromName,
} from '../chat-media';

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

/**
 * A photo in a chat bubble: spinner while it loads, tap-to-retry if it fails (the same PhotoThumb the
 * completed-job report uses), and a dimmed "sending" spinner on top while it is still uploading.
 */
export function ChatPhoto({ url, width, height, uploading }: { url: string; width: number; height: number; uploading?: boolean }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <PhotoThumb url={url} width={width} height={height} radius={14} priority="high" />
      {uploading ? (
        <View pointerEvents="none" style={[st.photoUploading, { borderRadius: 14 }]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

// ───────────────────────────── voice note ─────────────────────────────

// Start downloading a voice note the moment the user TOUCHES it (the wave, the play button), so by the time the
// finger has picked a spot and pressed play the file is already there — the wait before it sounds was the download.
// Voice notes are small (~100 KB/min); only the last 12 are kept preloaded.
const warmed: string[] = [];
function warmVoice(url: string) {
  if (!url || url.startsWith('file:') || warmed.includes(url)) return;
  warmed.push(url);
  try {
    preload({ uri: url }).catch(() => {});
    if (warmed.length > 12) {
      const old = warmed.shift();
      if (old) clearPreloadedSource({ uri: old }).catch(() => {});
    }
  } catch {
    /* preloading is an optimisation only */
  }
}

// Playback speeds, like WhatsApp: tap the chip while a note plays to cycle 1x -> 1.5x -> 2x. The choice sticks for
// the next notes you open (module-level), as it does in WhatsApp.
const SPEEDS = [1, 1.5, 2];
let preferredRate = 1;

/** Squeeze/stretch the loudness bars to `n` bars (keeps the peaks). */
function resampleBars(bars: number[], n: number): number[] {
  if (n >= bars.length) return bars;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i * bars.length) / n);
    const to = Math.max(from + 1, Math.floor(((i + 1) * bars.length) / n));
    let peak = 0;
    for (let j = from; j < Math.min(to, bars.length); j++) peak = Math.max(peak, bars[j]);
    out.push(peak);
  }
  return out;
}

/** One row of bars. Memoised: while a note plays, the position changes ~5x/s but the bars themselves never do. */
const BarsRow = React.memo(function BarsRow({ bars, color, width }: { bars: number[]; color: string; width?: number }) {
  return (
    <View style={[st.wave, width != null ? { width } : null]}>
      {bars.map((level, i) => (
        <View key={i} style={[st.waveBar, { height: 4 + level * 22, backgroundColor: color }]} />
      ))}
    </View>
  );
});

/**
 * The bars of a voice note. `level` 0..1 per bar; bars before `progress` (0..1) are drawn in the "played" colour.
 * Notes recorded with this app carry their real loudness in the file name (see chat-media.ts); older ones get a
 * stable made-up shape so every bubble still looks like a voice message.
 *
 * With `onScrub` the wave is also a slider, like WhatsApp: DRAG the knob (or tap anywhere) to pick the spot —
 * before playing it sets where playback will start, while playing it jumps there. `final` is true when the
 * finger lifts (or on a tap), so the player is only seeked once, not on every pixel of the drag.
 *
 * Smoothness: nothing about the position goes through React state while dragging. The finger's x comes straight
 * from the gesture handler into an Animated.Value (native driver), and the coloured "played" bars + the knob are
 * moved by native transforms (a clip window: a mask that slides right while the coloured bars inside slide left by
 * the same amount, so they stay put and are only revealed). The parent is told about the position a few times a
 * second (for the timer text) and once at the end.
 */
function Waveform({
  bars,
  progress,
  playedColor,
  idleColor,
  onScrub,
}: {
  bars: number[];
  progress: number;
  playedColor: string;
  idleColor: string;
  onScrub?: (fraction: number, final: boolean) => void;
}) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const lastRef = useRef(progress);
  const lastEmitRef = useRef(0);
  const draggingRef = useRef(false);

  const prog = useRef(new Animated.Value(progress)).current; // 0..1, follows the player
  const dragX = useRef(new Animated.Value(0)).current; // px, fed natively by the pan gesture
  const mix = useRef(new Animated.Value(0)).current; // 1 while the finger is on the wave

  // Follow the player smoothly (playback reports ~5 times a second) unless the finger is on the wave.
  useEffect(() => {
    if (draggingRef.current) return;
    // glide to the next reported position over about one report interval, so the motion is continuous
    // instead of a small step every ~half second
    Animated.timing(prog, { toValue: progress, duration: 450, easing: Easing.linear, useNativeDriver: true }).start();
  }, [progress, prog]);

  const clampFrac = (x: number) => (widthRef.current > 0 ? Math.min(1, Math.max(0, x / widthRef.current)) : 0);

  // The finger's x is written into `dragX` by a PLAIN function. Do NOT use Animated.event (native driver) here: on
  // this React Native version (Fabric) the gesture handler's events also reach JS, where the prop is expected to be
  // a function but is the Animated event OBJECT -> "Expected `onGestureHandlerEvent` listener to be a function,
  // instead got a value of `object` type", on every move. setValue on `dragX` only updates the animated graph (the
  // bars/knob move through native transforms) — no React re-render per move, so it stays smooth.
  const onPanEvent = (e: { nativeEvent: { x: number } }) => {
    if (!draggingRef.current) return;
    const x = e.nativeEvent.x;
    dragX.setValue(x);
    lastRef.current = clampFrac(x);
    const now = Date.now();
    if (now - lastEmitRef.current > 90) {
      lastEmitRef.current = now;
      onScrubRef.current?.(lastRef.current, false);
    }
  };

  const onPanState = (e: { nativeEvent: { state: number; x: number } }) => {
    const { state, x } = e.nativeEvent;
    if (state === State.BEGAN || state === State.ACTIVE) {
      if (!draggingRef.current) {
        draggingRef.current = true;
        dragX.setValue(x);
        lastRef.current = clampFrac(x);
        mix.setValue(1);
      }
    } else if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (state === State.END) lastRef.current = clampFrac(x); // exact release point
      prog.setValue(lastRef.current);
      mix.setValue(0);
      if (state === State.END) onScrubRef.current?.(lastRef.current, true);
    }
  };

  const W = width;

  // The animated graph is built ONCE per width. It used to be rebuilt on every render (the player reports a new
  // position several times a second), which created and attached new native animation nodes each time — that was
  // the "laggy" feel while a note played.
  const { maskX, innerX, knobX } = useMemo(() => {
    // shown position = mix ? finger : player
    const dragProg = W > 0 ? dragX.interpolate({ inputRange: [0, W], outputRange: [0, 1], extrapolate: 'clamp' }) : prog;
    const shown = Animated.add(Animated.multiply(prog, Animated.subtract(1, mix)), Animated.multiply(dragProg, mix));
    return {
      maskX: shown.interpolate({ inputRange: [0, 1], outputRange: [-W, 0] }),
      innerX: shown.interpolate({ inputRange: [0, 1], outputRange: [W, 0] }),
      knobX: shown.interpolate({ inputRange: [0, 1], outputRange: [-6, W - 6] }),
    };
  }, [W, prog, dragX, mix]);

  // Fewer bars on a narrow bubble (each needs ~4.5 px), the full set on a wide one.
  const shownBars = useMemo(() => (W > 0 ? resampleBars(bars, Math.max(14, Math.floor(W / 4.5))) : bars), [bars, W]);

  const body = (
    <View
      style={st.waveWrap}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width;
        setWidth(e.nativeEvent.layout.width);
      }}
    >
      <BarsRow bars={shownBars} color={idleColor} />
      {W > 0 ? (
        // coloured "played" bars: revealed from the left by the clip window
        <View pointerEvents="none" style={st.waveClip}>
          <Animated.View style={{ width: W, height: '100%', overflow: 'hidden', transform: [{ translateX: maskX }] }}>
            <Animated.View style={{ width: W, height: '100%', transform: [{ translateX: innerX }] }}>
              <BarsRow bars={shownBars} color={playedColor} width={W} />
            </Animated.View>
          </Animated.View>
        </View>
      ) : null}
      {onScrub && W > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[st.waveKnob, { backgroundColor: playedColor, transform: [{ translateX: knobX }] }]}
        />
      ) : null}
    </View>
  );
  if (!onScrub) return body;

  // The drag uses a gesture-handler pan with a tiny activation distance: it wins over the bubble's
  // swipe-right-to-reply (which needs 14 px), so dragging the wave never starts a reply.
  return (
    <PanGestureHandler
      activeOffsetX={[-4, 4]}
      failOffsetY={[-24, 24]}
      onGestureEvent={onPanEvent}
      onHandlerStateChange={onPanState}
    >
      <View collapsable={false}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => {
            const f = clampFrac(e.nativeEvent.locationX);
            lastRef.current = f;
            prog.setValue(f);
            onScrubRef.current?.(f, true);
          }}
        >
          {body}
        </TouchableOpacity>
      </View>
    </PanGestureHandler>
  );
}

function useBars(name: string | null | undefined, url: string): number[] {
  return useMemo(() => waveFromName(name) ?? fallbackWave(name || url), [name, url]);
}

function VoiceNote({ url, name, mine, accent, sending }: Omit<Props, 'createdAt'>) {
  const [active, setActive] = useState(false);
  const [rate, setRate] = useState(preferredRate);
  // Where playback will start (0..1), picked by dragging/tapping the wave BEFORE pressing play.
  const [startFrac, setStartFrac] = useState(0);
  const total = durationFromName(name) ?? 0;
  const fg = mine ? keep('#fff') : accent;
  const bars = useBars(name, url);
  const idle = mine ? 'rgba(255,255,255,0.4)' : palette.border;
  // A FIXED width (same before, during and after playing): the old row was as wide as its content, so the
  // bubble changed size as the timer digits changed and the speed chip appeared, and the chat list nudged
  // itself on every change — the chat "moving up" while a note played. It is also wider, like WhatsApp's.
  const { width: screenW } = useWindowDimensions();
  // Responsive: a bubble is at most 80% of the row (screen minus the list padding) minus its own padding.
  // 320 px phone ~ 206, 360 ~ 234, 412 ~ 276, tablets stop at 320; the wave drops bars to fit.
  const rowWidth = Math.round(Math.min(320, Math.max(172, screenW * 0.8 - 54)));

  const cycleRate = () => {
    const next = SPEEDS[(SPEEDS.indexOf(rate) + 1) % SPEEDS.length];
    preferredRate = next;
    setRate(next);
  };

  if (!active) {
    return (
      <View style={[st.voiceRow, { width: rowWidth }]} onTouchStart={() => warmVoice(url)}>
        <TouchableOpacity
          style={[st.voiceBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : accent + '1f' }]}
          onPress={() => setActive(true)}
          disabled={sending}
          accessibilityLabel="Play voice message"
        >
          {sending ? <ActivityIndicator size="small" color={fg} /> : <Play size={18} color={fg} fill={fg} />}
        </TouchableOpacity>
        <View style={st.voiceBody}>
          <Waveform
            bars={bars}
            progress={startFrac}
            playedColor={fg}
            idleColor={idle}
            onScrub={sending ? undefined : (f) => setStartFrac(f)}
          />
          <View style={st.voiceMetaRow}>
            <Mic size={11} color={mine ? 'rgba(255,255,255,0.8)' : palette.muted} />
            <Text style={[st.voiceTime, { color: mine ? 'rgba(255,255,255,0.85)' : palette.muted }]}>
              {formatClock(startFrac > 0 && total > 0 ? startFrac * total : total)}
            </Text>
          </View>
        </View>
        <SpeedChip rate={rate} mine={mine} accent={accent} onPress={cycleRate} />
      </View>
    );
  }
  return (
    <ActiveVoice
      url={url}
      name={name}
      total={total}
      mine={mine}
      accent={accent}
      rate={rate}
      onCycleRate={cycleRate}
      rowWidth={rowWidth}
      initialFraction={startFrac}
      onEnded={() => {
        setStartFrac(0);
        setActive(false);
      }}
    />
  );
}

/** 1x / 1.5x / 2x. Always drawn (also before playing) so the row never changes size. */
function SpeedChip({ rate, mine, accent, onPress }: { rate: number; mine: boolean; accent: string; onPress: () => void }) {
  const fg = mine ? keep('#fff') : accent;
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      style={[st.speedChip, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : accent + '1f' }]}
      accessibilityLabel={`Playback speed ${rate}x, tap to change`}
    >
      <Text style={[st.speedText, { color: fg }]}>{`${rate}x`}</Text>
    </TouchableOpacity>
  );
}

function ActiveVoice({
  url,
  name,
  total,
  mine,
  accent,
  rate,
  onCycleRate,
  rowWidth,
  initialFraction,
  onEnded,
}: {
  url: string;
  name?: string | null;
  total: number;
  mine: boolean;
  accent: string;
  rate: number;
  onCycleRate: () => void;
  rowWidth: number;
  /** Start position picked on the wave before pressing play (0 = from the start). */
  initialFraction: number;
  onEnded: () => void;
}) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const startedRef = useRef(false);
  const seekedRef = useRef(initialFraction <= 0);
  // Until the jump to the picked spot has finished the player still reports 0:00 — keep SHOWING the picked spot
  // (otherwise the knob visibly slides back to the start and then forward again).
  const [seekPending, setSeekPending] = useState(initialFraction > 0);
  const bars = useBars(name, url);
  // While the finger is on the wave: where it is (0..1); the player is seeked once, when it lifts.
  const [scrub, setScrub] = useState<number | null>(null);

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
      try {
        player.setPlaybackRate(preferredRate);
      } catch {
        /* keeps 1x */
      }
      startedRef.current = true;
      // Started from a spot picked on the wave: a seek issued before the player is really running is
      // ignored (it played from 0:00), so play MUTED first, jump once it is actually playing (effect
      // below), then unmute — no blip of the beginning is heard.
      if (!seekedRef.current) player.muted = true;
      player.play();
    })();
    return () => {
      cancelled = true;
      if (stopCurrent) stopCurrent = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Wait until it is genuinely playing, then jump to the picked spot.
    if (seekedRef.current || !startedRef.current || !status.playing) return;
    seekedRef.current = true;
    const dur = status.duration > 0 ? status.duration : total;
    const target = Math.max(0, Math.min(initialFraction * dur, dur > 1 ? dur - 0.5 : dur));
    const unmute = () => {
      try {
        player.muted = false;
      } catch {
        /* released */
      }
      setSeekPending(false);
    };
    // Unmute the moment the player is really at the spot (checked every 60 ms), instead of waiting a fixed
    // third of a second. Some devices acknowledge the seek but keep playing from the start: if the position
    // has not moved after ~300 ms, jump once more; give up waiting after 1.5 s and unmute anyway.
    const waitForSpot = () =>
      new Promise<void>((resolve) => {
        const t0 = Date.now();
        let retried = false;
        const tick = () => {
          let at = 0;
          try {
            at = player.currentTime;
          } catch {
            /* released */
          }
          if (at >= target - 0.4 || Date.now() - t0 > 1500) {
            resolve();
            return;
          }
          if (!retried && Date.now() - t0 > 300) {
            retried = true;
            player.seekTo(target).catch(() => {});
          }
          setTimeout(tick, 60);
        };
        tick();
      });
    player
      .seekTo(target)
      .catch(() => {})
      .then(waitForSpot)
      .finally(unmute);
  }, [status.playing, status.duration, total, initialFraction, player]);

  useEffect(() => {
    if (startedRef.current && status.didJustFinish) onEnded();
  }, [status.didJustFinish, onEnded]);

  // Apply the chosen speed (the chip lives in the parent so it also works before playing).
  useEffect(() => {
    try {
      player.setPlaybackRate(rate);
    } catch {
      /* ignore */
    }
  }, [rate, player]);

  // Safety net: never leave the display pinned to the picked spot if the jump somehow never completes.
  useEffect(() => {
    if (!seekPending) return undefined;
    const t = setTimeout(() => setSeekPending(false), 4000);
    return () => clearTimeout(t);
  }, [seekPending]);

  const duration = status.duration > 0 ? status.duration : total;
  const pct = seekPending ? initialFraction : duration > 0 ? Math.min(1, status.currentTime / duration) : initialFraction;
  const shown = scrub ?? pct;
  const fg = mine ? keep('#fff') : accent;

  return (
    <View style={[st.voiceRow, { width: rowWidth }]}>
      <TouchableOpacity
        style={[st.voiceBtn, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : accent + '1f' }]}
        onPress={() => (status.playing ? player.pause() : player.play())}
        accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'}
      >
        {!status.isLoaded || seekPending ? (
          // loading the file / jumping to the picked spot: show it, instead of a button that seems dead
          <ActivityIndicator size="small" color={fg} />
        ) : status.playing ? (
          <Pause size={18} color={fg} fill={fg} />
        ) : (
          <Play size={18} color={fg} fill={fg} />
        )}
      </TouchableOpacity>
      <View style={st.voiceBody}>
        <Waveform
          bars={bars}
          progress={shown}
          playedColor={fg}
          idleColor={mine ? 'rgba(255,255,255,0.4)' : palette.border}
          onScrub={(f, final) => {
            setScrub(f);
            if (final) {
              if (duration > 0) {
                player
                  .seekTo(f * duration)
                  .catch(() => {})
                  .finally(() => setScrub(null));
              } else {
                setScrub(null);
              }
            }
          }}
        />
        <View style={st.voiceMetaRow}>
          <Mic size={11} color={mine ? 'rgba(255,255,255,0.8)' : palette.muted} />
          <Text style={[st.voiceTime, { color: mine ? 'rgba(255,255,255,0.85)' : palette.muted }]}>
            {formatClock(
              scrub != null
                ? scrub * duration
                : seekPending
                  ? initialFraction * duration
                  : status.playing || status.currentTime > 0
                  ? status.currentTime
                  : initialFraction > 0
                    ? initialFraction * duration
                    : duration,
            )}
          </Text>
        </View>
      </View>
      {/* playback speed: 1x -> 1.5x -> 2x -> 1x */}
      <SpeedChip rate={rate} mine={mine} accent={accent} onPress={onCycleRate} />
    </View>
  );
}

// ─────────────────────────────── video ───────────────────────────────

// First-frame thumbnails (WhatsApp shows the video's picture, not a blank tile). Generated on the
// device from the file itself — the server stores no thumbnail — one video at a time, then kept
// in memory so scrolling back doesn't redo the work. A failure just leaves the plain dark tile.
const thumbCache = new Map<string, VideoThumbnail>();
let thumbQueue: Promise<unknown> = Promise.resolve();

function makeThumbnail(url: string): Promise<VideoThumbnail | null> {
  const job = async (): Promise<VideoThumbnail | null> => {
    const player = createVideoPlayer({ uri: url });
    try {
      // generateThumbnailsAsync works on the loaded asset — wait until the player has it.
      const deadline = Date.now() + 10000;
      while (player.status !== 'readyToPlay') {
        if (player.status === 'error' || Date.now() > deadline) return null;
        await new Promise((r) => setTimeout(r, 120));
      }
      const [thumb] = await player.generateThumbnailsAsync(0.2, { maxWidth: 480, maxHeight: 480 });
      return thumb ?? null;
    } catch {
      return null;
    } finally {
      try {
        (player as unknown as { release?: () => void }).release?.();
      } catch {
        /* already released */
      }
    }
  };
  const next = thumbQueue.then(job, job);
  thumbQueue = next.catch(() => null);
  return next;
}

function useVideoThumbnail(url: string, enabled: boolean): { thumb: VideoThumbnail | null; loading: boolean } {
  const [thumb, setThumb] = useState<VideoThumbnail | null>(() => thumbCache.get(url) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const cached = thumbCache.get(url);
    if (cached) {
      setThumb(cached);
      return;
    }
    let alive = true;
    makeThumbnail(url).then((t) => {
      if (!t) {
        if (alive) setFailed(true);
        return;
      }
      thumbCache.set(url, t);
      if (alive) setThumb(t);
    });
    return () => {
      alive = false;
    };
  }, [url, enabled]);
  return { thumb, loading: enabled && !thumb && !failed };
}

function VideoNote({ url, name, createdAt, mine, sending }: Omit<Props, 'accent'>) {
  const [open, setOpen] = useState(false);
  const total = durationFromName(name);
  // Local (still-uploading) files are always playable; a server copy is deleted after 30 days.
  const expired = !sending && videoExpired(createdAt);
  // Not while it is still uploading: decoding the clip for a thumbnail at the same moment as the upload
  // and the list re-render is what made sending a video stutter. It appears once the server copy lands.
  const { thumb, loading: thumbLoading } = useVideoThumbnail(url, !expired && !sending);
  // Tile follows the video's own shape (portrait clips are taller), within sane bounds.
  const tileHeight =
    thumb && thumb.width > 0 && thumb.height > 0 ? Math.min(260, Math.max(120, Math.round((200 * thumb.height) / thumb.width))) : 150;

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
        style={[st.videoTile, { height: tileHeight, backgroundColor: mine ? 'rgba(0,0,0,0.28)' : '#0f172a' }]}
        onPress={() => setOpen(true)}
        disabled={sending}
        accessibilityLabel="Play video"
      >
        {thumb ? <Image source={thumb} style={StyleSheet.absoluteFill as never} contentFit="cover" /> : null}
        {thumbLoading ? (
          <View style={st.thumbSpinner} pointerEvents="none">
            <ActivityIndicator size="small" color="#fff" />
          </View>
        ) : null}
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

export function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const player = useVideoPlayer({ uri: url }, (p) => {
    p.loop = false;
    p.play();
  });
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={st.modalRoot}>
        <StatusBar hidden />
        {/* This modal already IS the full-screen player. The built-in fullscreen button (and
            picture-in-picture) would hand playback to a separate system screen, so the video
            would seem to leave the app — both are switched off, like WhatsApp's in-app viewer. */}
        <VideoView
          player={player}
          style={st.modalVideo}
          nativeControls
          contentFit="contain"
          fullscreenOptions={{ enable: false }}
          allowsPictureInPicture={false}
          startsPictureInPictureAutomatically={false}
        />
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
  wave: { height: 28, flexDirection: 'row', alignItems: 'center' },
  waveWrap: { height: 28, justifyContent: 'center' },
  waveClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  waveKnob: { position: 'absolute', left: 0, top: 8, width: 12, height: 12, borderRadius: 6 },
  waveBar: { flex: 1, minWidth: 2, maxWidth: 4, marginHorizontal: 0.75, borderRadius: 2 },
  speedChip: { minWidth: 38, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  photoUploading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
  thumbSpinner: { position: 'absolute', top: 8, right: 8 },
  speedText: { fontSize: 12, fontWeight: '800' },
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
