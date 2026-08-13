// app/notifications.tsx
//
// The bell. Everything the customer has been told, newest first.
//
// Only two things land here: the crew starting work, and CI admin approving a
// finished visit. That is the whole list by design — a notification the
// customer cannot act on is noise, and this account belongs to a site manager
// with a day job.
//
// Opening the screen marks the feed read. That is the honest reading of the
// gesture: they came to look. It fires once on mount and is not repeated on
// pull-to-refresh, so a row that arrives WHILE the screen is open still shows
// as unread until they leave and come back.
//
// ⚠ Rows are rendered read-only in one case: tapping a `crew_started`
// notification the day after, before approval, lands on job/[id]'s "not
// available yet" state. That is deliberate — see notificationTarget() in
// src/hooks.ts for why swallowing the tap would be worse.

import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  BellOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  PlayCircle,
} from 'lucide-react-native';
import { styles, palette } from '../src/theme';
import { useAccent } from '../src/theme-context';
import {
  useNotifications,
  markNotificationsRead,
  notificationTarget,
  formatDateTime,
} from '../src/hooks';
import { AppNotification, NotificationType } from '../src/api/types';

/** Icon + tint per event. Mirrors the tone of statusMeta() in src/hooks.ts. */
function metaFor(type: NotificationType, accent: string) {
  if (type === 'crew_started') {
    return { Icon: PlayCircle, color: '#F59E0B', bg: '#F59E0B18' };
  }
  return { Icon: CheckCircle2, color: accent, bg: `${accent}18` };
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { accent } = useAccent();

  const { data, loading, error, refreshing, refresh } = useNotifications();

  const items = useMemo<AppNotification[]>(() => data?.notifications ?? [], [data]);

  // Mark read once, on the first load that actually returned something.
  // Guarded by a ref rather than a dep on `items`, or every background refresh
  // would re-fire it and the badge would fight the feed.
  const markedRef = useRef(false);
  useEffect(() => {
    if (markedRef.current) return;
    if (items.length === 0) return;
    if (!items.some((n) => !n.read_at)) return;

    markedRef.current = true;
    // Fire-and-forget: markNotificationsRead swallows its own failures, and a
    // failed read-receipt must never interrupt someone reading their feed.
    markNotificationsRead();
  }, [items]);

  const open = (n: AppNotification) => {
    const target = notificationTarget(n);
    if (target) router.push(target as never);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.stubHeader}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.stubBackBtn}
        >
          <ChevronLeft size={20} color={palette.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.stubTitle}>Notifications</Text>
      </View>

      {loading && !data ? (
        <View style={local.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : error && !data ? (
        <View style={local.centre}>
          <CircleAlert size={26} color={palette.mutedLight} />
          <Text style={local.emptyTitle}>Could not load</Text>
          <Text style={local.emptyBody}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={local.centre}>
          <BellOff size={26} color={palette.mutedLight} />
          <Text style={local.emptyTitle}>Nothing yet</Text>
          <Text style={local.emptyBody}>
            You will be notified when a crew starts work at one of your sites, and when a
            completed visit has been approved.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={local.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={accent} />
          }
          renderItem={({ item }) => {
            const { Icon, color, bg } = metaFor(item.type, accent);
            const unread = !item.read_at;

            return (
              <TouchableOpacity
                onPress={() => open(item)}
                activeOpacity={item.schedule_id ? 0.7 : 1}
                disabled={!item.schedule_id}
                style={[local.row, unread && { borderColor: `${accent}55` }]}
              >
                <View style={[local.iconBox, { backgroundColor: bg }]}>
                  <Icon size={18} color={color} />
                </View>

                <View style={local.body}>
                  <View style={local.titleRow}>
                    <Text style={local.title} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {unread ? <View style={[local.dot, { backgroundColor: accent }]} /> : null}
                  </View>

                  {item.body ? (
                    <Text style={local.text} numberOfLines={3}>
                      {item.body}
                    </Text>
                  ) : null}

                  <Text style={local.when}>{formatDateTime(item.created_at)}</Text>
                </View>

                {item.schedule_id ? (
                  <ChevronRight size={16} color={palette.mutedLight} />
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            data?.hasMore ? (
              <Text style={local.footer}>
                Showing your 50 most recent notifications.
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const local = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, marginTop: 4 },
  emptyBody: {
    fontSize: 13,
    color: palette.muted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 300,
  },

  list: { padding: 20, paddingBottom: 40, gap: 10 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: palette.ink },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12.5, color: palette.muted, lineHeight: 18 },
  when: { fontSize: 11, color: palette.mutedLight, fontWeight: '600', marginTop: 2 },

  footer: {
    fontSize: 11,
    color: palette.mutedLight,
    textAlign: 'center',
    paddingVertical: 16,
  },
});
