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

/** Seconds encoded in a file name like voice-12.m4a / video-9.mp4, or null. */
export function durationFromName(name: string | null | undefined): number | null {
  const m = /^(?:voice|video)-(\d+)\./i.exec(name ?? '');
  return m ? Number(m[1]) : null;
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
