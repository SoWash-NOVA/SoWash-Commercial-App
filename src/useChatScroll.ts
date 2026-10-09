// src/useChatScroll.ts
//
// Opening a chat used to paint the OLDEST messages first and then visibly jump to the
// newest as the list measured itself. This hides the list (opacity 0) until the first
// scroll-to-end has landed, then shows it — so a chat opens already at the bottom.
// A fallback timer guarantees it is never left hidden.
//
// It also drives "scroll up for older": only the newest page loads on open, and
// reaching the top of the list asks the hook for the previous page. While older
// messages are being prepended the list must NOT auto-scroll to the end, or it would
// yank the reader back down — `hold()` suppresses that for a moment.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export function useChatScroll<T>(
  listRef: React.RefObject<FlatList<T> | null>,
  enabled = true,
  paging?: { hasMore: boolean; loadingOlder: boolean; loadOlder: () => unknown },
  /**
   * True once the list actually has rows (i.e. it is mounted). The settle/pin timers must start THEN,
   * not when the screen mounts: on a first open the screen shows a spinner while the network answers,
   * and the timers used to run out before the list ever existed — the 2nd open (cached, instant) worked.
   */
  ready = true,
) {
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const holdUntil = useRef(0);
  const mountedAt = useRef(0);
  // Paging only starts once the READER has dragged the list — a scroll event from our own
  // programmatic scrollToEnd (offset still near 0 mid-layout) must never count as "reached the top".
  const userDragged = useRef(false);
  // Keep the reader's place when older messages are prepended — but only once they have scrolled;
  // before that it could fight the initial scroll-to-end.
  const [keepPosition, setKeepPosition] = useState(false);

  useEffect(() => {
    if (!ready) return undefined;
    mountedAt.current = Date.now();
    const fallback = setTimeout(() => setRevealed(true), 500);
    // Belt and braces: re-pin to the newest message a few times while the list settles, unless the reader has scrolled.
    const pins = [250, 600, 1100, 1700].map((ms) =>
      setTimeout(() => {
        if (enabled && !userDragged.current) listRef.current?.scrollToEnd({ animated: false });
      }, ms),
    );
    return () => {
      pins.forEach(clearTimeout);
      clearTimeout(fallback);
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Is the reader looking at the newest messages? Updated from the scroll events. A size change must only pull
  // the list to the bottom if so — otherwise a voice note you are playing higher up (or any bubble that
  // re-measures) threw you to the end and the message slid out of view.
  const nearBottom = useRef(true);

  /** Call from onContentSizeChange. */
  const onContentSizeChange = useCallback(() => {
    if (!enabled) return;
    // For the first moments after opening, ALWAYS chase the end: photos/variable-height bubbles keep
    // growing the list as they lay out, and the newest message must stay in view until it settles.
    const settling = mountedAt.current > 0 && Date.now() - mountedAt.current < 1800;
    if (!settling && !nearBottom.current) return; // reading older messages — stay where the reader is
    if (!settling && Date.now() < holdUntil.current) return; // older messages are being prepended — stay where the reader is
    listRef.current?.scrollToEnd({ animated: false });
    if (!revealed) {
      if (timer.current) clearTimeout(timer.current);
      // let a couple of layout passes settle (bubbles are variable height), then show
      timer.current = setTimeout(() => {
        listRef.current?.scrollToEnd({ animated: false });
        setRevealed(true);
      }, 140);
    }
  }, [enabled, revealed, listRef]);

  /** Call from onScroll: near the top → fetch the previous page. */
  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      nearBottom.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 260;
      if (!paging || !revealed || !userDragged.current || !paging.hasMore || paging.loadingOlder) return;
      if (e.nativeEvent.contentOffset.y < 80) {
        holdUntil.current = Date.now() + 1500;
        paging.loadOlder();
      }
    },
    [paging, revealed],
  );

  const onScrollBeginDrag = useCallback(() => {
    userDragged.current = true;
    setKeepPosition(true);
  }, []);

  return { onContentSizeChange, onScroll, onScrollBeginDrag,
    maintainVisibleContentPosition: keepPosition ? { minIndexForVisible: 0 } : undefined, hiddenStyle: revealed ? null : { opacity: 0 } };
}
