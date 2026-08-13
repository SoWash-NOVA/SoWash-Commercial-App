// app/(tabs)/support.tsx
//
// Support. One conversation with SoWash, for the whole account.
//
// There is NO inbox on this side, unlike the staff console. The customer only
// ever talks to one party, so an inbox listing a single row would be a screen
// standing between them and the thing they came for. Every site manager on the
// account shares this conversation and each message shows who sent it.
//
// A message can be tagged to a visit. The picker offers only visits the
// account can actually open — the backend re-checks the same predicate, so a
// tag can never produce a chip that goes nowhere.

import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  CalendarDays,
  CircleAlert,
  ImagePlus,
  MessagesSquare,
  Send,
  X,
} from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { photoUrl } from '../../src/api/client';
import { useChat, useJobs, formatDateOnly, formatTime, ChatPhotoInput } from '../../src/hooks';
import { ChatMessage } from '../../src/api/types';

export default function SupportScreen() {
  const { accent } = useAccent();
  const { messages, loading, error, sending, send } = useChat();

  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<ChatPhotoInput | null>(null);
  const [tagId, setTagId] = useState<number | null>(null);
  const [tagOpen, setTagOpen] = useState(false);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Only what the account can open. Same set the backend will accept.
  const visits = useJobs({ scope: 'all', limit: 20 });
  const visitList = useMemo(() => visits.data?.jobs ?? [], [visits.data]);
  const taggedVisit = useMemo(
    () => visitList.find((v) => v.schedule_id === tagId) ?? null,
    [visitList, tagId],
  );

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setPhoto({
      uri: asset.uri,
      name: asset.fileName ?? 'photo.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  };

  const onSend = async () => {
    const ok = await send({ body: draft, photo, scheduleId: tagId });
    if (!ok) return;
    setDraft('');
    setPhoto(null);
    setTagId(null);
    // Layout has not settled on the new row yet, hence the frame delay.
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const canSend = (draft.trim().length > 0 || !!photo) && !sending;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={styles.stubHeader}>
        <Text style={styles.stubTitle}>Support</Text>
      </View>

      {loading && messages.length === 0 ? (
        <View style={local.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : error && messages.length === 0 ? (
        <View style={local.centre}>
          <CircleAlert size={26} color={palette.mutedLight} />
          <Text style={local.emptyTitle}>Could not load</Text>
          <Text style={local.emptyBody}>{error}</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={local.centre}>
          <MessagesSquare size={26} color={palette.mutedLight} />
          <Text style={local.emptyTitle}>Talk to SoWash</Text>
          <Text style={local.emptyBody}>
            Ask about a visit, report an issue at a site, or send a photo. Messages reach the
            C&amp;I team directly.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={local.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => <Bubble message={item} accent={accent} />}
        />
      )}

      {/* ── Composer ─────────────────────────────────────────────── */}
      <View style={local.composer}>
        {error && messages.length > 0 ? (
          <Text style={local.sendError}>{error}</Text>
        ) : null}

        {(photo || taggedVisit) ? (
          <View style={local.attachRow}>
            {photo ? (
              <View style={local.attachChip}>
                <Image source={{ uri: photo.uri }} style={local.attachThumb} />
                <Text style={local.attachText} numberOfLines={1}>
                  {photo.name || 'Photo'}
                </Text>
                <TouchableOpacity onPress={() => setPhoto(null)} hitSlop={8}>
                  <X size={14} color={palette.muted} />
                </TouchableOpacity>
              </View>
            ) : null}

            {taggedVisit ? (
              <View style={local.attachChip}>
                <CalendarDays size={13} color={accent} />
                <Text style={local.attachText} numberOfLines={1}>
                  {taggedVisit.site_name} · {formatDateOnly(taggedVisit.scheduled_date)}
                </Text>
                <TouchableOpacity onPress={() => setTagId(null)} hitSlop={8}>
                  <X size={14} color={palette.muted} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={local.inputRow}>
          <TouchableOpacity onPress={pickPhoto} style={local.iconBtn} hitSlop={6}>
            <ImagePlus size={19} color={palette.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setTagOpen(true)}
            style={local.iconBtn}
            hitSlop={6}
            disabled={visitList.length === 0}
          >
            <CalendarDays
              size={19}
              color={visitList.length === 0 ? palette.border : (tagId ? accent : palette.muted)}
            />
          </TouchableOpacity>

          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Message SoWash…"
            placeholderTextColor={palette.mutedLight}
            style={local.input}
            multiline
          />

          <TouchableOpacity
            onPress={onSend}
            disabled={!canSend}
            style={[local.sendBtn, { backgroundColor: canSend ? accent : palette.border }]}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={17} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Visit tag picker ─────────────────────────────────────── */}
      <Modal visible={tagOpen} transparent animationType="slide" onRequestClose={() => setTagOpen(false)}>
        <Pressable style={local.sheetWrap} onPress={() => setTagOpen(false)}>
          <Pressable style={local.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={local.sheetTitle}>Tag a visit</Text>
            <Text style={local.sheetSub}>
              Attach this message to a specific visit so the team knows what it is about.
            </Text>

            <FlatList
              data={visitList}
              keyExtractor={(v) => String(v.schedule_id)}
              style={{ maxHeight: 340 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={local.sheetRow}
                  onPress={() => {
                    setTagId(item.schedule_id);
                    setTagOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={local.sheetRowTitle} numberOfLines={1}>
                      {item.site_name || 'Site'}
                    </Text>
                    <Text style={local.sheetRowSub}>
                      {formatDateOnly(item.scheduled_date)} · {item.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity style={local.sheetCancel} onPress={() => setTagOpen(false)}>
              <Text style={local.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, accent }: { message: ChatMessage; accent: string }) {
  const mine = message.sender_kind === 'customer';
  const url = photoUrl(message.attachment_url);

  return (
    <View style={[local.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          local.bubble,
          mine
            ? { backgroundColor: accent, borderTopRightRadius: 4 }
            : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderTopLeftRadius: 4 },
        ]}
      >
        {!mine && message.sender_name ? (
          <Text style={[local.sender, { color: accent }]}>{message.sender_name}</Text>
        ) : null}

        {message.visit ? (
          <View style={[local.visitChip, mine ? local.visitChipMine : null]}>
            <Text style={[local.visitChipText, mine ? { color: '#ffffffcc' } : null]} numberOfLines={1}>
              {message.visit.site_name} · {formatDateOnly(message.visit.scheduled_date)}
            </Text>
          </View>
        ) : null}

        {url ? <Image source={{ uri: url }} style={local.photo} resizeMode="cover" /> : null}

        {message.body ? (
          <Text style={[local.text, mine ? { color: '#fff' } : { color: palette.ink }]}>
            {message.body}
          </Text>
        ) : null}

        <Text style={[local.time, mine ? { color: '#ffffffaa' } : { color: palette.mutedLight }]}>
          {formatTime(message.created_at)}
        </Text>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink, marginTop: 4 },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 19, maxWidth: 300 },

  list: { padding: 16, paddingBottom: 8, gap: 8 },

  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '82%', borderRadius: 18, padding: 11 },
  sender: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  text: { fontSize: 14, lineHeight: 20 },
  time: { fontSize: 10.5, fontWeight: '600', marginTop: 4, alignSelf: 'flex-end' },
  photo: { width: 200, height: 150, borderRadius: 12, marginBottom: 6 },
  visitChip: {
    backgroundColor: palette.borderSubtle,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  visitChipMine: { backgroundColor: '#ffffff2e' },
  visitChipText: { fontSize: 11, fontWeight: '700', color: palette.muted },

  composer: {
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  sendError: { fontSize: 12, color: palette.danger, marginBottom: 6, paddingHorizontal: 4 },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: palette.bg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 220,
  },
  attachThumb: { width: 20, height: 20, borderRadius: 5 },
  attachText: { flex: 1, fontSize: 11.5, color: palette.inkSoft, fontWeight: '600' },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  iconBtn: { paddingBottom: 9 },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 40,
    backgroundColor: palette.bg,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: palette.ink,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  sheetWrap: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 28,
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: palette.ink },
  sheetSub: { fontSize: 12.5, color: palette.muted, marginTop: 4, marginBottom: 12, lineHeight: 18 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  sheetRowTitle: { fontSize: 14, fontWeight: '700', color: palette.ink },
  sheetRowSub: { fontSize: 12, color: palette.muted, marginTop: 2 },
  sheetCancel: { marginTop: 14, alignItems: 'center', paddingVertical: 12 },
  sheetCancelText: { fontSize: 14, fontWeight: '700', color: palette.muted },
});
