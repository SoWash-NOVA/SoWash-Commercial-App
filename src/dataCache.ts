// src/dataCache.ts
//
// In-memory, per-session cache behind useAsync's stale-while-revalidate: a screen
// you have already opened shows its last data instantly while the fresh copy loads
// underneath, instead of a blank spinner every time. Cleared on sign-in / sign-out /
// 401 so one account's data can never show for another.

const store = new Map<string, unknown>();

export const dataCache = {
  get<T>(key: string): T | undefined {
    return store.get(key) as T | undefined;
  },
  set(key: string, value: unknown) {
    store.set(key, value);
  },
  clear() {
    store.clear();
  },
};
