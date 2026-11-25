// app/job-chat/index.tsx
//
// All the visit chats I can see (client: my company's visits with messages; staff: every visit with messages).
// Tap one to open its room (app/job-chat/[id].tsx).

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import api, { errorMessage } from '../../src/api/client';
import { palette, styles } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import PageHeader from '../../src/components/PageHeader';

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

export default function JobChatList() {
  const router = useRouter();
  const { accent } = useAccent();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get('customer-portal/job-chat/rooms');
      setRooms(res.data.rooms || []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load the chats.'));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 15000);
      return () => clearInterval(t);
    }, [load]),
  );

  const who = (r: string) => (r === 'field' ? 'Supervisor' : r === 'customer' ? 'Client' : 'SoWash');

  return (
    <View style={styles.screen}>
      <PageHeader title="Visit chats" subtitle="Site supervisor ↔ client ↔ SoWash office" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      {rooms == null && !error ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
      ) : (
        <FlatList
          data={rooms || []}
          keyExtractor={(r) => String(r.schedule_id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />}
          ListEmptyComponent={<Text style={s.empty}>{error || 'No visit chats yet. They appear when the site supervisor writes about a visit.'}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} activeOpacity={0.8} onPress={() => router.push(`/job-chat/${item.schedule_id}` as never)}>
              <View style={{ flex: 1 }}>
                <Text style={s.site} numberOfLines={1}>{item.site_name}</Text>
                <Text style={s.meta} numberOfLines={1}>{item.client_name} · {item.scheduled_date}</Text>
                <Text style={s.last} numberOfLines={1}>
                  {item.last_message ? `${who(item.last_message.sender_role)}: ${item.last_message.preview}` : 'No messages yet'}
                </Text>
              </View>
              {item.unread > 0 ? (
                <View style={[s.badge, { backgroundColor: accent }]}><Text style={s.badgeTxt}>{item.unread > 99 ? '99+' : item.unread}</Text></View>
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

const s = StyleSheet.create({
  empty: { textAlign: 'center', color: palette.muted, marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  site: { fontSize: 15, fontWeight: '700', color: palette.ink },
  meta: { fontSize: 12, color: palette.muted, marginTop: 2 },
  last: { fontSize: 13, color: palette.inkSoft, marginTop: 6 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
