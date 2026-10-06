// src/components/JobActions.tsx
//
// Long-press a visit (Visits list, Overview's next-visit hero and "Coming up" rows) → a
// WhatsApp-style pop-up: the screen dims and blurs slightly, the visit is shown lifted as a
// card, and an action menu sits under it — "Attach in chat" (opens Support → General with
// the visit linked in the composer, see src/chat-attach.ts) and "View details".
//
// One <JobActionsHost/> lives in the client tab layout; anything can open it with
// openJobActions(job), so list rows need no extra wiring beyond onLongPress.

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronRight, MapPin, MessageSquarePlus, User } from 'lucide-react-native';
import type { JobSummary } from '../api/types';
import { palette } from '../theme';
import { formatDateOnly, relativeDay, statusMeta } from '../hooks';
import { requestChatAttach } from '../chat-attach';
import { tc } from '../themeEngine';

const BLUE = '#1C9BE0';

let openFn: ((job: JobSummary) => void) | null = null;

/** Open the pop-up for this visit (no-op if no host is mounted). */
export function openJobActions(job: JobSummary) {
  openFn?.(job);
}

export function JobActionsHost() {
  const router = useRouter();
  const [job, setJob] = useState<JobSummary | null>(null);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    openFn = (j) => {
      setJob(j);
      anim.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 200, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
    };
    return () => {
      openFn = null;
    };
  }, [anim]);

  const close = (after?: () => void) => {
    Animated.timing(anim, { toValue: 0, duration: 140, useNativeDriver: true }).start(() => {
      setJob(null);
      after?.();
    });
  };

  if (!job) return null;

  const meta = statusMeta(job.status);
  const when = relativeDay(job.scheduled_date);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={() => close()}>
      <Animated.View style={[local.backdrop, { opacity: anim }]}>
        <Pressable style={local.fill} onPress={() => close()} accessibilityLabel="Close" />
      </Animated.View>

      <View style={local.center} pointerEvents="box-none">
        <Animated.View style={{ width: '100%', maxWidth: 440, opacity: anim, transform: [{ scale }] }}>
          {/* the visit, lifted */}
          <View style={local.card}>
            <View style={local.cardTop}>
              <Text style={local.site} numberOfLines={2}>
                {job.site_name || 'Site'}
              </Text>
              <View style={[local.pill, { backgroundColor: tc(meta.bg) }]}>
                <View style={[local.dot, { backgroundColor: meta.color }]} />
                <Text style={[local.pillText, { color: meta.color }]}>{meta.label}</Text>
              </View>
            </View>
            <View style={local.metaRow}>
              <CalendarDays size={14} color={palette.muted} />
              <Text style={local.metaText}>
                {formatDateOnly(job.scheduled_date)}
                {when ? ` · ${when}` : ''}
                {job.service_number != null && String(job.service_number) !== '' ? ` · Service #${job.service_number}` : ''}
              </Text>
            </View>
            {job.address || job.city ? (
              <View style={local.metaRow}>
                <MapPin size={14} color={palette.muted} />
                <Text style={local.metaText} numberOfLines={1}>
                  {[job.address, job.city].filter(Boolean).join(', ')}
                </Text>
              </View>
            ) : null}
            {job.team_lead_name ? (
              <View style={local.metaRow}>
                <User size={14} color={palette.muted} />
                <Text style={local.metaText}>Team lead · {job.team_lead_name}</Text>
              </View>
            ) : null}
          </View>

          {/* the menu */}
          <View style={local.menu}>
            <TouchableOpacity
              style={local.item}
              activeOpacity={0.8}
              onPress={() =>
                close(() => {
                  requestChatAttach(job);
                  router.push('/support');
                })
              }
              accessibilityLabel="Attach in chat"
            >
              <View style={[local.itemIcon, { backgroundColor: BLUE }]}>
                <MessageSquarePlus size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={local.itemTitle}>Attach in chat</Text>
                <Text style={local.itemSub}>Message SoWash about this visit</Text>
              </View>
              <ChevronRight size={17} color={palette.mutedLight} />
            </TouchableOpacity>
            <View style={local.sep} />
            <TouchableOpacity
              style={local.item}
              activeOpacity={0.8}
              onPress={() => close(() => router.push(`/job/${job.schedule_id}`))}
              accessibilityLabel="View details"
            >
              <View style={[local.itemIcon, { backgroundColor: tc('#E6F5FD') }]}>
                <CalendarDays size={18} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={local.itemTitle}>View details</Text>
                <Text style={local.itemSub}>Photos, progress and the crew’s report</Text>
              </View>
              <ChevronRight size={17} color={palette.mutedLight} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const SHADOW = {
  shadowColor: '#000',
  shadowOpacity: 0.25,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 12 },
  elevation: 14,
};

const local = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,14,24,0.55)' },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },

  card: { backgroundColor: '#fff', borderRadius: 22, padding: 18, gap: 8, ...SHADOW },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 2 },
  site: { flex: 1, fontSize: 18, fontWeight: '900', color: palette.ink },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { flex: 1, fontSize: 13, fontWeight: '600', color: palette.muted },

  menu: { marginTop: 12, backgroundColor: '#fff', borderRadius: 20, paddingVertical: 4, ...SHADOW },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  itemIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  itemSub: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 1 },
  sep: { height: 1, backgroundColor: '#EEF3F7', marginHorizontal: 14 },
});
