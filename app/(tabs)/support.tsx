// app/(tabs)/support.tsx
//
// Support now opens on a list of sites — tap one to open its conversation,
// same shape as any chat app's inbox. Back arrow returns to the list.
//
// ⚠️ IMPORTANT — READ BEFORE WIRING TO YOUR REAL DATA ⚠️
// This codebase's chat, as handed to me, was ONE shared conversation for the
// whole account (`useChat()` takes no site argument, and the original file's
// own header comment said so explicitly). There is no per-site thread on the
// backend that I've seen.
//
// So two different things are real here, and one is a placeholder:
//   • REAL: the site list, the visit-tag picker (scoped to the tapped site
//     via `useJobs({ siteId })`, which the rest of the app already uses),
//     and the Ring feature (sends an actual message, now mentioning the
//     site you rang from).
//   • NOT YET REAL: the messages inside a thread are still the ONE shared
//     account conversation, no matter which site you tapped — because
//     there's no per-site message data to scope it to. The subtitle under
//     each site's name says so plainly, so this doesn't quietly pretend to
//     separate threads that don't exist.
//
// If there IS a per-site chat endpoint or a `site_id` on ChatMessage that
// I haven't seen, tell me its shape (endpoint, or the field name) and I'll
// wire real per-site scoping in one pass — swap the `useChat()` call and
// drop the shared-thread subtitle.
//
// ASSUMPTION flagged separately: `useSiteContext()` is read here as exposing
// a `sites` array (the same list SiteSwitcher must be rendering from). If
// the real property has a different name, tell me and it's a one-line fix.

import { useChatScroll } from '../../src/useChatScroll';
import { useChatSurface } from '../../src/chat-focus';
import KeyboardScreen from '../../src/components/KeyboardScreen';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { promptChatPhotoSource } from '../../src/photoPicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  ImagePlus,
  MapPin,
  Mic,
  Video,
  MessagesSquare,
  Reply,
  Send,
  Users,
  X,
} from 'lucide-react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { palette } from '../../src/theme';
import { isDark, tc, ttc, soft } from '../../src/themeEngine';
import { useAccent } from '../../src/theme-context';
import { useSiteContext } from '../../src/site-context';
import { photoUrl } from '../../src/api/client';
import { useChat, useJobs, useSiteRings, formatDateOnly, formatTime, ChatPhotoInput } from '../../src/hooks';
import { useAuth } from '../../src/auth/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import ChatBackground from '../../src/components/ChatBackground';
import { shade } from '../../src/utils/color';
import { GREEN_STOPS } from '../../src/brand';
import ChatHeaderBar from '../../src/components/ChatHeaderBar';
import { ChatMessage, ChatRing, JobSummary, TeamReaction, TeamReplyRef } from '../../src/api/types';
import { takeChatAttach, useChatAttachRequest } from '../../src/chat-attach';
// A tagged visit renders as a preview card — photos, site, crew — that opens
// the whole visit in a sheet. See src/components/ChatVisitCard.tsx.
import ChatVisitCard from '../../src/components/ChatVisitCard';
import ChatAttachment from '../../src/components/ChatAttachment';
import { useVoiceHold, VoiceRecordingBar } from '../../src/voiceRecorder';
import { mediaKind, attachmentLabel } from '../../src/chat-media';

const TAB_BAR_CLEARANCE = 0;

/** WhatsApp's default quick reactions (same set as the staff app). */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type ActionRect = { x: number; y: number; w: number; h: number };

/**
 * Is this message MINE? A client can have several portal logins sharing one
 * thread, so `sender_kind === 'customer'` only means "someone at my company" —
 * a colleague's message must sit on the left with their name, not on my side.
 * Falls back to "mine" when the server didn't say who sent it (older server),
 * which is the previous behaviour.
 */
function isMine(message: ChatMessage, myUserId: number | undefined): boolean {
  if (message.sender_kind !== 'customer') return false;
  if (message.sender_user_id == null || myUserId == null) return true;
  return message.sender_user_id === myUserId;
}
const RING_COOLDOWN_MS = 60_000;
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

const AVATAR_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4'];
const SITE_TINTS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444', '#14b8a6'];

/** Minimal shape this screen needs from a site — matches how `selectedSite`
 * is used elsewhere in the app (`site_name`, an id). No index signature: an
 * index signature is what made the cast below fight the real `Site` type. */
type SiteLike = { id: number; site_name?: string | null };

function initial(name: string) {
  return (name.trim()[0] || '?').toUpperCase();
}

function colorFor(name: string, palette_: string[]) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return palette_[hash % palette_.length];
}

/** Mirrors usePhotoBubbleSize in app/staff/chats.tsx — same s.bubble 78%-width cap, same reasoning. */
function usePhotoBubbleSize() {
  const { width } = useWindowDimensions();
  const maxWidth = width * 0.78 - 24;
  const w = Math.min(200, Math.max(140, maxWidth));
  return { width: w, height: w * 0.75 };
}

/** "2026-09-16" style timestamp -> "Today" / "Yesterday" / "16 Sep 2026". */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

type Row =
  | { kind: 'separator'; key: string; label: string }
  | { kind: 'message'; key: string; message: ChatMessage; showAvatar: boolean; showName: boolean };

/** Flattens messages into separators + grouped bubbles: consecutive
 * messages from the same sender within 3 minutes share one avatar/name. */
function buildRows(messages: ChatMessage[]): Row[] {
  const rows: Row[] = [];
  let lastDay = '';
  let lastSender: string | null = null;
  let lastAt = 0;

  for (const m of messages) {
    const day = dayLabel(m.created_at);
    if (day !== lastDay) {
      rows.push({ kind: 'separator', key: `sep-${m.id}`, label: day });
      lastDay = day;
      lastSender = null;
    }

    const senderKey = `${m.sender_kind}:${m.sender_name ?? ''}`;
    const at = new Date(m.created_at).getTime();
    const sameRun = senderKey === lastSender && at - lastAt < 3 * 60_000;

    rows.push({ kind: 'message', key: String(m.id), message: m, showAvatar: !sameRun, showName: !sameRun });

    lastSender = senderKey;
    lastAt = at;
  }

  return rows;
}

/* ==================================================================== *
 * Screen shell — list of sites, or a thread
 * ==================================================================== */

export default function SupportScreen() {
  const [activeSite, setActiveSite] = useState<SiteLike | 'general' | null>(null);
  // "Attach in chat" from a long-pressed visit (src/chat-attach.ts): open General with it tagged.
  const attachSeq = useChatAttachRequest();
  const [attachJob, setAttachJob] = useState<JobSummary | null>(null);
  useEffect(() => {
    const j = takeChatAttach();
    if (j) {
      setAttachJob(j);
      setActiveSite('general');
    }
  }, [attachSeq]);
  // Inside a site's rings or the General chat: hide the tab bar; Android back returns to the site list (not Overview).
  useChatSurface(activeSite !== null, () => setActiveSite(null));

  // General holds the whole conversation. A site is NOT a chat: it shows that
  // site's ring history and lets the client ring again (see SiteRings).
  if (activeSite === 'general') {
    return (
      <ChatThread
        site={null}
        attach={attachJob}
        onBack={() => {
          setActiveSite(null);
          setAttachJob(null);
        }}
      />
    );
  }
  if (activeSite) {
    return (
      <SiteRings
        site={activeSite}
        onBack={() => setActiveSite(null)}
        onOpenGeneral={() => setActiveSite('general')}
      />
    );
  }

  return <SiteList onOpen={setActiveSite} />;
}

/* ==================================================================== *
 * List of sites
 * ==================================================================== */

function SiteList({ onOpen }: { onOpen: (site: SiteLike | 'general') => void }) {
  // See the ASSUMPTION note at the top of the file. Cast goes through
  // `unknown` first — the real SiteContextValue and this narrowed shape
  // don't overlap enough for TS to allow a direct cast.
  const ctx = useSiteContext() as unknown as { sites?: SiteLike[] };
  const sites = ctx.sites ?? [];

  return (
    <View style={s.screen}>
      <View pointerEvents="none" style={s.wash}>
        <View style={[s.blob, { backgroundColor: soft('#dbeafe'), top: -90, left: -70, width: 240, height: 240 }]} />
        <View style={[s.blob, { backgroundColor: soft('#ede9fe'), top: 200, right: -100, width: 240, height: 240 }]} />
      </View>

      <ChatHeaderBar
        rounded
        style={{ flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: 20, paddingBottom: 18, gap: 2 }}
      >
        <Text style={s.listTitle}>Support</Text>
        <Text style={s.listSub}>Ring support for a site, or open General for the full conversation</Text>
      </ChatHeaderBar>

      <FlatList
        data={sites}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.siteList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <TouchableOpacity style={s.siteRow} activeOpacity={0.85} onPress={() => onOpen('general')}>
            <View style={[s.siteAvatar, { backgroundColor: isDark() ? '#2A3649' : '#0f172a' }]}>
              <Users size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.siteName}>General</Text>
              <Text style={s.siteSub} numberOfLines={1}>
                The full conversation with SoWash
              </Text>
            </View>
            <ChevronRight size={18} color={palette.mutedLight} />
          </TouchableOpacity>
        }
        renderItem={({ item }) => {
          const name = item.site_name || 'Site';
          return (
            <TouchableOpacity style={s.siteRow} activeOpacity={0.85} onPress={() => onOpen(item)}>
              <View style={[s.siteAvatar, { backgroundColor: colorFor(name, SITE_TINTS) }]}>
                <Text style={s.siteAvatarText}>{initial(name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.siteName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={s.siteSub} numberOfLines={1}>
                  Ring support · see past rings
                </Text>
              </View>
              <ChevronRight size={18} color={palette.mutedLight} />
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={s.emptyCard}>
            <Building2 size={22} color={palette.mutedLight} />
            <Text style={s.emptyTitle}>No sites yet</Text>
            <Text style={s.emptyBody}>Sites will show up here once they're on the account.</Text>
          </View>
        }
      />
    </View>
  );
}

/* ==================================================================== *
 * One site — ring history + ring again
 * ==================================================================== */

const RING_STATUS = {
  waiting: { label: 'Waiting', color: '#b45309', bg: '#fef3c7' },
  answered: { label: 'Support replied', color: '#1d4ed8', bg: '#dbeafe' },
  completed: { label: 'Completed', color: '#15803d', bg: '#dcfce7' },
} as const;

/** The default ring text carries no information — only show a note the client actually typed. */
function ringNote(body: string | null): string | null {
  if (!body) return null;
  const marker = ' — ';
  const i = body.indexOf(marker);
  const after = i === -1 ? '' : body.slice(i + marker.length).trim();
  if (!after || after.startsWith("I'd like to talk to someone")) return null;
  return after;
}

function stamp(iso: string) {
  return `${dayLabel(iso)} · ${formatTime(iso)}`;
}

function SiteRings({
  site,
  onBack,
  onOpenGeneral,
}: {
  site: SiteLike;
  onBack: () => void;
  onOpenGeneral: () => void;
}) {
  const { accent } = useAccent();
  const insets = useSafeAreaInsets();
  const { rings, loading, error, sending, ring } = useSiteRings(site.id);
  const [note, setNote] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, force] = useState(0);
  const onCooldown = Date.now() < cooldownUntil;

  // Re-render when the cooldown ends so the button un-greys itself.
  useEffect(() => {
    if (!onCooldown) return undefined;
    const t = setTimeout(() => force((n) => n + 1), Math.max(0, cooldownUntil - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [onCooldown, cooldownUntil]);

  const name = site.site_name || 'Site';
  const waitingCount = rings.filter((r) => r.status === 'waiting').length;

  const sendRing = async () => {
    if (sending || onCooldown) return;
    const extra = note.trim();
    const ok = await ring(
      `🔔 Ringing about ${name} — ${extra || "I'd like to talk to someone when you're free."}`,
    );
    if (ok) {
      setNote('');
      setCooldownUntil(Date.now() + RING_COOLDOWN_MS);
    }
  };

  const renderRing = ({ item }: { item: ChatRing }) => {
    const meta = RING_STATUS[item.status];
    const extra = ringNote(item.body);
    return (
      <View style={s.ringCard}>
        <View style={s.ringCardTop}>
          <Bell size={14} color={palette.muted} />
          <Text style={s.ringCardTime}>{stamp(item.created_at)}</Text>
          <View style={[s.ringPill, { backgroundColor: tc(meta.bg) }]}>
            <Text style={[s.ringPillText, { color: ttc(meta.color) }]}>{meta.label}</Text>
          </View>
        </View>
        {extra ? <Text style={s.ringCardNote}>{extra}</Text> : null}
        {item.status === 'completed' && item.completed_at ? (
          <Text style={s.ringCardSub}>Completed {stamp(item.completed_at)}</Text>
        ) : item.status === 'answered' && item.answered_at ? (
          <Text style={s.ringCardSub}>Replied {stamp(item.answered_at)}</Text>
        ) : (
          <Text style={s.ringCardSub}>Waiting for the SoWash team</Text>
        )}
      </View>
    );
  };

  return (
    <KeyboardScreen style={s.screen}>
      <ChatBackground />

      <ChatHeaderBar>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={8}>
          <ChevronLeft size={24} color="#fff" />
        </TouchableOpacity>
        <View style={[s.headerAvatar, { backgroundColor: colorFor(name, SITE_TINTS) }]}>
          <Text style={s.headerAvatarText}>{initial(name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.threadTitleOnColor} numberOfLines={1}>
            {name}
          </Text>
          <Text style={s.statusTextOnColor}>
            {waitingCount > 0
              ? `${waitingCount} ring${waitingCount === 1 ? '' : 's'} waiting`
              : 'Ring history'}
          </Text>
        </View>
      </ChatHeaderBar>

      {loading && rings.length === 0 ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : (
        <FlatList
          data={rings}
          keyExtractor={(r) => String(r.id)}
          renderItem={renderRing}
          style={{ flex: 1 }}
          contentContainerStyle={s.ringList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <View style={[s.emptyIcon, { backgroundColor: `${accent}14` }]}>
                <Bell size={24} color={accent} />
              </View>
              <Text style={s.emptyTitle}>{error ? 'Could not load rings' : 'No rings yet'}</Text>
              <Text style={s.emptyBody}>
                {error ||
                  `Ring the SoWash team about ${name} and it will be listed here, so you can see when it is answered and completed.`}
              </Text>
            </View>
          }
          ListFooterComponent={
            <TouchableOpacity style={s.generalLink} onPress={onOpenGeneral} activeOpacity={0.8}>
              <MessagesSquare size={15} color={accent} />
              <Text style={[s.generalLinkText, { color: accent }]}>
                Need to chat or send a photo? Open General
              </Text>
            </TouchableOpacity>
          }
        />
      )}

      <View style={[s.ringComposer, { paddingBottom: 10 + TAB_BAR_CLEARANCE }]}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a note (optional)"
          placeholderTextColor={palette.mutedLight}
          style={s.ringNoteInput}
          maxLength={200}
        />
        <TouchableOpacity
          onPress={sendRing}
          disabled={sending || onCooldown}
          activeOpacity={0.85}
          style={[s.ringMainBtn, { backgroundColor: onCooldown ? palette.border : GREEN_STOPS.mid }]}
        >
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <Bell size={18} color="#fff" />}
          <Text style={s.ringMainText}>{onCooldown ? 'Ring sent — wait a minute' : `Ring about ${name}`}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardScreen>
  );
}

/* ==================================================================== *
 * Thread
 * ==================================================================== */

function ChatThread({
  site,
  attach,
  onBack,
}: {
  site: SiteLike | null;
  /** A visit to link to the next message (from "Attach in chat" on a long-pressed visit). */
  attach?: JobSummary | null;
  onBack: () => void;
}) {
  const { accent } = useAccent();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myUserId = user?.id;
  const {
    messages,
    reactions,
    loading,
    error,
    sending,
    send,
    retry,
    discard,
    react,
    agentTyping,
    agentTypingName,
    notifyTyping,
    stopTyping,
  } = useChat(myUserId);

  // Long-press a message → the reaction pill (see ReactionOverlay).
  const [actionTarget, setActionTarget] = useState<{ message: ChatMessage; rect: ActionRect } | null>(null);
  const reactionsByMessage = useMemo(() => {
    const map = new Map<number, TeamReaction[]>();
    for (const r of reactions) {
      const list = map.get(r.message_id);
      if (list) list.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);
  // Stable identity — Bubble is React.memo, a fresh function per render would
  // re-render every bubble on every keystroke.
  const openActions = useCallback(
    (m: ChatMessage, rect: ActionRect) => setActionTarget({ message: m, rect }),
    [],
  );

  const onDraftChange = (text: string) => {
    setDraft(text);
    if (text.trim().length > 0) notifyTyping();
    else stopTyping();
  };

  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<ChatPhotoInput | null>(null);
  // ── reply (swipe right on a message, or long-press → Reply) ──
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const startReply = useCallback((m: ChatMessage) => {
    setReplyTo(m);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);
  const replyRef = (m: ChatMessage): TeamReplyRef => ({
    id: m.id,
    sender_name: isMine(m, myUserId) ? 'You' : m.sender_name || (m.sender_kind === 'agent' ? 'SoWash' : 'Colleague'),
    body: m.body,
    has_photo: !!m.attachment_url,
  });
  const [tagId, setTagId] = useState<number | null>(attach?.schedule_id ?? null);
  const [tagOpen, setTagOpen] = useState(false);
  // The attached visit itself — it may not be in the picker's own (latest 20) list.
  const [attachedJob, setAttachedJob] = useState<JobSummary | null>(attach ?? null);
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (!attach) return;
    setAttachedJob(attach);
    setTagId(attach.schedule_id);
    // straight to typing, like a WhatsApp reply
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [attach]);

  const [ringing, setRinging] = useState(false);
  const [ringCooldownUntil, setRingCooldownUntil] = useState(0);
  const [ringToast, setRingToast] = useState(false);
  const ringPulse = useRef(new Animated.Value(0)).current;
  const toastFade = useRef(new Animated.Value(0)).current;

  const listRef = useRef<FlatList<Row>>(null);
  const chatScroll = useChatScroll(listRef, true, undefined, messages.length > 0);

  // Visit picker IS genuinely scoped to the tapped site — useJobs already
  // supports siteId elsewhere in the app.
  const visits = useJobs({ scope: 'all', siteId: site?.id ?? undefined, limit: 20 });
  const visitList = useMemo(() => visits.data?.jobs ?? [], [visits.data]);
  const taggedVisit = useMemo(
    () =>
      visitList.find((v) => v.schedule_id === tagId) ??
      (attachedJob && attachedJob.schedule_id === tagId ? attachedJob : null),
    [visitList, tagId, attachedJob],
  );

  const rows = useMemo(() => buildRows(messages), [messages]);
  const jumpTo = useCallback(
    (messageId: number) => {
      const index = rows.findIndex((r) => r.kind !== 'separator' && r.message.id === messageId);
      if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
    },
    [rows],
  );

  const isActive = useMemo(() => {
    const lastAgent = [...messages].reverse().find((m) => m.sender_kind !== 'customer');
    return !!lastAgent && Date.now() - new Date(lastAgent.created_at).getTime() < ACTIVE_WINDOW_MS;
  }, [messages]);

  const ringOnCooldown = Date.now() < ringCooldownUntil;

  useEffect(() => {
    if (!ringing) return;
    const loop = Animated.loop(
      Animated.timing(ringPulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    ringPulse.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [ringing, ringPulse]);

  const showToast = useCallback(() => {
    setRingToast(true);
    toastFade.setValue(0);
    Animated.sequence([
      Animated.timing(toastFade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(toastFade, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start(() => setRingToast(false));
  }, [toastFade]);

  const ringSupport = async () => {
    if (ringing || ringOnCooldown) return;
    setRinging(true);
    const about = site?.site_name ? ` about ${site.site_name}` : '';
    const ok = await send({
      body: `🔔 Ringing${about} — I'd like to talk to someone when you're free.`,
      photo: null,
      scheduleId: null,
      siteId: site?.id ?? null,
      siteName: site?.site_name ?? null,
    });
    setRinging(false);
    if (ok) {
      setRingCooldownUntil(Date.now() + RING_COOLDOWN_MS);
      showToast();
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  };

  const pickPhoto = () => promptChatPhotoSource(setPhoto);

  const onSend = async () => {
    const ok = await send({
      body: draft,
      photo,
      scheduleId: tagId,
      siteId: site?.id ?? null,
      siteName: site?.site_name ?? null,
      replyTo: replyTo ? replyRef(replyTo) : null,
    });
    if (!ok) return;
    setDraft('');
    setPhoto(null);
    setTagId(null);
    setReplyTo(null);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  // Voice note: hold the mic, release to send (src/voiceRecorder.tsx). Sent straight away, like
  // WhatsApp — it carries the current reply / linked visit but not the typed draft.
  const voice = useVoiceHold(async (file) => {
    const ok = await send({
      body: '',
      photo: file,
      scheduleId: tagId,
      siteId: site?.id ?? null,
      siteName: site?.site_name ?? null,
      replyTo: replyTo ? replyRef(replyTo) : null,
    });
    if (!ok) return;
    setTagId(null);
    setReplyTo(null);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  });

  const canSend = (draft.trim().length > 0 || !!photo) && !sending;
  const composerClearance = 10 + TAB_BAR_CLEARANCE;

  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.4, 0.1, 0] });

  const headerName = site?.site_name || 'General';
  const headerColor = site ? colorFor(headerName, SITE_TINTS) : '#0f172a';

  return (
    <KeyboardScreen style={s.screen}>
      <ChatBackground />

      {/* ── Header ───────────────────────────────────────────────── */}
      <ChatHeaderBar>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={8}>
          <ChevronLeft size={24} color="#fff" />
        </TouchableOpacity>

        <View style={[s.headerAvatar, { backgroundColor: headerColor }]}>
          {site ? (
            <Text style={s.headerAvatarText}>{initial(headerName)}</Text>
          ) : (
            <Users size={18} color="#fff" />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.threadTitleOnColor} numberOfLines={1}>
            {headerName}
          </Text>
          {agentTyping ? (
            <Text style={s.statusTextOnColor}>
              {agentTypingName ? `${agentTypingName} is typing…` : 'Support is typing…'}
            </Text>
          ) : (
            <View style={s.statusRow}>
              <View style={[s.statusDot, { backgroundColor: isActive ? '#4ade80' : 'rgba(255,255,255,0.5)' }]} />
              <Text style={s.statusTextOnColor}>{isActive ? 'Active now' : 'Away — ring to notify'}</Text>
            </View>
          )}
        </View>

        <View style={s.ringSlot}>
          {ringing ? (
            <Animated.View
              pointerEvents="none"
              style={[s.ringPulse, { backgroundColor: '#fff', opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
            />
          ) : null}
          <TouchableOpacity
            onPress={ringSupport}
            disabled={ringing || ringOnCooldown}
            activeOpacity={0.8}
            style={[s.ringBtn, { backgroundColor: ringOnCooldown ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.24)' }]}
          >
            {ringing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Bell size={19} color={ringOnCooldown ? 'rgba(255,255,255,0.5)' : '#fff'} />
            )}
          </TouchableOpacity>
        </View>
      </ChatHeaderBar>

      {ringToast ? (
        <Animated.View style={[s.toast, { opacity: toastFade }]} pointerEvents="none">
          <Bell size={13} color="#fff" />
          <Text style={s.toastText}>Support has been notified</Text>
        </Animated.View>
      ) : null}

      {loading && messages.length === 0 ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : error && messages.length === 0 ? (
        <View style={s.centre}>
          <View style={s.emptyCard}>
            <CircleAlert size={22} color={palette.danger} />
            <Text style={s.emptyTitle}>Could not load</Text>
            <Text style={s.emptyBody}>{error}</Text>
          </View>
        </View>
      ) : messages.length === 0 ? (
        <View style={s.centre}>
          <View style={s.emptyCard}>
            <View style={[s.emptyIcon, { backgroundColor: `${accent}14` }]}>
              <MessagesSquare size={24} color={accent} />
            </View>
            <Text style={s.emptyTitle}>Talk to SoWash</Text>
            <Text style={s.emptyBody}>
              Ask about a visit, report an issue at a site, or send a photo — or ring the bell above
              to flag that you need a hand.
            </Text>
          </View>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={(r) => r.key}
          style={[{ flex: 1 }, chatScroll.hiddenStyle]}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={chatScroll.onContentSizeChange}
          initialNumToRender={60}
          maxToRenderPerBatch={60}
          windowSize={31}
          removeClippedSubviews={false}
          // Variable bubble heights: estimate, then retry once layout catches up (quote → jump).
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.4 }), 120);
          }}
          renderItem={({ item }) =>
            item.kind === 'separator' ? (
              <View style={s.daySep}>
                <View style={s.daySepLine} />
                <Text style={s.daySepText}>{item.label}</Text>
                <View style={s.daySepLine} />
              </View>
            ) : (
              <Bubble
                message={item.message}
                accent={accent}
                showAvatar={item.showAvatar}
                showName={item.showName}
                myUserId={myUserId}
                reactions={reactionsByMessage.get(item.message.id)}
                onRetry={retry}
                onDiscard={discard}
                onActions={openActions}
                onReply={startReply}
                onJumpTo={jumpTo}
              />
            )
          }
        />
      )}

      {actionTarget ? (
        <ReactionOverlay
          rect={actionTarget.rect}
          accent={accent}
          mine={isMine(actionTarget.message, myUserId)}
          myEmoji={
            reactions.find((r) => r.message_id === actionTarget.message.id && r.user_id === myUserId)?.emoji ?? null
          }
          renderMessage={() => (
            <Bubble
              message={actionTarget.message}
              accent={accent}
              showAvatar
              showName
              myUserId={myUserId}
              reactions={reactionsByMessage.get(actionTarget.message.id)}
              onRetry={() => {}}
              onDiscard={() => {}}
              onActions={() => {}}
            />
          )}
          onReply={() => {
            startReply(actionTarget.message);
            setActionTarget(null);
          }}
          onReact={(emoji) => {
            react(actionTarget.message.id, emoji);
            setActionTarget(null);
          }}
          onClose={() => setActionTarget(null)}
        />
      ) : null}

      {/* ── Composer — WhatsApp-style rounded pill ──────────────────── */}
      <View style={[s.composerWrap, { paddingBottom: composerClearance }]}>
        {error && messages.length > 0 ? <Text style={s.sendError}>{error}</Text> : null}

        {replyTo ? (
          <View style={[s.replyBar, { borderLeftColor: accent }]}>
            <Reply size={15} color={accent} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.quoteName, { color: accent }]} numberOfLines={1}>
                Replying to {isMine(replyTo, myUserId) ? 'yourself' : replyTo.sender_name || 'SoWash'}
              </Text>
              <Text style={[s.quoteBody, { color: palette.muted }]} numberOfLines={1}>
                {replyTo.body || (replyTo.attachment_url ? attachmentLabel(replyTo.attachment_name || replyTo.attachment_url) : 'Message')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={10} accessibilityLabel="Cancel reply">
              <X size={16} color={palette.muted} />
            </TouchableOpacity>
          </View>
        ) : null}

        {(photo || taggedVisit) ? (
          <View style={s.attachRow}>
            {photo ? (
              <View style={s.attachChip}>
                {mediaKind(photo.name || photo.uri) === 'video' ? (
                  <Video size={16} color={palette.muted} />
                ) : (
                  <Image source={{ uri: photo.uri }} style={s.attachThumb} />
                )}
                <Text style={s.attachText} numberOfLines={1}>
                  {mediaKind(photo.name || photo.uri) === 'video' ? 'Video' : photo.name || 'Photo'}
                </Text>
                <TouchableOpacity onPress={() => setPhoto(null)} hitSlop={8}>
                  <X size={14} color={palette.muted} />
                </TouchableOpacity>
              </View>
            ) : null}

            {taggedVisit ? (
              // WhatsApp-style "replying to" card: what this message will be linked to
              <View style={[s.visitAttach, { borderLeftColor: accent }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.visitAttachLabelRow}>
                    <CalendarDays size={12} color={accent} />
                    <Text style={[s.visitAttachLabel, { color: accent }]}>Linked visit</Text>
                  </View>
                  <Text style={s.visitAttachSite} numberOfLines={1}>
                    {taggedVisit.site_name || 'Site'}
                  </Text>
                  <Text style={s.visitAttachMeta} numberOfLines={1}>
                    {formatDateOnly(taggedVisit.scheduled_date)}
                    {taggedVisit.service_number != null && String(taggedVisit.service_number) !== ''
                      ? ` · Service #${taggedVisit.service_number}`
                      : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setTagId(null)} hitSlop={10} accessibilityLabel="Remove linked visit">
                  <X size={16} color={palette.muted} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={s.composerRow}>
          {voice.recording ? (
            <VoiceRecordingBar seconds={voice.seconds} cancelling={voice.cancelling} />
          ) : (
          <View style={s.pill}>
            <TouchableOpacity onPress={pickPhoto} style={s.pillIcon} hitSlop={4}>
              <ImagePlus size={19} color={palette.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setTagOpen(true)}
              style={s.pillIcon}
              hitSlop={4}
              disabled={visitList.length === 0}
            >
              <CalendarDays size={19} color={visitList.length === 0 ? palette.border : (!!tagId ? accent : palette.muted)} />
            </TouchableOpacity>

            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={onDraftChange}
              placeholder={taggedVisit ? 'Write about this visit…' : 'Message SoWash…'}
              placeholderTextColor={palette.mutedLight}
              style={s.pillInput}
              multiline
            />
          </View>
          )}

          {canSend && !voice.recording ? (
            <TouchableOpacity
              onPress={onSend}
              style={[s.sendBtn, { backgroundColor: accent }]}
            >
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={18} color="#fff" />}
            </TouchableOpacity>
          ) : (
            // Nothing to send → the mic: HOLD to record, release to send, slide left to cancel.
            <View
              {...voice.panHandlers}
              accessibilityLabel="Hold to record a voice message"
              style={[s.sendBtn, { backgroundColor: voice.cancelling ? '#dc2626' : accent, transform: [{ scale: voice.recording ? 1.2 : 1 }] }]}
            >
              <Mic size={20} color="#fff" />
            </View>
          )}
        </View>
      </View>

      {/* ── Visit tag picker ─────────────────────────────────────── */}
      <Modal visible={tagOpen} transparent animationType="slide" onRequestClose={() => setTagOpen(false)}>
        <Pressable style={s.sheetWrap} onPress={() => setTagOpen(false)}>
          <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>Tag a visit</Text>
            <Text style={s.sheetSub}>
              Attach this message to a specific visit so the team knows what it is about.
            </Text>

            <FlatList
              data={visitList}
              keyExtractor={(v) => String(v.schedule_id)}
              style={{ maxHeight: 340 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={s.sheetRow}
                  onPress={() => {
                    setTagId(item.schedule_id);
                    setTagOpen(false);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.sheetRowTitle} numberOfLines={1}>
                      {item.site_name || 'Site'}
                    </Text>
                    <Text style={s.sheetRowSub}>
                      {formatDateOnly(item.scheduled_date)} · {item.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity style={s.sheetCancel} onPress={() => setTagOpen(false)}>
              <Text style={s.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardScreen>
  );
}

const Bubble = React.memo(function Bubble({
  message,
  accent,
  showAvatar,
  showName,
  myUserId,
  reactions,
  onRetry,
  onDiscard,
  onActions,
  onReply,
  onJumpTo,
}: {
  message: ChatMessage;
  accent: string;
  showAvatar: boolean;
  showName: boolean;
  myUserId: number | undefined;
  reactions?: TeamReaction[];
  onRetry: (localId: number) => void;
  onDiscard: (localId: number) => void;
  onActions: (message: ChatMessage, rect: ActionRect) => void;
  /** Swipe right → reply (omitted for the copy drawn inside the long-press overlay). */
  onReply?: (message: ChatMessage) => void;
  onJumpTo?: (messageId: number) => void;
}) {
  const mine = isMine(message, myUserId);
  const url = (message.pending || message.failed) && message.localPhotoUri ? message.localPhotoUri : photoUrl(message.attachment_url);
  const name = message.sender_name || 'SoWash';
  const photoSize = usePhotoBubbleSize();
  const rowRef = useRef<View>(null);
  const hasReactions = !!reactions && reactions.length > 0;

  const counts = (reactions ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});
  const myReaction = (reactions ?? []).find((r) => r.user_id === myUserId)?.emoji;

  // Swipe-right-to-reply, the same gesture as the staff Team chat (app/staff/chats.tsx): RNGH's
  // classic PanGestureHandler + native-driven Animated, horizontal-only so the list keeps its
  // vertical scroll.
  const swipeX = useRef(new Animated.Value(0)).current;
  const SWIPE_TRIGGER = 56;
  const canReply = !!onReply && message.id > 0 && !message.pending && !message.failed;
  const onSwipe = useRef(Animated.event([{ nativeEvent: { translationX: swipeX } }], { useNativeDriver: true })).current;
  const swipeShift = swipeX.interpolate({ inputRange: [0, 80], outputRange: [0, 80], extrapolate: 'clamp' });
  const onSwipeState = (e: { nativeEvent: { state: number; translationX: number } }) => {
    const { state, translationX } = e.nativeEvent;
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      if (state === State.END && translationX >= SWIPE_TRIGGER) onReply?.(message);
      Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, bounciness: 6 }).start();
    }
  };

  return (
    <View ref={rowRef} collapsable={false}>
      <Animated.View
        pointerEvents="none"
        style={[
          s.swipeHint,
          {
            opacity: swipeX.interpolate({ inputRange: [0, SWIPE_TRIGGER], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ scale: swipeX.interpolate({ inputRange: [0, SWIPE_TRIGGER], outputRange: [0.6, 1], extrapolate: 'clamp' }) }],
          },
        ]}
      >
        <Reply size={16} color={palette.muted} />
      </Animated.View>
      <PanGestureHandler
        enabled={canReply}
        activeOffsetX={14}
        failOffsetX={-14}
        failOffsetY={[-12, 12]}
        onGestureEvent={onSwipe}
        onHandlerStateChange={onSwipeState}
      >
      <Animated.View style={{ transform: [{ translateX: swipeShift }] }}>
      <View style={[s.bubbleLine, { justifyContent: mine ? 'flex-end' : 'flex-start', opacity: message.pending ? 0.6 : 1 }]}>
        {!mine ? (
          showAvatar ? (
            <View style={[s.avatar, { backgroundColor: colorFor(name, AVATAR_COLORS) }]}>
              <Text style={s.avatarText}>{initial(name)}</Text>
            </View>
          ) : (
            <View style={s.avatarSpacer} />
          )
        ) : null}

        <TouchableOpacity
          activeOpacity={0.95}
          // Local (negative-id) bubbles have no server id to react to yet.
          onLongPress={
            message.id > 0
              ? () => rowRef.current?.measureInWindow((x, y, w, h) => onActions(message, { x, y, w, h }))
              : undefined
          }
          delayLongPress={300}
          style={[
            s.bubble,
            mine ? { backgroundColor: accent, borderBottomRightRadius: 6 } : [s.bubbleTheirs, { borderBottomLeftRadius: 6 }],
            hasReactions ? { marginBottom: 14 } : null,
          ]}
        >
          {mine ? (
            <LinearGradient
              pointerEvents="none"
              colors={[shade(accent, 0.12), shade(accent, -0.14)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.bubbleGradient}
            />
          ) : null}
          {!mine && showName && message.sender_name ? (
            <Text style={[s.sender, { color: accent }]}>{message.sender_name}</Text>
          ) : null}

          {message.reply_to ? (
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!onJumpTo}
              onPress={() => onJumpTo?.(message.reply_to!.id)}
              style={[s.quote, mine ? s.quoteMine : s.quoteTheirs, { borderLeftColor: mine ? '#fff' : accent }]}
            >
              <Text style={[s.quoteName, { color: mine ? '#fff' : accent }]} numberOfLines={1}>
                {message.reply_to.sender_name || 'SoWash'}
              </Text>
              <Text style={[s.quoteBody, { color: mine ? '#ffffffcc' : palette.muted }]} numberOfLines={2}>
                {message.reply_to.body || (message.reply_to.has_photo ? '📷 Photo' : 'Message')}
              </Text>
            </TouchableOpacity>
          ) : null}

          {message.site_name ? (
            <View style={[s.siteChip, mine ? s.siteChipMine : s.siteChipTheirs]}>
              <MapPin size={11} color={mine ? '#fff' : accent} />
              <Text style={[s.siteChipText, { color: mine ? '#fff' : accent }]} numberOfLines={1}>
                {message.site_name}
              </Text>
            </View>
          ) : null}

          {message.visit ? <ChatVisitCard visit={message.visit} mine={mine} /> : null}

          {url && mediaKind(message.attachment_name || url) !== 'image' ? (
            <ChatAttachment
              url={url}
              name={message.attachment_name}
              createdAt={message.created_at}
              mine={mine}
              accent={accent}
              sending={message.pending || message.failed}
            />
          ) : url ? (
            <Image source={{ uri: url }} style={[s.photo, photoSize]} contentFit="cover" />
          ) : null}

          {message.body ? (
            <Text style={[s.text, mine ? { color: '#fff' } : { color: palette.ink }]}>{message.body}</Text>
          ) : null}

          <View style={s.timeRow}>
            <Text style={[s.time, { marginTop: 0, alignSelf: 'auto' }, mine ? { color: '#ffffffaa' } : { color: palette.mutedLight }]}>
              {formatTime(message.created_at)}
            </Text>
            {message.failed ? (
              <CircleAlert size={13} color="#ffd6d6" />
            ) : message.pending ? (
              <Clock size={12} color="#ffffffaa" />
            ) : null}
          </View>

          {hasReactions ? (
            <View style={[s.reactionRow, mine ? { right: 10 } : { left: 10 }]}>
              {Object.entries(counts).map(([emoji, count]) => (
                <View
                  key={emoji}
                  style={[s.reactionChip, myReaction === emoji && { borderColor: accent, backgroundColor: accent + '14' }]}
                >
                  <Text style={s.reactionEmoji}>{emoji}</Text>
                  {count > 1 ? <Text style={s.reactionCount}>{count}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

          {message.failed ? (
            <View style={s.failedRow}>
              <Text style={s.failedText}>Not sent</Text>
              <TouchableOpacity onPress={() => onRetry(message.id)} hitSlop={8}>
                <Text style={s.failedAction}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDiscard(message.id)} hitSlop={8}>
                <Text style={s.failedAction}>Delete</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>
      </Animated.View>
      </PanGestureHandler>
    </View>
  );
});

/**
 * Long-press menu: the page dims, the pressed message floats where it was,
 * and a pill of quick reactions sits next to it. In-screen (not a Modal) —
 * positions are converted from window coordinates using this view's own
 * measured window origin. Same behaviour as the staff app's overlay in
 * app/staff/chats.tsx, minus the "+" picker; Reply is the round button at the end of the pill.
 */
function ReactionOverlay({
  rect,
  accent,
  mine,
  myEmoji,
  renderMessage,
  onReact,
  onReply,
  onClose,
}: {
  rect: ActionRect;
  accent: string;
  mine: boolean;
  myEmoji: string | null;
  renderMessage: () => React.ReactNode;
  onReact: (emoji: string) => void;
  /** Adds a Reply button to the menu. */
  onReply?: () => void;
  onClose: () => void;
}) {
  const rootRef = useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const pop = useRef(new Animated.Value(0)).current;
  const emojiPops = useRef(QUICK_REACTIONS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 18 }).start();
    Animated.stagger(
      35,
      emojiPops.map((v) => Animated.spring(v, { toValue: 1, useNativeDriver: true, bounciness: 14, speed: 22 })),
    ).start();
  }, [pop, emojiPops]);

  const PILL_H = 58;
  let bubbleTop = 0;
  let pillTop = 0;
  if (origin) {
    bubbleTop = rect.y - origin.y;
    // Above the message when there's room, otherwise just below it.
    pillTop = bubbleTop >= PILL_H + 16 ? bubbleTop - PILL_H - 8 : bubbleTop + rect.h + 8;
  }

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={s.actionOverlay}
      onLayout={() => rootRef.current?.measureInWindow((x, y) => setOrigin({ x, y }))}
    >
      <TouchableOpacity style={s.actionBackdrop} activeOpacity={1} onPress={onClose} />

      {origin ? (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', left: rect.x - origin.x, top: bubbleTop, width: rect.w }}>
            {renderMessage()}
          </View>

          <Animated.View
            style={[
              s.reactionPill,
              mine ? { right: 12 } : { left: 12 },
              { top: pillTop, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
            ]}
          >
            {QUICK_REACTIONS.map((emoji, i) => (
              <Animated.View key={emoji} style={{ transform: [{ scale: emojiPops[i] }] }}>
                <TouchableOpacity
                  style={[s.pillBtn, myEmoji === emoji && { backgroundColor: accent + '1f', borderColor: accent + '66' }]}
                  activeOpacity={0.6}
                  onPress={() => onReact(emoji)}
                >
                  <Text style={s.pillEmoji}>{emoji}</Text>
                </TouchableOpacity>
              </Animated.View>
            ))}
            {onReply ? (
              <TouchableOpacity style={s.pillReply} activeOpacity={0.7} onPress={onReply} accessibilityLabel="Reply">
                <Reply size={20} color={accent} />
              </TouchableOpacity>
            ) : null}
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
};

const AVATAR = 28;

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f8ff' },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.5 },

  // Coloured list / thread headers (see ChatHeaderBar)
  listTitle: { fontSize: 26, fontWeight: '900', color: '#fff' },
  listSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.95)' },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  threadTitleOnColor: { fontSize: 17, fontWeight: '900', color: '#fff' },
  statusTextOnColor: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.95)' },

  // Site list header (legacy, unused now)
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  title: { fontSize: 24, fontWeight: '900', color: palette.ink },
  headerSub: { fontSize: 12.5, fontWeight: '600', color: palette.mutedLight, marginTop: 3 },

  siteList: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 140, gap: 8 },
  siteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    marginBottom: 2,
    ...CARD_SHADOW,
  },
  siteAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  siteAvatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  siteName: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  siteSub: { fontSize: 12, fontWeight: '600', color: palette.mutedLight, marginTop: 2 },

  // Thread header
  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  threadAvatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  threadAvatarText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  threadTitle: { fontSize: 16.5, fontWeight: '900', color: palette.ink },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  statusText: { fontSize: 11.5, fontWeight: '700', color: palette.muted },

  ringSlot: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  ringPulse: { position: 'absolute', width: 42, height: 42, borderRadius: 21 },
  ringBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },

  toast: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0f172a',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toastText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },

  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyCard: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 30,
    paddingHorizontal: 22,
    maxWidth: 320,
    alignSelf: 'center',
    marginTop: 40,
    ...CARD_SHADOW,
  },
  emptyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', color: palette.ink, marginTop: 2 },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 19 },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },

  daySep: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14 },
  daySepLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  daySepText: { fontSize: 11, fontWeight: '800', color: palette.mutedLight, letterSpacing: 0.4 },

  bubbleLine: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 3, gap: 8 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  avatarSpacer: { width: AVATAR, marginBottom: 2 },

  bubble: {
    maxWidth: '80%',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 13,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  bubbleTheirs: { backgroundColor: '#fff', ...CARD_SHADOW },
  sender: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  text: { fontSize: 14.5, lineHeight: 21 },
  time: { fontSize: 10.5, fontWeight: '600', marginTop: 4, alignSelf: 'flex-end' },
  photo: { width: 200, height: 150, borderRadius: 14, marginBottom: 6 },
  bubbleGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22 },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  siteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 6,
    maxWidth: '100%',
  },
  siteChipMine: { backgroundColor: 'rgba(255,255,255,0.2)' },
  siteChipTheirs: { backgroundColor: 'rgba(0,0,0,0.05)' },
  siteChipText: { fontSize: 11, fontWeight: '800', flexShrink: 1 },

  // Reaction chips straddle the bubble's bottom edge (the bubble reserves
  // 14px for them); the chip border is the screen background so it reads as
  // notched out of the bubble.
  reactionRow: { position: 'absolute', bottom: -15, flexDirection: 'row', gap: 4 },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fff',
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#f6f8ff',
    paddingHorizontal: 6,
    paddingVertical: 1,
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  reactionEmoji: { fontSize: 14, lineHeight: 19 },
  reactionCount: { fontSize: 11, fontWeight: '800', color: palette.muted },
  actionOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 30, elevation: 30 },
  actionBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0b121ccc' },
  reactionPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    backgroundColor: '#fff',
    borderRadius: 29,
    paddingHorizontal: 8,
    gap: 2,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  pillBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillEmoji: { fontSize: 28, lineHeight: 34 },
  pillReply: {
    width: 42,
    height: 42,
    borderRadius: 21,
    marginLeft: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  // reply: the arrow that appears while swiping, the quote inside a bubble, the bar above the composer
  swipeHint: { position: 'absolute', left: 10, top: 0, bottom: 0, width: 30, justifyContent: 'center', alignItems: 'center' },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 6 },
  quoteMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
  quoteTheirs: { backgroundColor: 'rgba(0,0,0,0.05)' },
  quoteName: { fontSize: 12, fontWeight: '800' },
  quoteBody: { fontSize: 12.5, marginTop: 1 },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderLeftWidth: 3,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  failedRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  failedText: { fontSize: 11.5, fontWeight: '700', color: '#ffd6d6' },
  failedAction: { fontSize: 12, fontWeight: '800', color: '#fff', textDecorationLine: 'underline' },
  // The visit tag's styling lives in src/components/ChatVisitCard.tsx — it is
  // a preview card now, not a chip.

  // Site screen (ring history)
  ringList: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12, gap: 8 },
  ringCard: { backgroundColor: '#fff', borderRadius: 16, padding: 12, ...CARD_SHADOW },
  ringCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ringCardTime: { flex: 1, fontSize: 13, fontWeight: '800', color: palette.ink },
  ringPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  ringPillText: { fontSize: 11.5, fontWeight: '800' },
  ringCardNote: { fontSize: 13.5, color: palette.ink, marginTop: 8, lineHeight: 19 },
  ringCardSub: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 6 },
  generalLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  generalLinkText: { fontSize: 13, fontWeight: '800' },
  ringComposer: { paddingHorizontal: 14, paddingTop: 8, gap: 8 },
  ringNoteInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14.5,
    color: palette.ink,
  },
  ringMainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 15,
  },
  ringMainText: { color: '#fff', fontSize: 15, fontWeight: '800' },

  composerWrap: { paddingHorizontal: 12, paddingTop: 8 },
  sendError: { fontSize: 12, color: palette.danger, marginBottom: 6, paddingHorizontal: 6 },
  attachRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, paddingHorizontal: 2 },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e9edf5',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 220,
  },
  attachThumb: { width: 20, height: 20, borderRadius: 5 },
  attachText: { flex: 1, fontSize: 11.5, color: palette.inkSoft, fontWeight: '600' },
  // the linked visit above the composer (WhatsApp's reply preview)
  visitAttach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderLeftWidth: 4,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  visitAttachLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  visitAttachLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  visitAttachSite: { fontSize: 14, fontWeight: '800', color: palette.ink, marginTop: 2 },
  visitAttachMeta: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 1 },

  // Bordered, not a filled pill — matches the search/composer convention
  // used elsewhere in the app (white bg, thin border, moderate radius)
  // instead of a fully-rounded chat-app blob.
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 26,
    paddingLeft: 6,
    paddingRight: 8,
    minHeight: 50,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  pillIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  pillInput: {
    flex: 1,
    maxHeight: 110,
    fontSize: 15,
    color: palette.ink,
    paddingVertical: 10,
    paddingHorizontal: 2,
  },
  sendBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },

  sheetWrap: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: palette.ink },
  sheetSub: { fontSize: 12.5, color: palette.muted, marginTop: 4, marginBottom: 12, lineHeight: 18 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eef2f7' },
  sheetRowTitle: { fontSize: 14, fontWeight: '700', color: palette.ink },
  sheetRowSub: { fontSize: 12, color: palette.muted, marginTop: 2 },
  sheetCancel: { marginTop: 14, alignItems: 'center', paddingVertical: 12 },
  sheetCancelText: { fontSize: 14, fontWeight: '700', color: palette.muted },
});