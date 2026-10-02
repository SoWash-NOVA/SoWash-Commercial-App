// src/chat-focus.ts
//
// "A chat is open" — shared between the screens that open chats (Support, Team,
// the client's Support tab) and the two tab bars. While a chat is open:
//   • the floating tab bar is hidden, so the conversation gets the full height;
//   • the Android back button closes the chat (back to the list, still in the
//     chat section) instead of leaving for the previous tab / Overview.
// Tab screens stay mounted when you switch tabs, so a counter (not a boolean)
// keeps this right if two chat surfaces ever overlap.

import { useEffect, useSyncExternalStore } from 'react';
import { BackHandler } from 'react-native';

let openCount = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** True while any chat surface is open — tab bars render nothing then. */
export function useChatOpen(): boolean {
  return useSyncExternalStore(subscribe, () => openCount > 0, () => false);
}

/**
 * Call from a screen that can show a chat. `active` = a chat is currently open there;
 * `close` returns to that screen's own list.
 */
export function useChatSurface(active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return undefined;
    openCount += 1;
    emit();
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => {
      sub.remove();
      openCount = Math.max(0, openCount - 1);
      emit();
    };
    // `close` is a fresh closure each render; only (de)activation should re-register.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
