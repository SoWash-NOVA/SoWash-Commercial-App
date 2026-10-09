// src/chat-media.ts
//
// What a chat attachment IS, decided from its file name — the backend stores every
// attachment in the same attachment_url / attachment_name columns (photos, voice
// notes, videos), so there is no `kind` field. The apps name recordings
// voice-<seconds>.m4a and video-<seconds>.mp4, which also carries the duration.

export type ChatMediaKind = 'image' | 'audio' | 'video';

export const VIDEO_RETENTION_DAYS = 30;
export const MAX_VIDEO_SECONDS = 30;
export const MAX_VOICE_SECONDS = 5 * 60;

const AUDIO_EXT = /\.(m4a|aac|mp3|ogg|opus|wav)$/i;
const VIDEO_EXT = /\.(mp4|mov|webm)$/i;

export function mediaKind(urlOrName: string | null | undefined): ChatMediaKind {
  const clean = (urlOrName ?? '').split('?')[0];
  if (AUDIO_EXT.test(clean)) return 'audio';
  if (VIDEO_EXT.test(clean)) return 'video';
  return 'image';
}

/**
 * Seconds encoded in a file name like voice-12.m4a / voice-12-0a4f….m4a / video-9.mp4, or null.
 * (A voice note's name can also carry its waveform — see waveFromName.)
 */
export function durationFromName(name: string | null | undefined): number | null {
  const m = /^(?:voice|video)-(\d+)(?:-[0-9a-f]+)?\./i.exec(name ?? '');
  return m ? Number(m[1]) : null;
}

/** Number of bars drawn for a voice note. */
export const WAVE_BARS = 32;

/**
 * The loudness bars recorded with a voice note, 0..1 each: the app puts them in the file name as one hex digit per
 * bar (voice-12-0a4f….m4a, 0 = silent, f = loudest) — the server just stores the name, so no schema change.
 * Returns null for notes without it (older ones).
 */
export function waveFromName(name: string | null | undefined): number[] | null {
  const m = /^voice-\d+-([0-9a-f]{8,})\./i.exec(name ?? '');
  if (!m) return null;
  return m[1].split('').map((c) => parseInt(c, 16) / 15);
}

/** Dummy-but-stable bars for notes that carry no waveform (same note → same picture every time). */
export function fallbackWave(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const out: number[] = [];
  for (let i = 0; i < WAVE_BARS; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    out.push(0.25 + (((h >>> 0) % 1000) / 1000) * 0.6);
  }
  return out;
}

/** Turn dB meter samples (-160..0) into WAVE_BARS hex digits for the file name. */
export function waveToHex(samplesDb: number[]): string {
  if (samplesDb.length === 0) return '';
  let out = '';
  for (let i = 0; i < WAVE_BARS; i++) {
    // each bar = the loudest sample in its slice of the recording
    const from = Math.floor((i * samplesDb.length) / WAVE_BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samplesDb.length) / WAVE_BARS));
    let peak = -160;
    for (let j = from; j < Math.min(to, samplesDb.length); j++) peak = Math.max(peak, samplesDb[j]);
    // speech sits around -45..-5 dB; anything quieter than -50 is "silent"
    const level = Math.round(Math.min(1, Math.max(0, (peak + 50) / 50)) * 15);
    out += level.toString(16);
  }
  return out;
}

/** The server deletes chat videos 30 days after upload; the message row stays. */
export function videoExpired(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > VIDEO_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

/** 0:07 / 1:32 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Short text for reply quotes / previews of an attachment-only message. */
export function attachmentLabel(urlOrName: string | null | undefined): string {
  const kind = mediaKind(urlOrName);
  return kind === 'audio' ? '🎤 Voice message' : kind === 'video' ? '🎥 Video' : '📷 Photo';
}
