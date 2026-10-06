// src/chat-attach.ts
//
// "Attach this visit in chat": a one-shot hand-off from wherever a visit was long-pressed
// (Visits list, Overview — see src/components/JobActions.tsx) to the client Support tab.
// The Support tab stays mounted, so it subscribes here; when a request arrives it opens the
// General conversation with that visit already tagged in the composer (the same visit tag
// the composer's calendar picker sets — the message is sent with its schedule_id).

import { useEffect, useState } from 'react';
import type { JobSummary } from './api/types';

let pending: JobSummary | null = null;
let seq = 0;
const listeners = new Set<(n: number) => void>();

/** Ask the Support tab to open General with this visit attached. */
export function requestChatAttach(job: JobSummary) {
  pending = job;
  seq += 1;
  listeners.forEach((l) => l(seq));
}

/** Take (and clear) the pending request. */
export function takeChatAttach(): JobSummary | null {
  const j = pending;
  pending = null;
  return j;
}

/** A counter that changes on every new request (0 = none yet) — react to it, then call takeChatAttach(). */
export function useChatAttachRequest(): number {
  const [n, setN] = useState(pending ? seq : 0);
  useEffect(() => {
    const l = (v: number) => setN(v);
    listeners.add(l);
    if (pending) setN(seq);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return n;
}
