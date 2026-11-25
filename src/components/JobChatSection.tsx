// src/components/JobChatSection.tsx
//
// "Visits" section of the chat area — the visit chats (site supervisor <-> client <-> SoWash office) shown INSIDE the
// Support / Chats screens instead of a separate page. Used by:
//   • staff  app/staff/chats.tsx    → third switch "Support | Team | Visits"  (header = the Chats header with the switch)
//   • client app/(tabs)/support.tsx → "Visit chats" row in the Support list   (header = a back bar)
// List <-> room are switched in place (no route change), like Support's inbox -> thread. While a room is open the tab
// bar is hidden and Android back returns to the list (useChatSurface). The room itself is JobChatRoom (the same
// component the /job-chat/[id] route uses, which push notifications still open).

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import api, { errorMessage } from '../api/client';
import { palette } from '../theme';
import { useAccent } from '../theme-context';
import { useChatSurface } from '../chat-focus';
import ChatHeaderBar from './ChatHeaderBar';
import JobChatRoom, { RoomHeader } from './JobChatRoom';

interface Room {
  schedule_id: number;
  scheduled_date: string;
  status: string;
  site_name: string;
  client_name: string;
  team_lead_name: string | null;
  unread: number;
  last_message: { sender_role: string; preview: string; created_at: string } | null;
}

const who = (r: string) => (r === 'field' ? 'Supervisor' : r === 'customer' ? 'Client' : 'SoWash');

export default function JobChatSection({
  header,
  emptyText,
  initialRoom = null,
}: {
  /** Rendered above the list (the screen's own header: Chats switch for staff, back bar for the client). */
  header: React.ReactNode;
  emptyText?: string;
  initialRoom?: number | null;
}) {
  const { accent } = useAccent();
  const [roomId, setRoomId] = useState<number | null>(initialRoom);
  const [roomHeader, setRoomHeader] = useState<RoomHeader | null>(null);
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useChatSurface(roomId != null, () => setRoomId(null));

  const load = useCallback(async () => {
    try {
      const res = await api.get('customer-portal/job-chat/rooms');
      setRooms(res.data.rooms || []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load the visit chats.'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (roomId != null) return undefined;
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }, [load, roomId]),
  );

  if (roomId != null) {
    return (
      <View style={s.screen}>
        <ChatHeaderBar style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 12 }}>
          <TouchableOpacity
            onPress={() => { setRoomId(null); setRoomHeader(null); }}
            hitSlop={10}
            style={{ padding: 4 }}
            accessibilityLabel="Back"
          >
            <ChevronLeft size={26} color="#fff" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.roomTitle} numberOfLines={1}>{roomHeader?.site_name || 'Visit chat'}</Text>
            {roomHeader ? (
              <Text style={s.roomSub} numberOfLines={1}>
                {roomHeader.client_name} · {roomHeader.scheduled_date}
                {roomHeader.team_lead_name ? ` · Supervisor ${roomHeader.team_lead_name}` : ''}
              </Text>
            ) : null}
          </View>
        </ChatHeaderBar>
        <JobChatRoom scheduleId={roomId} onHeader={setRoomHeader} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      {header}
      {rooms == null && !error ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
      ) : (
        <FlatList
          data={rooms || []}
          keyExtractor={(r) => String(r.schedule_id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />
          }
          ListEmptyComponent={
            <Text style={s.empty}>
              {error || emptyText || 'No visit chats yet. They appear when the site supervisor or the client writes about a visit.'}
            </Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.card, item.unread > 0 && { borderColor: accent, borderWidth: 1.5 }]}
              activeOpacity={0.8}
              onPress={() => setRoomId(item.schedule_id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.site} numberOfLines={1}>{item.site_name}</Text>
                <Text style={s.meta} numberOfLines={1}>
                  {item.client_name} · {item.scheduled_date}
                  {item.team_lead_name ? ` · ${item.team_lead_name}` : ''}
                </Text>
                <Text style={[s.last, item.unread > 0 && { color: palette.ink, fontWeight: '800' }]} numberOfLines={1}>
                  {item.last_message ? `${who(item.last_message.sender_role)}: ${item.last_message.preview}` : 'No messages yet'}
                </Text>
              </View>
              {item.unread > 0 ? (
                <View style={[s.badge, { backgroundColor: accent }]}>
                  <Text style={s.badgeTxt}>{item.unread > 99 ? '99+' : item.unread}</Text>
                </View>
              ) : (
                <ChevronRight size={18} color={palette.mutedLight} />
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

/** Back bar used as the `header` of the client's Visit chats list. */
export function JobChatBackBar({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <ChatHeaderBar rounded style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 18 }}>
      <TouchableOpacity onPress={onBack} hitSlop={10} style={{ padding: 4 }} accessibilityLabel="Back">
        <ChevronLeft size={26} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.roomTitle}>{title}</Text>
        {subtitle ? <Text style={s.roomSub}>{subtitle}</Text> : null}
      </View>
    </ChatHeaderBar>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  roomTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  roomSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  empty: { textAlign: 'center', color: palette.muted, marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  site: { fontSize: 15, fontWeight: '700', color: palette.ink },
  meta: { fontSize: 12, color: palette.muted, marginTop: 2 },
  last: { fontSize: 13, color: palette.inkSoft, marginTop: 6 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
