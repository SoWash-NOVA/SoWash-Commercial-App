// src/components/GeneralChat.tsx
//
// GENERAL CHAT — ONE chat with the field supervisor and SoWash office, for BOTH identities of this app:
//   • client (mode 'client')  — straight into the company's chat (the room of its own client)
//   • office staff (mode 'staff') — an inbox of client chats, then the room
// The other end is the supervisor's SoWash FO app ("SoWash Chat" drawer item). Backend:
// sowash-backend/routes/generalChatRoutes.js at /api/customer-portal/general-chat (docs/general-chat.md). The server decides who
// may read / write what from the DB; this component only renders it.
//
// Every message may be about a SITE (picked from the "+" sheet → Site; shown as a tag on the message) and the sheet also
// sends an FSR (the report of one visit, as a card). Typing "@" tags a person of the room (office, the client's logins, the
// client's supervisors) — they get a notification. Text, photo, voice (hold the mic). New messages arrive by a 5 s poll while
// the screen is open; sending is optimistic with tap-to-retry (client_msg_id makes a retried send idempotent on the server).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { AtSign, Bell, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Camera, MapPin, Plus, Send, X, Check } from 'lucide-react-native';
import api, { errorMessage, photoUrl } from '../api/client';
import { palette } from '../theme';
import { useAccent } from '../theme-context';
import { ChatPhotoInput, refreshChatUnreadNow } from '../hooks';
import { mediaKind } from '../chat-media';
import { useChatSurface } from '../chat-focus';
import { useVoiceHold, VoiceMicButton, VoiceRecordingBar } from '../voiceRecorder';
import { pickChatPhoto } from '../photoPicker';
import ChatAttachment from './ChatAttachment';
import ChatHeaderBar from './ChatHeaderBar';
import KeyboardScreen from './KeyboardScreen';

const BASE = 'customer-portal/general-chat';
const POLL_MS = 5000;

type Role = 'field' | 'customer' | 'staff';
interface Mention { id: number; name: string; role: string }
interface Site { site_id: number | null; site_name: string | null; client_id?: number; client_name?: string }
interface Fsr { schedule_id: number; site_name: string; scheduled_date: string | null; status: string | null; has_fsr: boolean; photo: string | null; panels: number | null }
interface Payload { body: string | null; file?: ChatPhotoInput; replyId: number | null; site: Site; kind: 'text' | 'fsr'; scheduleId?: number; mentions: Mention[] }
interface Msg {
  id: number | string;
  client_id: number;
  client_name: string;
  site_id: number | null;
  site_name: string | null;
  schedule_id: number | null;
  kind: 'text' | 'fsr';
  sender_role: Role;
  sender_user_id: number | null;
  sender_name: string | null;
  body: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  mentions: Mention[];
  reply_to?: { sender_name: string | null; body: string | null; has_attachment: boolean; kind?: string } | null;
  fsr?: Fsr | null;
  created_at: string;
  local?: { status: 'sending' | 'failed'; clientMsgId: string; payload: Payload };
}
interface RoomRow {
  client_id: number;
  client_name: string;
  unread: number;
  mentions: number;
  last_message: { sender_role: Role; sender_name: string | null; preview: string; created_at: string } | null;
}
type Row = { key: string; sep?: string; msg?: Msg };

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
const fmtTime = (iso: string) => {
  try { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' }); } catch { return ''; }
};
const fmtDay = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Karachi' }); } catch { return ''; }
};
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sortById = (a: Msg, b: Msg) => (typeof a.id === 'number' && typeof b.id === 'number' ? a.id - b.id : 0);
const roleName = (r: string) => (r === 'staff' ? 'SoWash Office' : r === 'customer' ? 'Client' : 'Supervisor');
const whoOf = (m: Msg) =>
  m.sender_role === 'field' ? `Supervisor${m.sender_name ? ' · ' + m.sender_name : ''}`
  : m.sender_role === 'staff' ? `SoWash${m.sender_name ? ' · ' + m.sender_name : ''}`
  : m.sender_name || 'Client';
const whoColor = (r: Role) => (r === 'field' ? '#b45309' : r === 'staff' ? '#7c3aed' : '#0369a1');

// ───────────────────────────── entry ─────────────────────────────
export default function GeneralChat({
  mode,
  header,
}: {
  mode: 'client' | 'staff';
  /** Rendered above the staff inbox / the client's room (the host screen's own header). */
  header: React.ReactNode;
}) {
  const [roomClient, setRoomClient] = useState<{ id: number | null; name: string } | null>(mode === 'client' ? { id: null, name: '' } : null);
  const [initialSite, setInitialSite] = useState<Site | null>(null);

  // Staff: a room is open -> hide the tab bar; Android back returns to the inbox.
  useChatSurface(mode === 'staff' && roomClient != null, () => setRoomClient(null));

  if (mode === 'staff' && roomClient == null) {
    return <Inbox header={header} onOpen={(id, name, site) => { setInitialSite(site || null); setRoomClient({ id, name }); }} />;
  }
  return (
    <Room
      mode={mode}
      clientId={roomClient?.id ?? null}
      clientName={roomClient?.name || ''}
      initialSite={initialSite}
      header={header}
      onBack={() => setRoomClient(null)}
    />
  );
}

// ───────────────────────────── staff inbox ─────────────────────────────
function Inbox({ header, onOpen }: { header: React.ReactNode; onOpen: (id: number, name: string, site?: Site | null) => void }) {
  const { accent } = useAccent();
  const [rooms, setRooms] = useState<RoomRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Site[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.get(`${BASE}/rooms`);
      setRooms(res.data.rooms || []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load the chats.'));
    } finally {
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]));

  // start a chat with any client / site (search)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setFound([]); return; }
    const t = setTimeout(() => {
      api.get(`${BASE}/sites`, { params: { q: term } }).then((r) => setFound(r.data.sites || [])).catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <View style={s.screen}>
      {header}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search a client or site to start a chat…"
          placeholderTextColor={palette.mutedLight}
          value={q}
          onChangeText={setQ}
        />
      </View>
      {q.trim().length >= 2 ? (
        <FlatList
          data={found}
          keyExtractor={(x) => `${x.client_id}-${x.site_id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
          ListEmptyComponent={<Text style={s.empty}>No client or site matches “{q.trim()}”.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.card} activeOpacity={0.8} onPress={() => { setQ(''); onOpen(item.client_id!, item.client_name || '', { site_id: item.site_id, site_name: item.site_name }); }}>
              <View style={{ flex: 1 }}>
                <Text style={s.site} numberOfLines={1}>{item.site_name}</Text>
                <Text style={s.meta} numberOfLines={1}>{item.client_name}</Text>
              </View>
              <ChevronRight size={18} color={palette.mutedLight} />
            </TouchableOpacity>
          )}
        />
      ) : rooms == null && !error ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
      ) : (
        <FlatList
          data={rooms || []}
          keyExtractor={(r) => String(r.client_id)}
          contentContainerStyle={{ padding: 14, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={accent} />}
          ListEmptyComponent={
            <Text style={s.empty}>{error || 'No chats yet. They appear when a supervisor or a client writes — or search a client above to start one.'}</Text>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.card, item.unread > 0 && { borderColor: accent, borderWidth: 1.5 }]}
              activeOpacity={0.8}
              onPress={() => onOpen(item.client_id, item.client_name)}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.site} numberOfLines={1}>{item.client_name}</Text>
                <Text style={[s.last, item.unread > 0 && { color: palette.ink, fontWeight: '800' }]} numberOfLines={1}>
                  {item.last_message
                    ? `${item.last_message.sender_name || roleName(item.last_message.sender_role)}: ${item.last_message.preview}`
                    : 'No messages yet'}
                </Text>
              </View>
              {item.mentions > 0 ? (
                <View style={[s.badge, { backgroundColor: '#f59e0b', marginRight: 6 }]}><Text style={s.badgeTxt}>@</Text></View>
              ) : null}
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

// ───────────────────────────── one room ─────────────────────────────
function Room({
  mode, clientId: clientIdProp, clientName, initialSite, header, onBack,
}: {
  mode: 'client' | 'staff';
  clientId: number | null;
  clientName: string;
  initialSite: Site | null;
  header: React.ReactNode;
  onBack: () => void;
}) {
  const { accent } = useAccent();
  const router = useRouter();

  const [myId, setMyId] = useState<number | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [clientId, setClientId] = useState<number | null>(clientIdProp);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Mention[]>([]);
  const [site, setSite] = useState<Site>(initialSite || { site_id: null, site_name: null });
  const [sites, setSites] = useState<Site[] | null>(null);
  const [members, setMembers] = useState<Mention[]>([]);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [fsrOpen, setFsrOpen] = useState(false);

  const listRef = useRef<FlatList<Row>>(null);
  const lastIdRef = useRef(0);
  const nearBottomRef = useRef(true);
  const focusedRef = useRef(true);

  const markRead = useCallback(() => {
    api.post(`${BASE}/read`, clientId ? { client_id: clientId } : {}).then(refreshChatUnreadNow).catch(() => {});
  }, [clientId]);

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

  const params = useMemo(() => (clientIdProp ? { client_id: clientIdProp } : {}), [clientIdProp]);

  const initial = useCallback(async () => {
    try {
      const [m, st] = await Promise.all([
        api.get(`${BASE}/messages`, { params: { ...params, limit: 80 } }),
        api.get(`${BASE}/sites`, { params: clientIdProp ? { client_id: clientIdProp } : {} }),
      ]);
      setMyId(m.data.my_user_id);
      setMyRole(m.data.my_role);
      const list: Msg[] = m.data.messages || [];
      setMessages(list);
      setHasMore(!!m.data.has_more);
      lastIdRef.current = list.reduce((mx, x) => Math.max(mx, Number(x.id)), 0);
      const siteRows: Site[] = st.data.sites || [];
      setSites(siteRows);
      const cid = clientIdProp || siteRows[0]?.client_id || list[0]?.client_id || null;
      setClientId(cid);
      setLoadError(null);
      api.post(`${BASE}/read`, cid ? { client_id: cid } : {}).then(refreshChatUnreadNow).catch(() => {});
    } catch (e) {
      setLoadError(errorMessage(e, 'Could not open the chat.'));
    } finally {
      setLoading(false);
    }
  }, [params, clientIdProp]);

  const loadOlder = async () => {
    const first = messages.find((m) => typeof m.id === 'number');
    if (!first) return;
    try {
      const res = await api.get(`${BASE}/messages`, { params: { ...params, limit: 60, before_id: first.id } });
      setHasMore(!!res.data.has_more);
      setMessages((prev) => [...(res.data.messages || []), ...prev].sort(sortById));
    } catch { /* keep what is on screen */ }
  };

  const poll = useCallback(async () => {
    if (!focusedRef.current) return;
    try {
      const res = await api.get(`${BASE}/messages`, { params: { ...params, after_id: lastIdRef.current } });
      const list: Msg[] = res.data.messages || [];
      if (list.length) { merge(list); markRead(); }
    } catch { /* offline: keep what is on screen */ }
  }, [params, merge, markRead]);

  useEffect(() => { initial(); }, [initial]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      const t = setInterval(poll, POLL_MS);
      return () => { focusedRef.current = false; clearInterval(t); };
    }, [poll]),
  );

  useEffect(() => {
    if (nearBottomRef.current) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  // people that can be @tagged
  useEffect(() => {
    if (!clientId) return;
    api.get(`${BASE}/members`, { params: { client_id: clientId } }).then((r) => setMembers(r.data.members || [])).catch(() => {});
  }, [clientId]);

  const mentionQuery = useMemo(() => {
    const m = /(?:^|\s)@([^\s@]*)$/.exec(text);
    return m ? m[1].toLowerCase() : null;
  }, [text]);
  const suggestions = useMemo(() => (mentionQuery == null ? [] : members.filter((p) => p.name.toLowerCase().includes(mentionQuery)).slice(0, 6)), [mentionQuery, members]);
  const pickMention = (p: Mention) => {
    setText((t) => t.replace(/@([^\s@]*)$/, `@${p.name} `));
    setPicked((prev) => (prev.some((x) => x.id === p.id) ? prev : [...prev, p]));
  };

  // ── sending ──
  const deliver = useCallback(async (clientMsgId: string, p: Payload) => {
    try {
      const form = new FormData();
      if (p.body) form.append('body', p.body);
      form.append('client_msg_id', clientMsgId);
      if (clientId) form.append('client_id', String(clientId));
      if (p.site.site_id) form.append('site_id', String(p.site.site_id));
      form.append('kind', p.kind);
      if (p.scheduleId) form.append('schedule_id', String(p.scheduleId));
      if (p.replyId) form.append('reply_to_id', String(p.replyId));
      if (p.mentions.length) form.append('mentions', JSON.stringify(p.mentions.map((x) => x.id)));
      if (p.file) {
        form.append('photo', {
          uri: p.file.uri,
          name: p.file.name || (mediaKind(p.file.uri) === 'audio' ? 'voice.m4a' : 'photo.jpg'),
          type: p.file.mimeType || (mediaKind(p.file.name || p.file.uri) === 'audio' ? 'audio/mp4' : 'image/jpeg'),
        } as never);
      }
      const res = await api.post(`${BASE}/messages`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
      const saved: Msg = res.data.message;
      setMessages((prev) => [...prev.filter((m) => m.local?.clientMsgId !== clientMsgId && String(m.id) !== String(saved.id)), saved].sort(sortById));
      if (Number(saved.id) > lastIdRef.current) lastIdRef.current = Number(saved.id);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        setMessages((prev) => prev.filter((m) => m.local?.clientMsgId !== clientMsgId));
        Alert.alert('Not sent', errorMessage(e, 'This message could not be sent.'));
        return;
      }
      setMessages((prev) => prev.map((m) => (m.local?.clientMsgId === clientMsgId ? { ...m, local: { ...m.local!, status: 'failed' } } : m)));
    }
  }, [clientId]);

  const send = useCallback((p: { body: string | null; file?: ChatPhotoInput; kind: 'text' | 'fsr'; scheduleId?: number; mentions?: Mention[] }) => {
    // a reply stays in the site of the message being answered
    const useSite: Site = replyTo ? { site_id: replyTo.site_id, site_name: replyTo.site_name } : site;
    const clientMsgId = uuid();
    const payload: Payload = { ...p, site: useSite, replyId: replyTo && typeof replyTo.id === 'number' ? replyTo.id : null, mentions: p.mentions || [] };
    const local: Msg = {
      id: `local-${clientMsgId}`,
      client_id: clientId || 0, client_name: clientName, site_id: useSite.site_id, site_name: useSite.site_name,
      schedule_id: p.scheduleId || null, kind: p.kind,
      sender_role: myRole || 'customer', sender_user_id: myId, sender_name: null,
      body: p.body, attachment_url: null, attachment_name: p.file?.name || null, mentions: payload.mentions,
      reply_to: replyTo ? { sender_name: replyTo.sender_name, body: replyTo.body, has_attachment: !!replyTo.attachment_url, kind: replyTo.kind } : null,
      fsr: null,
      created_at: new Date().toISOString(),
      local: { status: 'sending', clientMsgId, payload },
    };
    nearBottomRef.current = true;
    setMessages((prev) => [...prev, local]);
    setReplyTo(null);
    deliver(clientMsgId, payload);
  }, [replyTo, site, clientId, clientName, myRole, myId, deliver]);

  const retry = (m: Msg) => {
    if (!m.local) return;
    setMessages((prev) => prev.map((x) => (x === m ? { ...x, local: { ...x.local!, status: 'sending' } } : x)));
    deliver(m.local.clientMsgId, m.local.payload);
  };

  const sendText = () => {
    const t = text.trim();
    if (!t) return;
    const tagged = picked.filter((p) => t.includes(`@${p.name}`));
    setText('');
    setPicked([]);
    send({ body: t, kind: 'text', mentions: tagged });
  };

  const voice = useVoiceHold((file) => send({ body: null, file, kind: 'text' }));

  const takePhoto = async (src: 'camera' | 'library') => {
    setSheetOpen(false);
    await new Promise((r) => setTimeout(r, 250)); // let the sheet close before the picker opens
    const p = await pickChatPhoto(src);
    if (p) send({ body: null, file: p, kind: 'text' });
  };

  const rows = useMemo(() => {
    const out: Row[] = [];
    let lastDay = '';
    for (const m of messages) {
      const day = fmtDay(m.created_at);
      if (day !== lastDay) { out.push({ key: `d-${day}-${m.id}`, sep: day }); lastDay = day; }
      out.push({ key: String(m.id), msg: m });
    }
    return out;
  }, [messages]);

  const openFsr = (m: Msg) => {
    const f = m.fsr;
    if (!f) return;
    if (f.photo) { setViewer(photoUrl(f.photo)); return; }
    if (myRole === 'customer') router.push(`/job/${f.schedule_id}` as never);
    else Alert.alert('FSR', 'This FSR has no photo attached.');
  };

  const activeSite: Site = replyTo ? { site_id: replyTo.site_id, site_name: replyTo.site_name } : site;

  const roomHeader = mode === 'staff' ? (
    <ChatHeaderBar style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 12 }}>
      <TouchableOpacity onPress={onBack} hitSlop={10} style={{ padding: 4 }} accessibilityLabel="Back">
        <ChevronLeft size={26} color="#fff" />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.roomTitle} numberOfLines={1}>{clientName || messages[0]?.client_name || 'Chat'}</Text>
        <Text style={s.roomSub} numberOfLines={1}>Client · site supervisors · SoWash office</Text>
      </View>
    </ChatHeaderBar>
  ) : header;

  return (
    <View style={s.screen}>
      {roomHeader}
      {loading ? (
        <View style={s.centre}><ActivityIndicator size="large" color={accent} /></View>
      ) : loadError ? (
        <View style={s.centre}>
          <Text style={s.errTxt}>{loadError}</Text>
          <TouchableOpacity style={[s.retryBtn, { backgroundColor: accent }]} onPress={() => { setLoading(true); initial(); }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
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
            ListHeaderComponent={hasMore ? (
              <TouchableOpacity onPress={loadOlder} style={s.olderBtn}><Text style={s.olderTxt}>Load older messages</Text></TouchableOpacity>
            ) : null}
            ListEmptyComponent={
              <Text style={s.empty}>
                No messages yet. Tap <Text style={{ fontWeight: '800' }}>+</Text> to pick a site or send an FSR, or just write — the site supervisor and the SoWash office are in this chat.
              </Text>
            }
            renderItem={({ item }) =>
              item.sep ? (
                <View style={{ alignItems: 'center', marginVertical: 8 }}><Text style={s.sep}>{item.sep}</Text></View>
              ) : (
                <Bubble
                  m={item.msg!}
                  mine={!!item.msg!.local || (myId != null && item.msg!.sender_user_id === myId)}
                  myId={myId}
                  accent={accent}
                  onImage={setViewer}
                  onRetry={retry}
                  onReply={setReplyTo}
                  onFsr={openFsr}
                />
              )
            }
          />

          {replyTo ? (
            <View style={s.replyBar}>
              <View style={{ flex: 1 }}>
                <Text style={[s.replyWho, { color: accent }]} numberOfLines={1}>{whoOf(replyTo)}</Text>
                <Text style={s.replyTxt} numberOfLines={1}>{replyTo.body || (replyTo.kind === 'fsr' ? '📄 FSR' : replyTo.attachment_url ? '📎 Attachment' : '')}</Text>
              </View>
              <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={10}><X size={18} color={palette.muted} /></TouchableOpacity>
            </View>
          ) : null}

          {suggestions.length > 0 ? (
            <View style={s.mentionBox}>
              {suggestions.map((p) => (
                <TouchableOpacity key={p.id} style={s.mentionRow} onPress={() => pickMention(p)}>
                  <AtSign size={15} color="#7c3aed" />
                  <Text style={s.mentionName}>{p.name}</Text>
                  <Text style={s.mentionRole}>{roleName(p.role)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          {!voice.recording ? (
            <TouchableOpacity style={s.siteBar} onPress={() => setSiteOpen(true)} activeOpacity={0.8}>
              <MapPin size={14} color={accent} />
              <Text style={[s.siteBarTxt, { color: palette.ink }]} numberOfLines={1}>
                {activeSite.site_name ? `Site: ${activeSite.site_name}` : 'General (no site) — tap to pick a site'}
              </Text>
              <Text style={[s.siteBarChange, { color: accent }]}>{replyTo ? 'reply' : 'change'}</Text>
            </TouchableOpacity>
          ) : null}

          {myRole === 'customer' && !voice.recording ? (
            <TouchableOpacity
              style={s.ringBtn}
              onPress={() =>
                Alert.alert('Alert the supervisor?', 'He gets an urgent alert on his phone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Send alert', onPress: () => send({ body: '🔔 URGENT: please check your phone and reply — the client is trying to reach you.', kind: 'text' }) },
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
                <TouchableOpacity onPress={() => setSheetOpen(true)} style={s.plusBtn} hitSlop={6} accessibilityLabel="Attach">
                  <Plus size={22} color="#fff" />
                </TouchableOpacity>
                <TextInput
                  style={s.input}
                  placeholder="Write a message… (@ to tag someone)"
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
        </KeyboardScreen>
      )}

      {/* "+" sheet */}
      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setSheetOpen(false)}>
          <View style={s.sheet}>
            <View style={s.grabber} />
            <View style={s.grid}>
              <SheetItem icon={<Camera size={26} color="#e11d48" />} color="#e11d48" label="Camera" onPress={() => takePhoto('camera')} />
              <SheetItem icon={<ImageIcon size={26} color="#2563eb" />} color="#2563eb" label="Gallery" onPress={() => takePhoto('library')} />
              <SheetItem icon={<MapPin size={26} color="#16a34a" />} color="#16a34a" label="Site" onPress={() => { setSheetOpen(false); setSiteOpen(true); }} />
              <SheetItem icon={<FileText size={26} color="#7c3aed" />} color="#7c3aed" label="FSR" onPress={() => { setSheetOpen(false); if (!clientId) return Alert.alert('FSR', 'Please wait — the chat is still loading.'); setFsrOpen(true); }} />
              <SheetItem icon={<AtSign size={26} color="#d97706" />} color="#d97706" label="Tag (@)" onPress={() => { setSheetOpen(false); setText((t) => (t && !/\s$/.test(t) ? `${t} @` : `${t}@`)); }} />
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <SitePicker visible={siteOpen} sites={sites} current={site} accent={accent} onClose={() => setSiteOpen(false)} onPick={(x) => { setSite(x); setSiteOpen(false); }} />
      <FsrPicker visible={fsrOpen} clientId={clientId} accent={accent} onClose={() => setFsrOpen(false)} onPick={(scheduleId) => { setFsrOpen(false); send({ body: null, kind: 'fsr', scheduleId }); }} />

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={s.viewer}>
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} contentFit="contain" /> : null}
          <TouchableOpacity style={s.viewerX} onPress={() => setViewer(null)}><X size={28} color="#fff" /></TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

function SheetItem({ icon, color, label, onPress }: { icon: React.ReactNode; color: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.gridItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.gridIcon, { backgroundColor: color + '22' }]}>{icon}</View>
      <Text style={s.gridLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ───────────────────────────── pickers ─────────────────────────────
function SitePicker({ visible, sites, current, accent, onClose, onPick }: {
  visible: boolean; sites: Site[] | null; current: Site; accent: string; onClose: () => void; onPick: (s: Site) => void;
}) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (sites || []).filter((x) => !n || String(x.site_name).toLowerCase().includes(n));
  }, [sites, q]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.pickerSheet}>
          <View style={s.pickerHead}>
            <Text style={s.pickerTitle}>Pick a site</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><X size={22} color={palette.ink} /></TouchableOpacity>
          </View>
          <TextInput style={s.pickerSearch} placeholder="Search a site…" placeholderTextColor={palette.mutedLight} value={q} onChangeText={setQ} />
          <TouchableOpacity style={s.pickRow} onPress={() => onPick({ site_id: null, site_name: null })}>
            <Text style={[s.pickName, { flex: 1 }]}>General (no site)</Text>
            {current.site_id == null ? <Check size={18} color={accent} /> : null}
          </TouchableOpacity>
          {sites == null ? <ActivityIndicator style={{ marginTop: 24 }} color={accent} /> : (
            <FlatList
              data={list}
              keyExtractor={(x) => String(x.site_id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={s.empty}>No sites found.</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.pickRow} onPress={() => onPick({ site_id: item.site_id, site_name: item.site_name })}>
                  <Text style={[s.pickName, { flex: 1 }]} numberOfLines={1}>{item.site_name}</Text>
                  {current.site_id === item.site_id ? <Check size={18} color={accent} /> : null}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function FsrPicker({ visible, clientId, accent, onClose, onPick }: {
  visible: boolean; clientId: number | null; accent: string; onClose: () => void; onPick: (scheduleId: number) => void;
}) {
  const [visits, setVisits] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!visible || !clientId) return;
    setVisits(null);
    setError(null);
    api.get(`${BASE}/fsrs`, { params: { client_id: clientId } })
      .then((r) => setVisits(r.data.visits || []))
      .catch((e) => setError(errorMessage(e, 'Could not load the visits.')));
  }, [visible, clientId]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.pickerSheet}>
          <View style={s.pickerHead}>
            <Text style={s.pickerTitle}>Send an FSR</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><X size={22} color={palette.ink} /></TouchableOpacity>
          </View>
          {visits == null && !error ? <ActivityIndicator style={{ marginTop: 24 }} color={accent} /> : (
            <FlatList
              data={visits || []}
              keyExtractor={(v) => String(v.schedule_id)}
              ListEmptyComponent={<Text style={s.empty}>{error || 'No visits found.'}</Text>}
              renderItem={({ item }) => (
                <TouchableOpacity style={[s.pickRow, !item.has_fsr && { opacity: 0.45 }]} disabled={!item.has_fsr} onPress={() => onPick(item.schedule_id)}>
                  <FileText size={20} color={item.has_fsr ? '#7c3aed' : palette.mutedLight} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.pickName} numberOfLines={1}>{item.site_name}</Text>
                    <Text style={s.pickSub} numberOfLines={1}>{item.scheduled_date} · {item.status}{item.has_fsr ? '' : ' · FSR not filed yet'}</Text>
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ───────────────────────────── bubble ─────────────────────────────
function BodyText({ m }: { m: Msg }) {
  const body = m.body || '';
  const names = (m.mentions || []).map((x) => x.name).filter(Boolean);
  if (!names.length) return <Text style={s.body}>{body}</Text>;
  const parts = body.split(new RegExp(`(@(?:${names.map(escapeRe).join('|')}))`, 'g'));
  return (
    <Text style={s.body}>
      {parts.map((p, i) => (names.some((n) => p === `@${n}`) ? <Text key={i} style={s.mentionInline}>{p}</Text> : <Text key={i}>{p}</Text>))}
    </Text>
  );
}

const Bubble = React.memo(function Bubble({ m, mine, myId, accent, onImage, onRetry, onReply, onFsr }: {
  m: Msg; mine: boolean; myId: number | null; accent: string;
  onImage: (u: string) => void; onRetry: (m: Msg) => void; onReply: (m: Msg) => void; onFsr: (m: Msg) => void;
}) {
  const url = m.attachment_url ? photoUrl(m.attachment_url) : m.local?.payload.file?.uri || null;
  const kind = url ? mediaKind(m.attachment_name || m.attachment_url || m.local?.payload.file?.name || url) : null;
  const tagged = (m.mentions || []).some((x) => x.id === myId);
  return (
    <View style={[s.row, mine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={() => !m.local && onReply(m)}
        style={[s.bubble, mine ? { backgroundColor: accent + '22', borderBottomRightRadius: 4 } : s.bubbleOther, tagged && s.bubbleTagged]}
      >
        {!mine ? <Text style={[s.who, { color: whoColor(m.sender_role) }]}>{whoOf(m)}</Text> : null}
        {m.site_name ? (
          <View style={s.tagChip}><MapPin size={10} color="#166534" /><Text style={s.tagTxt} numberOfLines={1}>{m.site_name}</Text></View>
        ) : null}
        {tagged ? <Text style={s.taggedYou}>@ You were tagged</Text> : null}
        {m.reply_to ? (
          <View style={[s.quote, { borderLeftColor: accent }]}>
            <Text style={[s.quoteWho, { color: accent }]} numberOfLines={1}>{m.reply_to.sender_name || 'Message'}</Text>
            <Text style={s.quoteTxt} numberOfLines={2}>{m.reply_to.body || (m.reply_to.kind === 'fsr' ? '📄 FSR' : m.reply_to.has_attachment ? '📎 Attachment' : '')}</Text>
          </View>
        ) : null}
        {m.kind === 'fsr' && m.fsr ? (
          <TouchableOpacity style={s.fsrCard} activeOpacity={0.85} onPress={() => onFsr(m)}>
            <View style={s.fsrIcon}><FileText size={20} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.fsrTitle}>FSR report</Text>
              <Text style={s.fsrSub} numberOfLines={2}>
                {m.fsr.site_name}{m.fsr.scheduled_date ? ` · ${m.fsr.scheduled_date}` : ''}{m.fsr.panels != null ? ` · ${m.fsr.panels} panels` : ''}
              </Text>
              <Text style={s.fsrOpen}>{m.fsr.photo ? 'Tap to view the report photo' : 'Tap to open the visit'}</Text>
            </View>
          </TouchableOpacity>
        ) : null}
        {url && kind === 'image' ? (
          <TouchableOpacity onPress={() => onImage(url)} activeOpacity={0.9}><Image source={{ uri: url }} style={s.photo} contentFit="cover" /></TouchableOpacity>
        ) : null}
        {url && kind === 'audio' ? (
          <ChatAttachment url={url} name={m.attachment_name} createdAt={m.created_at} mine={mine} accent={accent} sending={!!m.local} />
        ) : null}
        {m.body ? <BodyText m={m} /> : null}
        <View style={s.metaRow}>
          <Text style={s.time}>{fmtTime(m.created_at)}</Text>
          {m.local?.status === 'sending' ? <ActivityIndicator size="small" style={{ marginLeft: 6 }} color={palette.muted} /> : null}
          {m.local?.status === 'failed' ? (
            <TouchableOpacity onPress={() => onRetry(m)} style={{ marginLeft: 8 }}><Text style={s.failed}>Not sent — tap to retry</Text></TouchableOpacity>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errTxt: { color: '#dc2626', textAlign: 'center', marginBottom: 12 },
  retryBtn: { paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10 },
  roomTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  roomSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  searchWrap: { paddingHorizontal: 14, paddingTop: 12 },
  searchInput: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, fontSize: 14.5, color: palette.ink },
  empty: { textAlign: 'center', color: palette.muted, marginTop: 40, paddingHorizontal: 24, lineHeight: 21 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 14, padding: 14, marginBottom: 10 },
  site: { fontSize: 15, fontWeight: '700', color: palette.ink },
  meta: { fontSize: 12, color: palette.muted, marginTop: 2 },
  last: { fontSize: 13, color: palette.inkSoft, marginTop: 6 },
  badge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  olderBtn: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 14, backgroundColor: palette.borderSubtle, marginBottom: 8 },
  olderTxt: { fontSize: 12, color: palette.inkSoft, fontWeight: '600' },
  sep: { fontSize: 11, color: palette.muted, backgroundColor: palette.borderSubtle, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  row: { flexDirection: 'row', marginBottom: 6 },
  bubble: { maxWidth: '84%', borderRadius: 14, paddingHorizontal: 11, paddingVertical: 7 },
  bubbleOther: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderBottomLeftRadius: 4 },
  bubbleTagged: { borderWidth: 2, borderColor: '#f59e0b' },
  who: { fontSize: 11.5, fontWeight: '800', marginBottom: 2 },
  tagChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4, maxWidth: '100%' },
  tagTxt: { fontSize: 10.5, fontWeight: '700', color: '#166534', marginLeft: 3, flexShrink: 1 },
  taggedYou: { fontSize: 11, fontWeight: '800', color: '#b45309', marginBottom: 3 },
  body: { fontSize: 15, color: palette.ink, lineHeight: 20 },
  mentionInline: { color: '#7c3aed', fontWeight: '800' },
  photo: { width: 220, height: 160, borderRadius: 10, marginBottom: 4, backgroundColor: palette.borderSubtle },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 },
  time: { fontSize: 10.5, color: palette.muted },
  failed: { fontSize: 11, color: '#dc2626', fontWeight: '700' },
  quote: { borderLeftWidth: 3, backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 4 },
  quoteWho: { fontSize: 11, fontWeight: '800' },
  quoteTxt: { fontSize: 12, color: palette.inkSoft },
  fsrCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f3ff', borderColor: '#ddd6fe', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 4, minWidth: 210 },
  fsrIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#7c3aed', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  fsrTitle: { fontSize: 14, fontWeight: '800', color: '#4c1d95' },
  fsrSub: { fontSize: 12, color: '#475569', marginTop: 1 },
  fsrOpen: { fontSize: 11, color: '#7c3aed', marginTop: 3, fontWeight: '700' },
  replyBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: palette.borderSubtle, borderTopWidth: 1, borderTopColor: palette.border },
  replyWho: { fontSize: 11.5, fontWeight: '800' },
  replyTxt: { fontSize: 12.5, color: palette.inkSoft },
  mentionBox: { backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.border, maxHeight: 220 },
  mentionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, gap: 8 },
  mentionName: { flex: 1, fontSize: 15, fontWeight: '700', color: palette.ink },
  mentionRole: { fontSize: 11.5, color: palette.muted },
  siteBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: palette.borderSubtle, borderTopWidth: 1, borderTopColor: palette.border },
  siteBarTxt: { flex: 1, fontSize: 12.5, fontWeight: '700' },
  siteBarChange: { fontSize: 12, fontWeight: '800' },
  ringBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, backgroundColor: '#fee2e2', borderTopWidth: 1, borderTopColor: '#fecaca' },
  ringTxt: { color: '#b91c1c', fontWeight: '700', fontSize: 12.5 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, padding: 8, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.surface },
  plusBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#64748b', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  input: { flex: 1, maxHeight: 110, minHeight: 44, backgroundColor: palette.bg, color: palette.ink, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, fontSize: 15, borderWidth: 1, borderColor: palette.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: palette.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 8, paddingHorizontal: 12, paddingBottom: 28 },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: palette.border, marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '25%', alignItems: 'center', paddingVertical: 12 },
  gridIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  gridLabel: { fontSize: 12.5, color: palette.ink, fontWeight: '600' },
  pickerSheet: { backgroundColor: palette.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 14, paddingTop: 14, height: '72%' },
  pickerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  pickerTitle: { fontSize: 17, fontWeight: '800', color: palette.ink },
  pickerSearch: { backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.border, color: palette.ink, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, fontSize: 15, marginBottom: 6 },
  pickRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
  pickName: { fontSize: 15, fontWeight: '700', color: palette.ink },
  pickSub: { fontSize: 12, color: palette.muted, marginTop: 1 },
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  viewerX: { position: 'absolute', top: 44, right: 20, padding: 8 },
});
