// Pick a Team chat (DM or group, or a colleague to start a DM with) and run `onPick` for it.
// Shared by "send a contact" (ShareContactSheet) and "send a file" (app/files.tsx). Staff only — the screens that
// open it are not reachable from client accounts.
//
// Wrapped in KeyboardScreen so the search results stay above the keyboard.

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Search, Send, User, Users, X } from 'lucide-react-native';
import { palette } from '../theme';
import { errorMessage } from '../api/client';
import { startTeamDm, useStaffDirectory, useTeamConversations } from '../hooks';
import { useAuth } from '../auth/AuthContext';
import KeyboardScreen from './KeyboardScreen';

type Row = { key: string; title: string; sub: string; group: boolean; conversationId?: number; userId?: number };

export default function ChatTargetSheet({
  visible,
  title,
  subtitle,
  accent,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  accent: string;
  onClose: () => void;
  /** Do the sending for this conversation. Return the text for the "Sent" confirmation; throw to show an error. */
  onPick: (conversationId: number, conversationTitle: string) => Promise<string>;
}) {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const convs = useTeamConversations('');
  const dir = useStaffDirectory();

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const list = convs.data?.conversations ?? [];
    const out: Row[] = list
      .filter((c) => !needle || (c.name || '').toLowerCase().includes(needle))
      .map((c) => ({
        key: `c${c.id}`,
        title: c.name || (c.kind === 'group' ? 'Group' : 'Chat'),
        sub: c.kind === 'group' ? 'Group' : 'Direct message',
        group: c.kind === 'group',
        conversationId: c.id,
      }));
    // colleagues I have no DM with yet
    const haveDm = new Set(list.filter((c) => c.kind === 'dm').map((c) => c.other_participant_id));
    for (const u of dir.data?.users ?? []) {
      if (u.id === Number(user?.id) || haveDm.has(u.id)) continue;
      const name = u.name || u.email || `User ${u.id}`;
      if (needle && !name.toLowerCase().includes(needle)) continue;
      out.push({ key: `u${u.id}`, title: name, sub: 'Start a new direct message', group: false, userId: u.id });
    }
    return out;
  }, [convs.data, dir.data, q, user?.id]);

  const send = async (row: Row) => {
    if (sendingKey) return;
    setSendingKey(row.key);
    try {
      const id = row.conversationId ?? (await startTeamDm(row.userId as number)).id;
      const message = await onPick(id, row.title);
      setQ('');
      onClose();
      Alert.alert('Sent', message);
    } catch (err) {
      Alert.alert('Could not send', errorMessage(err));
    } finally {
      setSendingKey(null);
    }
  };

  const loading = (convs.loading && !convs.data) || (dir.loading && !dir.data);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardScreen style={sh.backdrop}>
        <View style={sh.sheet}>
          <View style={sh.head}>
            <View style={{ flex: 1 }}>
              <Text style={sh.title}>{title}</Text>
              {subtitle ? (
                <Text style={sh.sub} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <X size={22} color={palette.muted} />
            </TouchableOpacity>
          </View>
          <View style={sh.search}>
            <Search size={16} color={palette.muted} />
            <TextInput
              style={sh.input}
              value={q}
              onChangeText={setQ}
              placeholder="Search chats or people"
              placeholderTextColor={palette.mutedLight}
              autoCorrect={false}
            />
          </View>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 30 }} color={accent} />
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.key}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={sh.empty}>No chats found.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={sh.row} activeOpacity={0.8} onPress={() => send(item)} disabled={!!sendingKey}>
                  <View style={[sh.ico, { backgroundColor: `${accent}18` }]}>
                    {item.group ? <Users size={17} color={accent} /> : <User size={17} color={accent} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={sh.name} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={sh.rowSub}>{item.sub}</Text>
                  </View>
                  {sendingKey === item.key ? <ActivityIndicator color={accent} /> : <Send size={17} color={accent} />}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </KeyboardScreen>
    </Modal>
  );
}

const sh = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '88%',
    minHeight: 240,
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: palette.ink },
  sub: { fontSize: 13, color: palette.muted, marginTop: 2 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  input: { flex: 1, paddingVertical: 10, fontSize: 15, color: palette.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  ico: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: palette.ink },
  rowSub: { fontSize: 12, color: palette.muted, marginTop: 1 },
  empty: { textAlign: 'center', color: palette.muted, marginTop: 30 },
});
