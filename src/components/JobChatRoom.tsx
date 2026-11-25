// src/components/JobChatRoom.tsx
//
// JOB CHAT room for ONE visit — shared by the client's and the office's identities (route app/job-chat/[id].tsx).
// The other end is the field supervisor's SoWash FO app (app/drawer/JobChat.tsx there). Backend:
// sowash-backend/routes/jobChatRoutes.js, mounted at /api/customer-portal/job-chat; the server decides who may
// read/write (client of the visit, office staff, the visit's team lead) — this component just renders the room.
//
// Text, photo and voice (hold the mic, like the support chat). New messages arrive by a 5 s poll while the screen
// is open. Sending is optimistic with tap-to-retry; client_msg_id makes a retried send idempotent on the server.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { Bell, Camera, Send, X } from 'lucide-react-native';
import api, { errorMessage, photoUrl } from '../api/client';
import { palette } from '../theme';
import { useAccent } from '../theme-context';
import { ChatPhotoInput, refreshChatUnreadNow } from '../hooks';
import { mediaKind } from '../chat-media';
import { useVoiceHold, VoiceMicButton, VoiceRecordingBar } from '../voiceRecorder';
import { pickChatPhoto } from '../photoPicker';
import ChatAttachment from './ChatAttachment';
import KeyboardScreen from './KeyboardScreen';

const BASE = 'customer-portal/job-chat';
const POLL_MS = 5000;

type Role = 'field' | 'customer' | 'staff';
interface Msg {
  id: number | string;
  sender_role: Role;
  sender_user_id: number | null;
  sender_name: string | null;
  body: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  reply_to?: { sender_name: string | null; body: string | null; has_attachment: boolean } | null;
  created_at: string;
  local?: { status: 'sending' | 'failed'; file?: ChatPhotoInput; clientMsgId: string };
}
type Row = { key: string; sep?: string; msg?: Msg };

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
const fmtTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });
  } catch {
    return '';
  }
};
const fmtDay = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Karachi' });
  } catch {
    return '';
  }
};
const sortById = (a: Msg, b: Msg) => (typeof a.id === 'number' && typeof b.id === 'number' ? a.id - b.id : 0);

export interface RoomHeader {
  site_name: string;
  client_name: string;
  scheduled_date: string;
  team_lead_name: string | null;
}

export default function JobChatRoom({
  scheduleId,
  onHeader,
}: {
  scheduleId: number;
  onHeader?: (h: RoomHeader) => void;
}) {
  const { accent } = useAccent();
  const [myId, setMyId] = useState<number | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [canPost, setCanPost] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  const listRef = useRef<FlatList<Row>>(null);
  const lastIdRef = useRef(0);
  const nearBottomRef = useRef(true);
  const focusedRef = useRef(true);

  const markRead = useCallback(() => {
    api.post(`${BASE}/${scheduleId}/read`).then(refreshChatUnreadNow).catch(() => {});
  }, [scheduleId]);

  const merge = useCallback((incoming: Msg[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const have = new Set(prev.filter((m) => !m.local).map((m) => String(m.id)));
      const fresh = incoming.filter((m) => !have.has(String(m.id)));
      const locals = prev.filter((m) => m.local && !incoming.some((n: any) => n.client_msg_id && n.client_msg_id === m.local!.clientMsgId));
      return [...prev.filter((m) => !m.local), ...fresh].sort(sortById).concat(locals);
    });
    const maxId = Math.max(...incoming.map((m) => Number(m.id)));
    if (maxId > lastIdRef.current) lastIdRef.current = maxId;
  }, []);

  const initial = useCallback(async () => {
    try {
      const [h, m] = await Promise.all([
        api.get(`${BASE}/${scheduleId}`),
        api.get(`${BASE}/${scheduleId}/messages`, { params: { limit: 80 } }),
      ]);
      setMyId(h.data.my_user_id);
      setMyRole(h.data.my_role);
      setCanPost(!!h.data.can_post);
      onHeader?.(h.data.room);
      const list: Msg[] = m.data.messages || [];
      setMessages(list);
      lastIdRef.current = list.reduce((mx, x) => Math.max(mx, Number(x.id)), 0);
      setLoadError(null);
      markRead();
    } catch (e) {
      setLoadError(errorMessage(e, 'Could not open this chat.'));
    } finally {
      setLoading(false);
    }
  }, [scheduleId, markRead, onHeader]);

  const poll = useCallback(async () => {
    if (!focusedRef.current) return;
    try {
      const res = await api.get(`${BASE}/${scheduleId}/messages`, { params: { after_id: lastIdRef.current } });
      const list: Msg[] = res.data.messages || [];
      if (list.length) {
        merge(list);
        markRead();
      }
    } catch {
      /* offline: keep what is on screen */
    }
  }, [scheduleId, merge, markRead]);

  useEffect(() => {
    initial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      const t = setInterval(poll, POLL_MS);
      return () => {
        focusedRef.current = false;
        clearInterval(t);
      };
    }, [poll]),
  );

  // ── sending ──
  const deliver = useCallback(
    async (clientMsgId: string, body: string | null, file: ChatPhotoInput | undefined, reply: Msg | null) => {
      try {
        const form = new FormData();
        if (body) form.append('body', body);
        form.append('client_msg_id', clientMsgId);
        if (reply && typeof reply.id === 'number') form.append('reply_to_id', String(reply.id));
        if (file) {
          form.append('photo', {
            uri: file.uri,
            name: file.name || (mediaKind(file.uri) === 'audio' ? 'voice.m4a' : 'photo.jpg'),
            type: file.mimeType || (mediaKind(file.name || file.uri) === 'audio' ? 'audio/mp4' : 'image/jpeg'),
          } as never);
        }
        const res = await api.post(`${BASE}/${scheduleId}/messages`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        });
        const saved: Msg = res.data.message;
        setMessages((prev) =>
          [...prev.filter((m) => m.local?.clientMsgId !== clientMsgId && String(m.id) !== String(saved.id)), saved].sort(sortById),
        );
        if (Number(saved.id) > lastIdRef.current) lastIdRef.current = Number(saved.id);
      } catch (e: any) {
        const status = e?.response?.status;
        if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
          setMessages((prev) => prev.filter((m) => m.local?.clientMsgId !== clientMsgId));
          Alert.alert('Not sent', errorMessage(e, 'This message could not be sent.'));
          return;
        }
        setMessages((prev) =>
          prev.map((m) => (m.local?.clientMsgId === clientMsgId ? { ...m, local: { ...m.local!, status: 'failed' } } : m)),
        );
      }
    },
    [scheduleId],
  );

  const send = useCallback(
    (body: string | null, file?: ChatPhotoInput) => {
      if (!canPost) return Alert.alert('Chat closed', 'This visit chat is closed for new messages.');
      if (!body && !file) return;
      const clientMsgId = uuid();
      const reply = replyTo;
      const local: Msg = {
        id: `local-${clientMsgId}`,
        sender_role: myRole || 'customer',
        sender_user_id: myId,
        sender_name: null,
        body,
        attachment_url: null,
        attachment_name: file?.name || null,
        reply_to: reply ? { sender_name: reply.sender_name, body: reply.body, has_attachment: !!reply.attachment_url } : null,
        created_at: new Date().toISOString(),
        local: { status: 'sending', file, clientMsgId },
      };
      nearBottomRef.current = true;
      setMessages((prev) => [...prev, local]);
      setReplyTo(null);
      deliver(clientMsgId, body, file, reply);
    },
    [canPost, myRole, myId, replyTo, deliver],
  );

  const retry = (m: Msg) => {
    if (!m.local) return;
    setMessages((prev) => prev.map((x) => (x === m ? { ...x, local: { ...x.local!, status: 'sending' } } : x)));
    deliver(m.local.clientMsgId, m.body, m.local.file, null);
  };

  const sendText = () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    send(t);
  };

  const voice = useVoiceHold((file) => send(null, file));

  const attach = () =>
    Alert.alert('Add a photo', undefined, [
      { text: 'Camera', onPress: async () => { const p = await pickChatPhoto('camera'); if (p) send(null, p); } },
      { text: 'Choose from Library', onPress: async () => { const p = await pickChatPhoto('library'); if (p) send(null, p); } },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    let lastDay = '';
    for (const m of messages) {
      const day = fmtDay(m.created_at);
      if (day !== lastDay) {
        out.push({ key: `d-${day}-${m.id}`, sep: day });
        lastDay = day;
      }
      out.push({ key: String(m.id), msg: m });
    }
    return out;
  }, [messages]);

  useEffect(() => {
    if (nearBottomRef.current) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  if (loading) {
    return <View style={s.centre}><ActivityIndicator size="large" color={accent} /></View>;
  }
  if (loadError) {
    return (
      <View style={s.centre}>
        <Text style={s.errTxt}>{loadError}</Text>
        <TouchableOpacity style={[s.retryBtn, { backgroundColor: accent }]} onPress={() => { setLoading(true); initial(); }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardScreen style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          nearBottomRef.current = contentSize.height - (contentOffset.y + layoutMeasurement.height) < 120;
        }}
        scrollEventThrottle={100}
        onContentSizeChange={() => nearBottomRef.current && listRef.current?.scrollToEnd({ animated: false })}
        initialNumToRender={60}
        maxToRenderPerBatch={60}
        windowSize={31}
        ListEmptyComponent={
          <Text style={s.empty}>
            No messages yet. The site supervisor, the SoWash office and you can talk about this visit here.
          </Text>
        }
        renderItem={({ item }) =>
          item.sep ? (
            <View style={{ alignItems: 'center', marginVertical: 8 }}><Text style={s.sep}>{item.sep}</Text></View>
          ) : (
            <Bubble m={item.msg!} mine={!!item.msg!.local || (myId != null && item.msg!.sender_user_id === myId)} accent={accent} onImage={setViewer} onRetry={retry} onReply={setReplyTo} />
          )
        }
      />

      {!canPost ? <Text style={s.closed}>This visit chat is closed for new messages.</Text> : null}

      {replyTo ? (
        <View style={s.replyBar}>
          <View style={{ flex: 1 }}>
            <Text style={[s.replyWho, { color: accent }]} numberOfLines={1}>{replyTo.sender_name || labelOf(replyTo.sender_role)}</Text>
            <Text style={s.replyTxt} numberOfLines={1}>{replyTo.body || (replyTo.attachment_url ? '📎 Attachment' : '')}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={10}><X size={18} color={palette.muted} /></TouchableOpacity>
        </View>
      ) : null}

      {canPost ? (
        <View>
        {myRole !== 'field' && !voice.recording ? (
          <TouchableOpacity
            style={s.ringBtn}
            onPress={() =>
              Alert.alert('Alert the supervisor?', 'He gets an urgent alert on his phone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send alert', onPress: () => send('🔔 URGENT: please check your phone and reply — the client is trying to reach you.') },
              ])
            }
            accessibilityLabel="Alert the supervisor"
          >
            <Bell size={15} color="#b91c1c" />
            <Text style={s.ringTxt}>Alert supervisor (urgent)</Text>
          </TouchableOpacity>
        ) : null}
        <View style={s.composer}>
          {voice.recording ? (
            <VoiceRecordingBar voice={voice} />
          ) : (
            <>
              <TouchableOpacity onPress={attach} style={s.attachBtn} hitSlop={6} accessibilityLabel="Add a photo">
                <Camera size={22} color={palette.muted} />
              </TouchableOpacity>
              <TextInput
                style={s.input}
                placeholder="Write a message…"
                placeholderTextColor={palette.mutedLight}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={2000}
              />
            </>
          )}
          {text.trim() && !voice.recording ? (
            <TouchableOpacity onPress={sendText} style={[s.sendBtn, { backgroundColor: accent }]} accessibilityLabel="Send">
              <Send size={18} color="#fff" />
            </TouchableOpacity>
          ) : (
            <VoiceMicButton voice={voice} accent={accent} buttonStyle={s.sendBtn} />
          )}
        </View>
        </View>
      ) : null}

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={s.viewer}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} contentFit="contain" /> : null}
          <TouchableOpacity style={s.viewerX} onPress={() => setViewer(null)}><X size={28} color="#fff" /></TouchableOpacity>
        </View>
      </Modal>
    </KeyboardScreen>
  );
}

const labelOf = (r: Role) => (r === 'field' ? 'Supervisor' : r === 'staff' ? 'SoWash' : 'Client');

const Bubble = React.memo(function Bubble({
  m, mine, accent, onImage, onRetry, onReply,
}: {
  m: Msg; mine: boolean; accent: string;
  onImage: (u: string) => void; onRetry: (m: Msg) => void; onReply: (m: Msg) => void;
}) {
  const url = m.attachment_url ? photoUrl(m.attachment_url) : m.local?.file?.uri || null;
  const kind = url ? mediaKind(m.attachment_name || m.attachment_url || m.local?.file?.name || url) : null;
  const who = m.sender_role === 'field' ? `Supervisor${m.sender_name ? ' · ' + m.sender_name : ''}`
    : m.sender_role === 'staff' ? `SoWash${m.sender_name ? ' · ' + m.sender_name : ''}`
    : m.sender_name || 'Client';
  const whoColor = m.sender_role === 'field' ? '#b45309' : m.sender_role === 'staff' ? '#7c3aed' : '#0369a1';
  return (
    <View style={[s.row, mine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={() => !m.local && onReply(m)}
        style={[s.bubble, mine ? { backgroundColor: accent + '22', borderBottomRightRadius: 4 } : s.bubbleOther]}
      >
        {!mine ? <Text style={[s.who, { color: whoColor }]}>{who}</Text> : null}
        {m.reply_to ? (
          <View style={[s.quote, { borderLeftColor: accent }]}>
            <Text style={[s.quoteWho, { color: accent }]} numberOfLines={1}>{m.reply_to.sender_name || 'Message'}</Text>
            <Text style={s.quoteTxt} numberOfLines={2}>{m.reply_to.body || (m.reply_to.has_attachment ? '📎 Attachment' : '')}</Text>
          </View>
        ) : null}
        {url && kind === 'image' ? (
          <TouchableOpacity onPress={() => onImage(url)} activeOpacity={0.9}>
            <Image source={{ uri: url }} style={s.photo} contentFit="cover" />
          </TouchableOpacity>
        ) : null}
        {url && kind === 'audio' ? (
          <ChatAttachment url={url} name={m.attachment_name} createdAt={m.created_at} mine={mine} accent={accent} sending={!!m.local} />
        ) : null}
        {m.body ? <Text style={s.body}>{m.body}</Text> : null}
        <View style={s.metaRow}>
          <Text style={s.time}>{fmtTime(m.created_at)}</Text>
          {m.local?.status === 'sending' ? <ActivityIndicator size="small" style={{ marginLeft: 6 }} color={palette.muted} /> : null}
          {m.local?.status === 'failed' ? (
            <TouchableOpacity onPress={() => onRetry(m)} style={{ marginLeft: 8 }}>
              <Text style={s.failed}>Not sent — tap to retry</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
});

const s = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errTxt: { color: '#dc2626', textAlign: 'center', marginBottom: 12 },
  retryBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  empty: { textAlign: 'center', color: palette.muted, marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  sep: { fontSize: 11, color: palette.muted, backgroundColor: palette.borderSubtle, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', marginBottom: 6 },
  bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 },
  bubbleOther: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderBottomLeftRadius: 4 },
  who: { fontSize: 11.5, fontWeight: '800', marginBottom: 2 },
  body: { fontSize: 15, color: palette.ink, lineHeight: 20 },
  photo: { width: 220, height: 160, borderRadius: 10, marginBottom: 4, backgroundColor: palette.borderSubtle },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  time: { fontSize: 10.5, color: palette.muted },
  failed: { fontSize: 11, color: '#dc2626', fontWeight: '700' },
  quote: { borderLeftWidth: 3, backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 4 },
  quoteWho: { fontSize: 11, fontWeight: '800' },
  quoteTxt: { fontSize: 12, color: palette.inkSoft },
  closed: { textAlign: 'center', color: '#b45309', backgroundColor: '#fef3c7', paddingVertical: 8, fontSize: 12.5 },
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: palette.borderSubtle, borderTopWidth: 1, borderTopColor: palette.border },
  replyWho: { fontSize: 11.5, fontWeight: '800' },
  replyTxt: { fontSize: 12.5, color: palette.inkSoft },
  ringBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, backgroundColor: '#fee2e2', borderTopWidth: 1, borderTopColor: '#fecaca' },
  ringTxt: { color: '#b91c1c', fontWeight: '700', fontSize: 12.5 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 8, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.surface },
  attachBtn: { padding: 10 },
  input: { flex: 1, maxHeight: 110, minHeight: 44, backgroundColor: palette.bg, color: palette.ink, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, borderWidth: 1, borderColor: palette.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  viewerX: { position: 'absolute', top: 44, right: 20, padding: 8 },
});
