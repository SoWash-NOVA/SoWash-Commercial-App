// src/teamChatSocket.ts
//
// WebSocket client for internal staff chat's real-time fan-out
// (sowash-backend services/staffChatSocket.js). Uses React Native's built-in
// global WebSocket — no client library needed, and the backend has no other
// socket dependency either, so there is nothing socket.io-shaped to match.
//
// ⚠ Whether this ever connects at all depends on the VPS's reverse proxy
// passing through the Upgrade/Connection headers for /ws/staff-chat, which
// was unconfirmed at the time this was written (no nginx config exists in
// either repo to check). That is why every hook built on this
// (useTeamConversation, useTeamUnread in src/hooks.ts) keeps polling
// underneath regardless of connection state — a dead or never-connecting
// socket must degrade to exactly today's polling experience, not silence.
// This module's own job is only to reconnect with backoff and hand off
// whatever arrives; it is never a hard dependency for anything else.
//
// Started/stopped from app/staff/_layout.tsx (staff-only scope) rather than
// the root layout — this is an internal-staff-only feature with nothing to
// connect for a client session.

import { SERVER_BASE, getToken } from './api/client';
import { TeamMessage } from './api/types';

export type TeamSocketEvent =
  | { type: 'staff_message'; conversation_id: number; message: TeamMessage }
  | { type: 'read_receipt'; conversation_id: number; user_id: number; last_read_at: string | null }
  | { type: 'typing'; conversation_id: number; user_id: number }
  | { type: 'stop_typing'; conversation_id: number; user_id: number }
  /** A repeated "you were mentioned and still haven't opened this" ping from services/staffMentionReminders.js — TeamList already refetches on any socket event, so this exists mainly so useTeamConversation's own listener can name it instead of falling through to the read_receipt branch. */
  | { type: 'mention_reminder'; conversation_id: number; message_id: number }
  | { type: 'message_deleted'; conversation_id: number; message_id: number }
  /** emoji null = the reaction was removed. */
  | { type: 'reaction'; conversation_id: number; message_id: number; user_id: number; emoji: string | null };

type Listener = (event: TeamSocketEvent) => void;

const listeners = new Set<Listener>();

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = 2000;
const MAX_RECONNECT_DELAY_MS = 30_000;
let wanted = false;

function wsUrl(token: string): string {
  // SERVER_BASE is a bare https origin (see api/client.ts) — swap the scheme,
  // nothing else about the URL changes.
  const base = SERVER_BASE.replace(/^http/, 'ws');
  return `${base}/ws/staff-chat?token=${encodeURIComponent(token)}`;
}

function scheduleReconnect() {
  if (!wanted || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelayMs);
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
}

async function connect() {
  if (!wanted) return;

  const token = await getToken();
  if (!token) {
    scheduleReconnect();
    return;
  }

  try {
    socket = new WebSocket(wsUrl(token));
  } catch {
    socket = null;
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    reconnectDelayMs = 2000;
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as TeamSocketEvent;
      listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch {
          // One bad subscriber must not stop the others.
        }
      });
    } catch {
      // Malformed frame — ignore it, the next poll will still catch up.
    }
  };

  socket.onerror = () => {
    // onclose fires right after this and handles reconnect.
  };

  socket.onclose = () => {
    socket = null;
    scheduleReconnect();
  };
}

/** Call once when a staff session becomes active. Idempotent. */
export function startTeamSocket(): void {
  if (wanted) return;
  wanted = true;
  reconnectDelayMs = 2000;
  connect();
}

/** Call on sign-out or when leaving staff mode. */
export function stopTeamSocket(): void {
  wanted = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function subscribeTeamSocket(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Fire-and-forget typing ping — the one thing this client ever sends over
 * the socket (everything else here is receive-only). `recipientIds` is
 * this conversation's own participant list (minus the caller), already
 * held by whoever calls this (useTeamConversation in src/hooks.ts) from
 * the same GET /conversations/:id response the thread itself renders from
 * — see services/staffChatSocket.js's own comment for why the server
 * trusts this list instead of querying for it.
 *
 * Silently does nothing when the socket isn't connected — exactly like a
 * dead/reconnecting socket degrades everywhere else in this module: no
 * polling fallback exists for this one signal (there's nothing to poll for
 * "is someone typing right now"), so the indicator simply doesn't show,
 * which is the correct degrade for a nice-to-have.
 */
export function sendTyping(conversationId: number, recipientIds: number[], isTyping: boolean): void {
  if (!socket || socket.readyState !== socket.OPEN || recipientIds.length === 0) return;
  try {
    socket.send(
      JSON.stringify({
        type: isTyping ? 'typing' : 'stop_typing',
        conversation_id: conversationId,
        recipient_ids: recipientIds,
      }),
    );
  } catch {
    // Best-effort only.
  }
}
