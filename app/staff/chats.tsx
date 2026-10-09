// app/staff/chats.tsx — the office Chats tab, client-support half (Phase 4).
//
// An inbox → thread drill-down, the same shape as app/staff/jobs.tsx's
// client index → job list: ThreadList by default, ThreadView once a thread
// is tapped, switched in place (no route change), matching how
// app/(tabs)/support.tsx already does inbox → conversation for the client
// side of this exact feature.
//
// Talks to /api/commercial-chat/* (src/hooks.ts's useStaffChatThreads /
// useStaffChatThread / useStaffChatUnread) — the STAFF side of the same
// commercial_chat_* tables the client app's Support tab reads from the other
// direction. Gated server-side to ci_admin specifically (SUPPORT_ROLES in
// commercialChatRoutes.js), narrower than the general office-app role set —
// an operations/admin session will get a 403 here, which is expected, not a
// bug (see that file's own header comment for why).
//
// Internal staff-to-staff chat (Phase 5, DMs + groups between office users)
// is the second section below: a "Support"/"Team" switch at the top of the
// list screen, not a new tab (FloatingTabBar has no 6th slot) and not a new
// route (the Team thread view switches in place, same as ThreadView does for
// Support). Talks to /api/staff-chat/* — different tables, different role
// gate (any STAFF_ROLES member, not ci_admin-only), no visit tag, real-time
// via src/teamChatSocket.ts on top of the same polling this file's Support
// half already uses.
//
// NOT built yet, deliberately out of scope for this pass: the visit-tag
// picker on the Support composer (schedule_id tagging — send() already
// accepts it, just nothing in this UI sets it yet) and close-thread
// management for Support conversations.

import { useChatScroll } from '../../src/useChatScroll';
import { useChatSurface } from '../../src/chat-focus';
import KeyboardScreen from '../../src/components/KeyboardScreen';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
  Platform,
  StyleSheet,
  Pressable,
  AppState,
  BackHandler,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import ChatAttachment, { ChatPhoto } from '../../src/components/ChatAttachment';
import ZoomableImage from '../../src/components/ZoomableImage';
import { CameraPillButton } from '../../src/camera-capture';
import { DueBadge, DueBanner, TIMELINES, timelineMinutes, useNow } from '../../src/chatDue';
import { isChatAdmin } from '../../src/chatAdmins';
import { useVoiceHold, VoiceMicButton, VoiceRecordingBar } from '../../src/voiceRecorder';
import { mediaKind, attachmentLabel } from '../../src/chat-media';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// Not a new native dependency — expo-router/@react-navigation already pull
// this in for their own screen-transition gestures, so it's already
// compiled into the existing dev-client build; nothing here needs a new
// EAS build. Deliberately the classic ref/Animated-event API, not the
// newer Gesture/GestureDetector API those docs lead with now — that one
// wants Reanimated's worklets to work well, and this project's Reanimated
// install has no babel plugin wired up for it (see CLAUDE.md §6), same
// reason SldWalkthrough.tsx and the typing-dots bounce both use plain
// react-native Animated instead.
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  AtSign,
  CalendarDays,
  Check,
  CheckCheck,
  Plus,
  Reply,
  Trash2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  RotateCcw,
  Clock,
  ImagePlus,
  Mic,
  Video,
  Images,
  MessagesSquare,
  Pencil,
  MapPin,
  Search,
  Send,
  UserPlus,
  Users,
  X,
} from 'lucide-react-native';
import { palette } from '../../src/theme';
import { keep, ttc } from '../../src/themeEngine';
import { useAccent } from '../../src/theme-context';
import { photoUrl, errorMessage } from '../../src/api/client';
import { subscribeTeamSocket } from '../../src/teamChatSocket';
import {
  useStaffChatThreads,
  useStaffChatThread,
  useStaffChatThreadMeta,
  useStaffChatAgents,
  useStaffDirectory,
  useTeamConversations,
  useTeamConversation,
  startTeamDm,
  createTeamGroup,
  renameTeamGroup,
  updateTeamGroupMembers,
  formatDateOnly,
  formatDateTime,
  formatTime,
  statusMeta,
  ChatPhotoInput,
} from '../../src/hooks';
import {
  ChatMessage,
  ChatVisitTag,
  StaffChatAgent,
  StaffChatThread,
  StaffDirectoryUser,
  TeamConversation,
  TeamConversationDetail,
  TeamMessage,
  TeamReplyRef,
  TeamReaction,
  TeamParticipant,
} from '../../src/api/types';
import { useAuth } from '../../src/auth/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import ChatBackground from '../../src/components/ChatBackground';
import FadeInRow from '../../src/components/FadeInRow';
import PageHeader from '../../src/components/PageHeader';
import { mix, shade } from '../../src/utils/color';
import { BRAND_GREEN_MID, GREEN_STOPS } from '../../src/brand';
import ChatHeaderBar from '../../src/components/ChatHeaderBar';

// Neither inbox list has a delta/poll concept the way an open thread does
// (useStaffChatThreads/useTeamConversations are both plain one-shot
// useAsync loads) — without this, a new message's preview/unread badge
// never appears on the list screen until a manual pull-to-refresh, even
// though the thread VIEW itself already polls live. Same interval as
// CHAT_POLL_MS in src/hooks.ts, just re-fetching the whole list instead of
// a delta.
/** WhatsApp's default quick reactions. */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/** The "+" picker — a compact set of common emojis, no extra native dependency. */
const EXTRA_REACTIONS = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎',
  '🤩', '🥳', '😏', '😴', '🤔', '😮', '😢', '😭',
  '😡', '🤯', '😱', '🙄', '😅', '😉', '🤗', '😬',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👀',
  '🔥', '💯', '🎉', '✨', '❤️', '💔', '💙', '💚',
  '✅', '❌', '⚠️', '🚀', '☕', '🎯', '📌', '🙈',
];

const INBOX_POLL_MS = 5_000;

// Module-level, in-memory only — survives a thread's own component
// unmounting (ThreadView/TeamThreadView fully unmount when you back out to
// the list, per the full-screen-replace pattern this file uses throughout,
// so local useState alone loses whatever you were mid-typing). Keyed by
// thread/conversation id; cleared once that draft is actually sent. Never
// persisted to disk — an app restart clearing an unsent draft is an
// acceptable, expected loss, same as any other in-memory-only cache in
// this file (see teamConversationCache in src/hooks.ts for the same
// pattern applied to message data instead of composer text).
const supportDraftCache = new Map<number, string>();
const teamDraftCache = new Map<number, string>();

const TINTS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444', '#14b8a6'];
const initial = (name: string) => (name.trim()[0] || '?').toUpperCase();
function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

/**
 * Round avatar with a soft two-tone gradient of the name's colour — used in the
 * chat lists. `ring` draws an accent ring (unread); `group` adds a little
 * "people" badge on the corner so a group reads differently from a person.
 */
function ChatAvatar({
  name,
  size = 48,
  ring,
  group,
}: {
  name: string;
  size?: number;
  ring?: string;
  group?: boolean;
}) {
  const base = colorFor(name);
  const inner = (
    <LinearGradient
      colors={[shade(base, 0.14), shade(base, -0.2)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={s.avatarText}>{initial(name)}</Text>
    </LinearGradient>
  );
  return (
    <View>
      {ring ? (
        <View
          style={{
            padding: 2,
            borderRadius: (size + 4 + 4) / 2,
            borderWidth: 2,
            borderColor: ring,
          }}
        >
          {inner}
        </View>
      ) : (
        <View style={{ padding: 4 }}>{inner}</View>
      )}
      {group ? (
        <View style={s.avatarBadge}>
          <Users size={10} color={ttc('#0f172a')} />
        </View>
      ) : null}
    </View>
  );
}

type DayRow<T> =
  | { kind: 'header'; key: string; label: string }
  | { kind: 'row'; key: string; item: T };

/** Today / Yesterday / This week / Earlier, from a timestamp. */
function dayBucket(iso: string | null): string {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return 'This week';
  return 'Earlier';
}

/**
 * Interleave a heading row whenever the label changes. The lists are already
 * sorted newest-first (the Team list pins @-mentions first and gives them their
 * own label, so a pinned old conversation can't split a heading in two).
 */
function withHeadings<T extends { id: number }>(items: T[], labelOf: (item: T) => string): DayRow<T>[] {
  const rows: DayRow<T>[] = [];
  let last = '';
  for (const item of items) {
    const label = labelOf(item);
    if (label !== last) {
      rows.push({ kind: 'header', key: `h-${label}`, label });
      last = label;
    }
    rows.push({ kind: 'row', key: String(item.id), item });
  }
  return rows;
}

/**
 * A sent photo's size inside a bubble. `s.bubble` caps at 78% of the screen
 * width with 12px padding on each side — a fixed 200px photo (the old
 * value) exceeds that on a narrow phone (Samsung A10s-class, ~360dp), which
 * silently forces the bubble wider than its own maxWidth since nothing
 * clips it. 200 stays the ceiling on a typical/larger phone; it only shrinks
 * on a screen too narrow to fit it, with a floor so it's never tiny.
 */
function usePhotoBubbleSize() {
  const { width } = useWindowDimensions();
  const maxWidth = width * 0.78 - 24;
  const w = Math.min(200, Math.max(140, maxWidth));
  return { width: w, height: w * 0.75 };
}

/**
 * A bottom sheet (currently just AssignPicker — NewConversationSheet and
 * group management moved to full-screen views, see PeoplePickerView /
 * GroupInfoView below) needs an actual bounded height for its own
 * ScrollView to work at all — the
 * sheet's `s.sheet` style has none, so without this the sheet just grows to
 * fit all its content. A pixel value from useWindowDimensions (rather than a
 * '%' string) is deliberate: percentage heights only resolve reliably when
 * every ancestor in the chain also has an explicit height.
 *
 * Takes `keyboardHeight` and caps itself to what's ACTUALLY left above the
 * keyboard (plus the top safe area) once it's open — the sheet is pushed up
 * by exactly `keyboardHeight` (see sheetBackdrop's inline paddingBottom), so
 * if this cap doesn't ALSO account for that, the two numbers can drift
 * apart: the sheet ends up wanting more room than the pushed-up backdrop
 * actually has, and whatever's at the sheet's own top (the results box,
 * since that now renders first) gets shoved above the visible screen
 * instead of just being shorter.
 */
function useSheetMaxHeight(keyboardHeight: number) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cap = Math.min(560, height * 0.8);
  if (keyboardHeight === 0) return cap;
  return Math.min(cap, height - keyboardHeight - insets.top - 20);
}

/** Real, measured keyboard height — 0 while it's closed. */
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return height;
}

/**
 * These three sheets stopped being a react-native <Modal> (see
 * sheetOverlay's own comment for why) — which means the Android hardware
 * back button no longer closes them for free the way a real Modal's
 * onRequestClose did. This restores that behavior manually.
 */
function useSheetBackButton(onClose: () => void) {
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);
}

/**
 * WhatsApp's full three-state tick for a message I sent:
 *   'sent'      — single grey check. Landed on the server, nothing more known.
 *   'delivered' — double grey check. EVERY other participant's
 *                 last_delivered_at is at or past this message's created_at
 *                 (their client has actually fetched it — see GET
 *                 .../messages in staffChatRoutes.js) but at least one
 *                 hasn't necessarily opened the conversation yet.
 *   'seen'      — double BLUE check. EVERY other participant's last_read_at
 *                 is at or past created_at (a group only turns blue once
 *                 everyone's read it, same as WhatsApp's own default).
 * No separate receipts table for either state: last_delivered_at/
 * last_read_at are the same per-participant "high water mark" columns
 * GET /unread and GET .../messages already write, just compared
 * client-side. Returns null for a message that isn't mine — no tick
 * renders for a received message, matching the convention everywhere else
 * this pattern exists.
 */
function messageSeenStatus(
  message: TeamMessage,
  conversation: TeamConversationDetail | null,
  myUserId: number | undefined,
  mine: boolean,
): 'sent' | 'delivered' | 'seen' | null {
  if (!mine || !conversation) return null;
  const others = conversation.participants.filter((p) => p.id !== myUserId);
  if (others.length === 0) return null;
  const sentAt = new Date(message.created_at).getTime();
  const pastSentAt = (value: string | null) => value != null && new Date(value).getTime() >= sentAt;
  if (others.every((p) => pastSentAt(p.last_read_at))) return 'seen';
  if (others.every((p) => pastSentAt(p.last_delivered_at))) return 'delivered';
  return 'sent';
}

/** Shared by AssignPicker and the @-mention picker — match by name or email, case-insensitive. */
function filterAgents(agents: StaffChatAgent[], query: string): StaffChatAgent[] {
  const q = query.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter(
    (a) => (a.name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q),
  );
}

/** Same filter, for the Team directory (GET /staff-chat/directory) — a distinct type, same shape. */
function filterDirectory(users: StaffDirectoryUser[], query: string): StaffDirectoryUser[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter(
    (u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q),
  );
}

/** "3:45 PM" today, "4 Sep" otherwise — inbox rows don't need a full timestamp. */
function relativeStamp(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? formatTime(value) : formatDateOnly(value);
}

/**
 * WhatsApp-style "last seen …" line for a DM header — only meaningful when
 * the other participant isn't currently online (TeamThreadView shows
 * "Online" instead in that case). `last_seen_at` is written once, at the
 * exact moment their last staff-chat socket closes (services/
 * staffChatSocket.js), so this is never continuously updated while they're
 * connected — it's a single frozen moment, same as WhatsApp's own.
 */
function lastSeenLabel(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();

  // A clock time, not a relative "Xm ago" — matches what WhatsApp's own
  // last-seen line actually shows (it never says "5 minutes ago"), and
  // it's more useful anyway: "today at 2:34 PM" tells you something an
  // ever-changing relative count doesn't (a fixed value that doesn't need
  // to keep re-rendering to stay accurate as time passes).
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `last seen today at ${formatTime(value)}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `last seen yesterday at ${formatTime(value)}`;

  return `last seen ${formatDateOnly(value)}`;
}

/**
 * "You: " only when the CURRENT viewer sent it — otherwise the specific
 * colleague's name, e.g. "Zain: ". Previously this just checked
 * last_sender_kind === 'agent' and always showed "You:", which was wrong
 * the moment more than one agent role could answer the same inbox
 * (SUPPORT_ROLES widened past ci_admin-only). A customer- or system-sent
 * preview gets no prefix — the system message text already names who did
 * what.
 */
function agentPreviewPrefix(thread: StaffChatThread, myUserId: number | undefined): string {
  if (thread.last_sender_kind !== 'agent') return '';
  if (myUserId != null && thread.last_sender_user_id === myUserId) return 'You: ';
  return thread.last_sender_name ? `${thread.last_sender_name}: ` : '';
}

/** Same idea for a Team conversation — every sender here is staff, so there's no sender_kind to check first. */
function teamPreviewPrefix(conversation: TeamConversation, myUserId: number | undefined): string {
  if (conversation.last_sender_user_id == null) return '';
  if (myUserId != null && conversation.last_sender_user_id === myUserId) return 'You: ';
  return conversation.last_sender_name ? `${conversation.last_sender_name}: ` : '';
}

/** The top of both list screens — a coloured title bar with a Support / Team switch. */
function ChatsHeader({
  section,
  onChangeSection,
  unread = 0,
  mentions = 0,
}: {
  section: 'support' | 'team';
  onChangeSection: (section: 'support' | 'team') => void;
  /** Conversations with something unread — shown as a live chip in the header. */
  unread?: number;
  /** Unread @-mentions of me. */
  mentions?: number;
}) {
  const { accent } = useAccent();
  return (
    <ChatHeaderBar
      rounded
      style={{ flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: 20, paddingBottom: 16, gap: 2 }}
    >
      <Text style={s.listTitle}>Chats</Text>
      <Text style={s.listSub}>
        {section === 'support' ? 'Client support conversations' : 'Talk with your colleagues'}
      </Text>
      <View style={s.statRow}>
        <View style={s.statChip}>
          <Text style={s.statChipText}>{unread > 0 ? `●  ${unread} unread` : '✓  All caught up'}</Text>
        </View>
        {mentions > 0 ? (
          <View style={[s.statChip, { backgroundColor: 'rgba(255,255,255,0.95)' }]}>
            <Text style={[s.statChipText, { color: palette.danger }]}>
              @  {mentions} mention{mentions === 1 ? '' : 's'}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={s.segment}>
        {(['support', 'team'] as const).map((sec) => {
          const active = sec === section;
          return (
            <TouchableOpacity
              key={sec}
              onPress={() => onChangeSection(sec)}
              style={[s.segmentBtn, active && s.segmentBtnOn]}
              activeOpacity={0.85}
            >
              <Text style={[s.segmentText, active && { color: accent }]}>
                {sec === 'support' ? 'Support' : 'Team'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ChatHeaderBar>
  );
}

export default function StaffChatsScreen() {
  // A team_message push lands here via notificationTarget() in src/hooks.ts
  // as /staff/chats?team=<conversationId> — this screen has no per-
  // conversation route, so a query param is how a tap from the tray opens
  // the right conversation instead of just the Team list.
  const params = useLocalSearchParams<{ team?: string }>();

  const [section, setSection] = useState<'support' | 'team'>('support');
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [activeThreadName, setActiveThreadName] = useState<string>('');
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);

  useEffect(() => {
    const id = params.team ? Number(params.team) : null;
    if (id && Number.isFinite(id)) {
      setSection('team');
      setActiveConversationId(id);
    }
  }, [params.team]);

  // A chat is open → hide the tab bar and make Android back return to the list (not Overview).
  useChatSurface(section === 'team' ? !!activeConversationId : !!activeThreadId, () => {
    if (section === 'team') setActiveConversationId(null);
    else setActiveThreadId(null);
  });

  if (section === 'team') {
    if (activeConversationId) {
      return <TeamThreadView conversationId={activeConversationId} onBack={() => setActiveConversationId(null)} />;
    }
    return (
      <TeamList
        section={section}
        onChangeSection={setSection}
        onOpen={setActiveConversationId}
      />
    );
  }

  if (activeThreadId) {
    return (
      <ThreadView
        threadId={activeThreadId}
        clientName={activeThreadName}
        onBack={() => setActiveThreadId(null)}
      />
    );
  }

  return (
    <ThreadList
      section={section}
      onChangeSection={setSection}
      onOpen={(t) => {
        setActiveThreadId(t.id);
        setActiveThreadName(t.client_name || 'Client');
      }}
    />
  );
}

/* ==================================================================== *
 * Inbox
 * ==================================================================== */

/** Org-level admins (users."Type") — they also see assigned-and-open conversations in yellow. */
function isAdminRole(role: string | null | undefined) {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'ci_admin';
}

/**
 * The messages inside an "assigned" stretch of a support thread — from the system note
 * "X assigned this conversation to Y" until the conversation is closed (or the assignment is
 * removed). Those bubbles are drawn yellow so the assigned period stands out.
 * Driven by the system notes PATCH /threads/:id writes (sowash-backend
 * routes/commercialChatRoutes.js — keep these phrases in sync with it). If no assign/close
 * note is among the loaded messages but the thread is open and assigned right now, the
 * assignment predates the loaded page, so everything loaded counts as inside it.
 */
function assignedSpanIds(
  messages: ChatMessage[],
  thread: { status?: string | null; assigned_user_id?: number | null } | null | undefined,
): Set<number> {
  const ids = new Set<number>();
  let inside = false;
  let sawNote = false;
  for (const m of messages) {
    if (m.sender_kind === 'system') {
      const b = (m.body || '').toLowerCase();
      if (b.includes('assigned this conversation to')) {
        inside = true;
        sawNote = true;
      } else if (b.includes('closed this conversation') || b.includes('removed the assignment')) {
        inside = false;
        sawNote = true;
      }
      continue;
    }
    if (inside) ids.add(m.id);
  }
  if (!sawNote && thread?.status === 'open' && thread.assigned_user_id != null) {
    for (const m of messages) if (m.sender_kind !== 'system') ids.add(m.id);
  }
  return ids;
}

/** Yellow for a conversation assigned to me that I haven't closed yet. */
const ASSIGNED_AMBER = '#F5B800';
const ASSIGNED_TEXT = '#8A5A00';

function ThreadList({
  section,
  onChangeSection,
  onOpen,
}: {
  section: 'support' | 'team';
  onChangeSection: (section: 'support' | 'team') => void;
  onOpen: (thread: StaffChatThread) => void;
}) {
  const { accent } = useAccent();
  const { user } = useAuth();
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data, loading, error, refresh } = useStaffChatThreads(status, query);
  const threads = useMemo(() => data?.threads ?? [], [data]);
  const rows = useMemo(() => withHeadings(threads, (t) => dayBucket(t.last_message_at)), [threads]);
  // keeps the "Due in 40m" / "Overdue by …" badges moving
  const listNow = useNow(30000);

  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') refresh();
      }, INBOX_POLL_MS);
      return () => clearInterval(timer);
    }, [refresh]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <View style={s.screen}>
      <ChatBackground />
      <ChatsHeader
        section={section}
        onChangeSection={onChangeSection}
        unread={threads.filter((t) => t.unread > 0).length}
      />

      <View style={s.tabRow}>
        {(['open', 'closed'] as const).map((tab) => {
          const active = tab === status;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setStatus(tab)}
              style={[s.tabPill, active && { backgroundColor: accent }]}
              activeOpacity={0.8}
            >
              <Text style={[s.tabPillText, active && { color: '#fff' }]}>
                {tab === 'open' ? 'Open' : 'Closed'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={s.searchWrap}>
        <Search size={16} color={palette.mutedLight} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by client, contact, or number…"
          placeholderTextColor={palette.mutedLight}
          style={s.searchInput}
        />
      </View>

      {loading && threads.length === 0 ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : error && threads.length === 0 ? (
        <View style={s.centre}>
          <CircleAlert size={22} color={palette.danger} />
          <Text style={s.emptyTitle}>Could not load conversations</Text>
          <Text style={s.emptyBody}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(entry) => entry.key}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          renderItem={({ item: entry, index }) => {
            if (entry.kind === 'header') return <Text style={s.dayHeader}>{entry.label}</Text>;
            const item = entry.item;
            const name = item.client_name || 'Client';
            const unread = item.unread > 0;
            // Assigned to ME and still open: the row stays yellow until I close the conversation
            // (closing moves it to the Closed tab; reassigning it to someone else clears it too).
            const assignedOpen = item.status === 'open' && item.assigned_user_id != null;
            const assignedToMe = assignedOpen && item.assigned_user_id === user?.id;
            // The assignee AND admins see the yellow (admins hand the work out and follow it up).
            const mine = assignedOpen && (assignedToMe || isChatAdmin(user?.email));
            return (
              <FadeInRow index={index}>
                <TouchableOpacity
                  style={[s.row, unread && s.rowUnread, mine && s.rowAssignedMine]}
                  activeOpacity={0.85}
                  onPress={() => onOpen(item)}
                >
                  {mine || unread ? <View style={[s.rowEdge, { backgroundColor: mine ? ASSIGNED_AMBER : accent }]} /> : null}
                  <ChatAvatar name={name} ring={mine ? ASSIGNED_AMBER : unread ? accent : undefined} />
                  <View style={{ flex: 1 }}>
                    <View style={s.rowTop}>
                      <Text style={[s.rowName, unread && s.rowNameUnread]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[s.rowTime, unread && { color: accent, fontWeight: '800' }]}>
                        {relativeStamp(item.last_message_at)}
                      </Text>
                    </View>
                    <View style={s.rowBottom}>
                      <Text style={[s.rowPreview, unread && { color: palette.ink }]} numberOfLines={1}>
                        {agentPreviewPrefix(item, user?.id)}
                        {item.last_message_preview || 'No messages yet'}
                      </Text>
                      {unread ? (
                        <View style={[s.unreadBadge, { backgroundColor: accent }]}>
                          <Text style={s.unreadBadgeText}>{item.unread > 9 ? '9+' : item.unread}</Text>
                        </View>
                      ) : null}
                    </View>
                    {item.waiting_sites ? (
                      <View style={s.waitingChip}>
                        <Text style={s.rowWaiting} numberOfLines={1}>
                          {item.waiting_sites === 1 ? '1 site waiting' : `${item.waiting_sites} sites waiting`}
                        </Text>
                      </View>
                    ) : null}
                    <DueBadge thread={item} now={listNow} />
                    {mine ? (
                      <View style={s.assignedMinePill}>
                        <UserPlus size={11} color={ASSIGNED_TEXT} />
                        <Text style={s.assignedMineText} numberOfLines={1}>
                          {assignedToMe ? 'Assigned to you · close when done' : `Assigned to ${item.assigned_name || 'a colleague'} · still open`}
                        </Text>
                      </View>
                    ) : item.assigned_name ? (
                      <Text style={s.rowAssigned} numberOfLines={1}>
                        Assigned to {item.assigned_name}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              </FadeInRow>
            );
          }}
          ListFooterComponent={
            <View style={s.tipCard}>
              <View style={[s.tipIcon, { backgroundColor: `${accent}1f` }]}>
                <CircleCheck size={18} color={accent} />
              </View>
              <Text style={s.tipText}>
                Replying to a client clears the sites waiting on you. Close a conversation once every site is handled.
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <MessagesSquare size={22} color={palette.mutedLight} />
              <Text style={s.emptyTitle}>No {status} conversations</Text>
              <Text style={s.emptyBody}>
                {query ? 'Try a different search.' : 'Conversations will show up here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

/* ==================================================================== *
 * Team inbox (Phase 5)
 * ==================================================================== */

function TeamList({
  section,
  onChangeSection,
  onOpen,
}: {
  section: 'support' | 'team';
  onChangeSection: (section: 'support' | 'team') => void;
  /** Just the id — a list row and a freshly created conversation are different shapes, but both always have this. */
  onOpen: (conversationId: number) => void;
}) {
  const { accent } = useAccent();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const { data, loading, error, refresh } = useTeamConversations(query);
  const allConversations = useMemo(() => data?.conversations ?? [], [data]);
  // Client-side, over what the list already loaded — the server's order
  // (mentions pinned first, then newest) is preserved by filter().
  const [filter, setFilter] = useState<'all' | 'unread' | 'groups'>('all');
  const conversations = useMemo(() => {
    if (filter === 'unread') return allConversations.filter((c) => c.unread > 0);
    if (filter === 'groups') return allConversations.filter((c) => c.kind === 'group');
    return allConversations;
  }, [allConversations, filter]);
  const rows = useMemo(
    () =>
      withHeadings(conversations, (c) => (c.has_unread_mention ? 'Mentioned you' : dayBucket(c.last_message_at))),
    [conversations],
  );

  useFocusEffect(
    useCallback(() => {
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') refresh();
      }, INBOX_POLL_MS);
      // A socket delivery for ANY conversation means this list's previews/
      // unread counts are stale right now — no reason to wait for the next
      // poll tick when we already know something changed.
      const offSocket = subscribeTeamSocket(() => refresh());
      return () => {
        clearInterval(timer);
        offSocket();
      };
    }, [refresh]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Full-screen replacement, not an overlay on top of the list — matches
  // WhatsApp's own "New chat" screen and every other full-screen-replace
  // switch already used in this file (StaffChatsScreen, TeamThreadView).
  if (newOpen) {
    return (
      <NewConversationSheet
        onClose={() => setNewOpen(false)}
        onCreated={(conversationId) => {
          setNewOpen(false);
          onOpen(conversationId);
        }}
      />
    );
  }

  return (
    <View style={s.screen}>
      <ChatBackground />
      <ChatsHeader
        section={section}
        onChangeSection={onChangeSection}
        unread={allConversations.filter((c) => c.unread > 0).length}
        mentions={allConversations.filter((c) => c.has_unread_mention).length}
      />

      <View style={s.searchWrap}>
        <Search size={16} color={palette.mutedLight} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search conversations…"
          placeholderTextColor={palette.mutedLight}
          style={s.searchInput}
        />
      </View>

      <View style={s.tabRow}>
        {(['all', 'unread', 'groups'] as const).map((f) => {
          const active = f === filter;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[s.tabPill, active && { backgroundColor: accent }]}
              activeOpacity={0.8}
            >
              <Text style={[s.tabPillText, active && { color: '#fff' }]}>
                {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Groups'}
                {'  '}
                <Text style={{ opacity: 0.75 }}>
                  {f === 'all'
                    ? allConversations.length
                    : f === 'unread'
                      ? allConversations.filter((c) => c.unread > 0).length
                      : allConversations.filter((c) => c.kind === 'group').length}
                </Text>
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading && allConversations.length === 0 ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : error && allConversations.length === 0 ? (
        <View style={s.centre}>
          <CircleAlert size={22} color={palette.danger} />
          <Text style={s.emptyTitle}>Could not load conversations</Text>
          <Text style={s.emptyBody}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(entry) => entry.key}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
          renderItem={({ item: entry, index }) => {
            if (entry.kind === 'header') return <Text style={s.dayHeader}>{entry.label}</Text>;
            const item = entry.item;
            const name = item.name || (item.kind === 'group' ? 'Group' : 'Someone');
            const mentioned = item.has_unread_mention;
            const unread = item.unread > 0;
            return (
              <FadeInRow index={index}>
                <TouchableOpacity
                  style={[s.row, unread && s.rowUnread, mentioned && s.rowMentioned]}
                  activeOpacity={0.85}
                  onPress={() => onOpen(item.id)}
                >
                  {unread ? <View style={[s.rowEdge, { backgroundColor: mentioned ? palette.danger : accent }]} /> : null}
                  <ChatAvatar
                    name={name}
                    ring={unread ? (mentioned ? palette.danger : accent) : undefined}
                    group={item.kind === 'group'}
                  />
                  <View style={{ flex: 1 }}>
                    <View style={s.rowTop}>
                      <Text style={[s.rowName, unread && s.rowNameUnread]} numberOfLines={1}>
                        {name}
                      </Text>
                      <Text style={[s.rowTime, unread && { color: mentioned ? palette.danger : accent, fontWeight: '800' }]}>
                        {relativeStamp(item.last_message_at)}
                      </Text>
                    </View>
                    <View style={s.rowBottom}>
                      {mentioned ? (
                        <View style={{ flex: 1 }}>
                          <View style={s.mentionPill}>
                            <AtSign size={11} color="#fff" />
                            <Text style={s.mentionPillText}>You were mentioned</Text>
                          </View>
                        </View>
                      ) : (
                        <Text style={[s.rowPreview, unread && { color: palette.ink }]} numberOfLines={1}>
                          {teamPreviewPrefix(item, user?.id)}
                          {item.last_message_preview || 'No messages yet'}
                        </Text>
                      )}
                      {unread ? (
                        <View style={[s.unreadBadge, { backgroundColor: mentioned ? palette.danger : accent }]}>
                          <Text style={s.unreadBadgeText}>{item.unread > 9 ? '9+' : item.unread}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              </FadeInRow>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <MessagesSquare size={22} color={palette.mutedLight} />
              <Text style={s.emptyTitle}>
                {filter === 'unread' ? 'No unread conversations' : filter === 'groups' ? 'No groups yet' : 'No conversations yet'}
              </Text>
              <Text style={s.emptyBody}>
                {query
                  ? 'Try a different search.'
                  : filter === 'all'
                    ? 'Tap the + button to message a colleague.'
                    : 'Switch to All to see everything.'}
              </Text>
            </View>
          }
        />
      )}

      {/* New chat — a big floating action button instead of a tiny header icon. */}
      <TouchableOpacity activeOpacity={0.9} onPress={() => setNewOpen(true)} style={s.fab}>
        <LinearGradient
          colors={[BRAND_GREEN_MID, GREEN_STOPS.mid]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={s.fabInner}
        >
          <UserPlus size={24} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Start a dm (any STAFF_ROLES member) or create a group (admin-role only —
 * per the user's explicit instruction from the original design). Full
 * screen, WhatsApp's own "New chat" shape — TeamList renders this as a
 * full-screen replacement (see its early return), not an overlay anymore.
 * Delegates the list/search chrome to PeoplePickerView; only supplies the
 * dm/group mode toggle and, in group mode, the name field, via
 * PeoplePickerView's `headerExtra` slot. The mode toggle only shows for an
 * admin session; a non-admin never sees the option at all, though the real
 * gate is server-side (routes/staffChatRoutes.js), never this.
 */
function NewConversationSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (conversationId: number) => void;
}) {
  const { accent } = useAccent();
  const { user } = useAuth();
  const isAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';

  const [mode, setMode] = useState<'dm' | 'group'>('dm');
  const { data, loading, error: loadError } = useStaffDirectory();
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const onPickDm = async (personId: number) => {
    setBusy(true);
    setError(null);
    try {
      const conversation = await startTeamDm(personId);
      onCreated(conversation.id);
    } catch (err) {
      setError(errorMessage(err, 'Could not start the conversation.'));
    } finally {
      setBusy(false);
    }
  };

  const onCreateGroup = async () => {
    const name = groupName.trim();
    if (!name || selectedIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const conversation = await createTeamGroup(name, selectedIds);
      onCreated(conversation.id);
    } catch (err) {
      setError(errorMessage(err, 'Could not create the group.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PeoplePickerView
      title={mode === 'dm' ? 'New message' : 'New group'}
      people={data?.users ?? []}
      loading={loading}
      loadError={loadError}
      multi={mode === 'group'}
      selectedIds={selectedIds}
      onToggle={toggleSelected}
      onPickSingle={onPickDm}
      confirmLabel={`Create (${selectedIds.length})`}
      confirmDisabled={!groupName.trim() || selectedIds.length === 0 || busy}
      busy={busy}
      onConfirm={onCreateGroup}
      onBack={onClose}
      headerExtra={
        <View>
          {isAdmin ? (
            <View style={[s.tabRow, { paddingHorizontal: 16, marginTop: 2 }]}>
              {(['dm', 'group'] as const).map((m) => {
                const active = m === mode;
                return (
                  <TouchableOpacity
                    key={m}
                    onPress={() => setMode(m)}
                    style={[s.tabPill, active && { backgroundColor: accent }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.tabPillText, active && { color: '#fff' }]}>
                      {m === 'dm' ? 'Message' : 'Group'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
          {mode === 'group' ? (
            <View style={[s.pickerSearchWrap, { marginHorizontal: 16, marginTop: 10, marginBottom: 0 }]}>
              <TextInput
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Group name…"
                placeholderTextColor={palette.mutedLight}
                style={s.pickerSearchInput}
              />
            </View>
          ) : null}
          {error ? <Text style={[s.sheetError, { paddingHorizontal: 16 }]}>{error}</Text> : null}
        </View>
      }
    />
  );
}

/* ==================================================================== *
 * One thread
 * ==================================================================== */

// The tab bar is hidden while a chat is open (src/chat-focus.ts), so the composer sits near the bottom edge.
const TAB_BAR_CLEARANCE = 0;

function ThreadView({
  threadId,
  clientName,
  onBack,
}: {
  threadId: number;
  clientName: string;
  onBack: () => void;
}) {
  const { accent } = useAccent();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
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
    customerTyping,
    agentTypingName,
    notifyTyping,
    stopTyping,
    hasMore,
    loadingOlder,
    loadOlder,
  } = useStaffChatThread(threadId, user?.id);
  const { thread: meta, assign, assignError, setStatus, refresh: refreshMeta } = useStaffChatThreadMeta(threadId);
  const [closing, setClosing] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  // Header chips are icon-only on phones: with text, "Assign" + "Close" + search leave the
  // client's NAME no room at all (measured: zero width at 360dp, search pushed off-screen at 320dp).
  const { width: winW } = useWindowDimensions();
  const iconChips = winW < 600;
  const isClosed = meta?.status === 'closed';
  const threadNow = useNow(30000);
  const waitingSites = meta?.waiting_sites ?? [];

  // A new ring (or your own reply) changes who is waiting — re-read it
  // whenever the message count changes (the meta hook doesn't poll).
  useEffect(() => {
    refreshMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  const doToggleClosed = async () => {
    setClosing(true);
    setStatusError(null);
    const ok = await setStatus(isClosed ? 'open' : 'closed');
    setClosing(false);
    if (!ok) setStatusError(isClosed ? 'Could not reopen this conversation.' : 'Could not close this conversation (only the assigned person or an admin can close it).');
  };
  // Once assigned, only the assigned person or an admin can CLOSE it (the server enforces this too).
  const canClose =
    (!!meta?.assigned_user_id && meta.assigned_user_id === user?.id) || isChatAdmin(user?.email);
  const toggleClosed = () => {
    if (closing) return;
    if (!isClosed && !canClose) {
      Alert.alert(
        'Not allowed',
        meta?.assigned_user_id
          ? `This conversation is assigned to ${meta?.assigned_name || 'a colleague'}. Only they or an admin can close it.`
          : 'This conversation is not assigned yet. Only an admin can close it.',
      );
      return;
    }
    // Closing closes the WHOLE conversation, but a client can have rung for
    // several sites in it — don't let a still-waiting site slip away unseen.
    if (!isClosed && waitingSites.length > 0) {
      const names = waitingSites.map((x) => x.site_name || `Site ${x.site_id}`).join(', ');
      Alert.alert(
        waitingSites.length === 1 ? '1 site still waiting' : `${waitingSites.length} sites still waiting`,
        `${names}\n\nClosing ends the whole conversation. Close anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Close anyway', style: 'destructive', onPress: doToggleClosed },
        ],
      );
      return;
    }
    doToggleClosed();
  };

  const [draft, setDraft] = useState(() => supportDraftCache.get(threadId) ?? '');
  const [photo, setPhoto] = useState<ChatPhotoInput | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  // mentionQuery: null = not currently typing an @-mention. '' or a partial
  // name = actively typing one (the text after the @). v1 only detects an
  // @ at the very END of the draft (not mid-message edits) — simple, and
  // covers the actual "@Name, can you take this" composing pattern.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionedUserId, setMentionedUserId] = useState<number | null>(null);
  const [mentionedName, setMentionedName] = useState<string | null>(null);
  const { data: agentsData } = useStaffChatAgents();
  const mentionMatches = useMemo(
    () => (mentionQuery === null ? [] : filterAgents(agentsData?.agents ?? [], mentionQuery)),
    [mentionQuery, agentsData],
  );
  const listRef = React.useRef<FlatList<ChatMessage>>(null);
  const chatScroll = useChatScroll(listRef, true, { hasMore, loadingOlder, loadOlder }, messages.length > 0);

  // ── photo viewer (tap a photo → full screen, pinch-to-zoom, swipe between) ──
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null);
  const photoMedia = useMemo(
    () =>
      messages
        .filter((m) => !!m.attachment_url && mediaKind(m.attachment_name || m.attachment_url) === 'image')
        .map((m) => ({
          id: m.id,
          url: photoUrl(m.attachment_url),
          senderName: m.sender_name,
          createdAt: m.created_at,
        })),
    [messages],
  );
  // useCallback: Bubble is React.memo — a fresh function per render would
  // re-render every bubble on every keystroke.
  // Stable identity (reads the latest list via a ref): these go to every bubble, and a callback that
  // changed with each new message re-rendered the whole chat on every send.
  const photoMediaRef = React.useRef(photoMedia);
  photoMediaRef.current = photoMedia;
  const openPhoto = useCallback((messageId: number) => {
    const idx = photoMediaRef.current.findIndex((m) => m.id === messageId);
    if (idx >= 0) setPhotoViewerIndex(idx);
  }, []);

  // ── reply (swipe right on a message, or long-press → Reply) ──
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const composerRef = React.useRef<TextInput>(null);
  const startReply = useCallback((m: ChatMessage) => {
    setReplyTo(m);
    setTimeout(() => composerRef.current?.focus(), 60);
  }, []);
  const supportReplyRef = (m: ChatMessage): TeamReplyRef => ({
    id: m.id,
    sender_name:
      m.sender_kind === 'agent' && m.sender_user_id === user?.id ? 'You' : m.sender_name || (m.sender_kind === 'customer' ? 'Customer' : 'SoWash'),
    body: m.body,
    has_photo: !!m.attachment_url,
  });
  const messagesRef = React.useRef(messages);
  messagesRef.current = messages;
  const jumpTo = useCallback((messageId: number) => {
    const index = messagesRef.current.findIndex((m) => m.id === messageId);
    if (index >= 0) listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.5 });
  }, []);

  // ── the assigned stretch (yellow bubbles) ──
  const assignedIds = useMemo(() => assignedSpanIds(messages, meta), [messages, meta]);

  // ── reactions ──
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
  const openActions = useCallback(
    (m: ChatMessage, rect: ActionRect) => setActionTarget({ message: m, rect }),
    [],
  );

  // ── search in chat (client-side over what's loaded, same as Team chat) ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchPos, setSearchMatchPos] = useState(0);
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages.reduce<number[]>((acc, m, idx) => {
      if (m.sender_kind !== 'system' && (m.body || '').toLowerCase().includes(q)) acc.push(idx);
      return acc;
    }, []);
  }, [messages, searchQuery]);
  const scrollToSearchMatch = (pos: number) => {
    const targetIdx = searchMatches[pos];
    if (targetIdx == null) return;
    listRef.current?.scrollToIndex({ index: targetIdx, animated: true, viewPosition: 0.5 });
  };
  // Newest match first (WhatsApp's default); up/down steps through older/newer.
  useEffect(() => {
    if (searchMatches.length === 0) return;
    const last = searchMatches.length - 1;
    setSearchMatchPos(last);
    scrollToSearchMatch(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, messages.length]);
  const stepSearchMatch = (direction: -1 | 1) => {
    if (searchMatches.length === 0) return;
    const next = (searchMatchPos + direction + searchMatches.length) % searchMatches.length;
    setSearchMatchPos(next);
    scrollToSearchMatch(next);
  };
  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatchPos(0);
  };
  useEffect(() => {
    if (!searchOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSearch();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  const onDraftChange = (text: string) => {
    setDraft(text);
    // Survives navigating away and back — see supportDraftCache's own
    // comment for why this can't just live in this component's state.
    if (text) supportDraftCache.set(threadId, text);
    else supportDraftCache.delete(threadId);
    if (text.trim().length > 0) notifyTyping();
    else stopTyping();
    const m = /(?:^|\s)@(\w*)$/.exec(text);
    setMentionQuery(m ? m[1] : null);
    // Editing the draft after a mention was already picked (not just
    // appending) invalidates it rather than silently keeping a stale
    // mentioned_user_id pointed at text that may no longer even be there.
    if (mentionedName && !text.includes(`@${mentionedName}`)) {
      setMentionedUserId(null);
      setMentionedName(null);
    }
  };

  const pickMention = (agent: StaffChatAgent) => {
    const name = agent.name || agent.email || `Agent ${agent.id}`;
    setDraft((prev) => {
      const next = prev.replace(/(?:^|\s)@(\w*)$/, (whole) => `${whole.startsWith(' ') ? ' ' : ''}@${name} `);
      supportDraftCache.set(threadId, next);
      return next;
    });
    setMentionedUserId(agent.id);
    setMentionedName(name);
    setMentionQuery(null);
  };


  const onSend = async () => {
    const ok = await send({
      body: draft,
      photo,
      scheduleId: null,
      mentionedUserId,
      mentionedName,
      replyTo: replyTo ? supportReplyRef(replyTo) : null,
    });
    if (!ok) return;
    setReplyTo(null);
    setDraft('');
    supportDraftCache.delete(threadId);
    setPhoto(null);
    setMentionedUserId(null);
    setMentionedName(null);
    setMentionQuery(null);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  // Voice note (hold the mic, src/voiceRecorder.tsx) and recorded video are sent straight away —
  // no Send button, like WhatsApp.
  const sendMedia = async (file: ChatPhotoInput) => {
    const ok = await send({
      body: '',
      photo: file,
      scheduleId: null,
      replyTo: replyTo ? supportReplyRef(replyTo) : null,
    });
    if (!ok) return;
    setReplyTo(null);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };
  const voice = useVoiceHold(sendMedia);

  const canSend = (draft.trim().length > 0 || !!photo) && !sending;
  const composerClearance = 10 + TAB_BAR_CLEARANCE;

  // Tapping a photo bubble — full-screen replace, same as Team chat.
  if (photoViewerIndex !== null) {
    return <MediaViewerView media={photoMedia} initialIndex={photoViewerIndex} onBack={() => setPhotoViewerIndex(null)} />;
  }

  return (
    <KeyboardScreen style={s.screen}>
      <ChatBackground />

      {searchOpen ? (
        <ChatHeaderBar>
          <TouchableOpacity onPress={closeSearch} style={s.backBtn} hitSlop={8}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search in this chat…"
            placeholderTextColor="rgba(255,255,255,0.7)"
            style={s.searchHeaderInputOnColor}
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.trim() ? (
            <Text style={s.searchMatchCountOnColor}>
              {searchMatches.length > 0 ? `${searchMatchPos + 1}/${searchMatches.length}` : '0/0'}
            </Text>
          ) : null}
          <TouchableOpacity onPress={() => stepSearchMatch(-1)} disabled={searchMatches.length === 0} hitSlop={8}>
            <ChevronUp size={20} color={searchMatches.length === 0 ? 'rgba(255,255,255,0.45)' : '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => stepSearchMatch(1)} disabled={searchMatches.length === 0} hitSlop={8} style={{ marginLeft: 6 }}>
            <ChevronDown size={20} color={searchMatches.length === 0 ? 'rgba(255,255,255,0.45)' : '#fff'} />
          </TouchableOpacity>
        </ChatHeaderBar>
      ) : (
        <ChatHeaderBar>
          <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={8}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          {/* on the very narrowest phones the avatar gives its room to the name */}
          {winW < 340 ? null : (
            <View style={[s.headerAvatar, { backgroundColor: colorFor(clientName || 'C') }]}>
              <Text style={s.headerAvatarText}>{initial(clientName || 'C')}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.threadTitleOnColor} numberOfLines={1}>
              {clientName}
            </Text>
            <Text style={s.headerSubOnColor} numberOfLines={1}>
              {customerTyping
                ? 'typing…'
                : agentTypingName
                  ? `${agentTypingName} is typing…`
                  : iconChips && meta?.assigned_name
                    ? `Assigned to ${meta.assigned_name}`
                    : 'Client conversation'}
            </Text>
          </View>
          {/* Only an admin hands conversations out. Everyone else just sees who it is assigned to. */}
          {isChatAdmin(user?.email) || meta?.assigned_name ? (
          <TouchableOpacity
            onPress={isChatAdmin(user?.email) ? () => setAssignOpen(true) : undefined}
            disabled={!isChatAdmin(user?.email)}
            style={[s.headerChip, iconChips && s.headerChipIcon, meta?.assigned_name ? s.headerChipOn : null]}
            activeOpacity={0.85}
            accessibilityLabel={meta?.assigned_name ? `Assigned to ${meta.assigned_name}. Change` : 'Assign'}
          >
            <UserPlus size={iconChips ? 17 : 14} color={meta?.assigned_name ? accent : '#fff'} />
            {iconChips ? null : (
              <Text style={[s.headerChipText, { color: meta?.assigned_name ? accent : '#fff' }]} numberOfLines={1}>
                {meta?.assigned_name || 'Assign'}
              </Text>
            )}
          </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={toggleClosed}
            disabled={closing || !meta}
            style={[s.headerChip, iconChips && s.headerChipIcon, isClosed ? s.headerChipOn : null, !isClosed && !canClose ? { opacity: 0.45 } : null]}
            activeOpacity={0.85}
            accessibilityLabel={isClosed ? 'Reopen conversation' : 'Close conversation'}
          >
            {closing ? (
              <ActivityIndicator size="small" color={isClosed ? accent : '#fff'} />
            ) : isClosed ? (
              <RotateCcw size={iconChips ? 17 : 14} color={accent} />
            ) : (
              <CircleCheck size={iconChips ? 17 : 14} color="#fff" />
            )}
            {iconChips ? null : (
              <Text style={[s.headerChipText, { color: isClosed ? accent : '#fff' }]} numberOfLines={1}>
                {isClosed ? 'Reopen' : 'Close'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSearchOpen(true)} style={s.backBtn} hitSlop={8}>
            <Search size={20} color="#fff" />
          </TouchableOpacity>
        </ChatHeaderBar>
      )}

      {meta ? <DueBanner thread={meta} now={threadNow} /> : null}

      {waitingSites.length > 0 ? (
        <Text style={s.waitingLine} numberOfLines={2}>
          Waiting: {waitingSites.map((x) => x.site_name || `Site ${x.site_id}`).join(', ')}
        </Text>
      ) : null}

      {assignOpen ? (
        <AssignPicker
          currentUserId={meta?.assigned_user_id ?? null}
          assigning={assigning}
          error={assignError}
          onClose={() => setAssignOpen(false)}
          onPick={async (userId, dueInMinutes) => {
            setAssigning(true);
            const ok = await assign(userId, dueInMinutes);
            setAssigning(false);
            // Only close on success — closing unconditionally here is what
            // made a FAILED assign look identical to a successful one: the
            // sheet just disappeared either way with nothing on screen
            // telling you it didn't work.
            if (ok) setAssignOpen(false);
          }}
        />
      ) : null}

      {loading && messages.length === 0 ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : error && messages.length === 0 ? (
        <View style={s.centre}>
          <CircleAlert size={22} color={palette.danger} />
          <Text style={s.emptyTitle}>Could not load</Text>
          <Text style={s.emptyBody}>{error}</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={s.centre}>
          <MessagesSquare size={24} color={palette.mutedLight} />
          <Text style={s.emptyTitle}>No messages yet</Text>
          <Text style={s.emptyBody}>Reply here to start the conversation.</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          style={[{ flex: 1 }, chatScroll.hiddenStyle]}
          onScroll={chatScroll.onScroll}
          // Lay out the whole page (≤40, then ≤40 more per older page) in the FIRST pass: with the default
          // 10-item window the list's end is only an estimate, so scrollToEnd landed short of the newest message.
          initialNumToRender={60}
          maxToRenderPerBatch={60}
          windowSize={31}
          removeClippedSubviews={false}
          onScrollBeginDrag={chatScroll.onScrollBeginDrag}
          scrollEventThrottle={64}
          maintainVisibleContentPosition={chatScroll.maintainVisibleContentPosition}
          contentContainerStyle={s.messageList}
          showsVerticalScrollIndicator={false}
          // Auto-scroll-to-newest would fight an active search jump.
          onContentSizeChange={() => {
            if (!searchOpen) chatScroll.onContentSizeChange();
          }}
          // Variable bubble heights: estimate an offset, retry once layout catches up.
          onScrollToIndexFailed={(info) => {
            const offset = info.averageItemLength * info.index;
            listRef.current?.scrollToOffset({ offset, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }), 100);
          }}
          renderItem={({ item }) => (
            <Bubble
              message={item}
              accent={accent}
              myUserId={user?.id}
              assigned={assignedIds.has(item.id)}
              reactions={reactionsByMessage.get(item.id)}
              searchQuery={searchOpen ? searchQuery : undefined}
              onOpenPhoto={openPhoto}
              onRetry={retry}
              onDiscard={discard}
              onActions={openActions}
              onReply={startReply}
              onJumpTo={jumpTo}
            />
          )}
        />
      )}

      {customerTyping || agentTypingName ? <TypingPill /> : null}

      {actionTarget ? (
        <MessageActionsOverlay
          target={actionTarget}
          accent={accent}
          mine={actionTarget.message.sender_kind === 'agent' && actionTarget.message.sender_user_id === user?.id}
          onReply={() => {
            startReply(actionTarget.message);
            setActionTarget(null);
          }}
          renderMessage={() => (
            <Bubble
              message={actionTarget.message}
              accent={accent}
              myUserId={user?.id}
              reactions={reactionsByMessage.get(actionTarget.message.id)}
              onOpenPhoto={() => {}}
              onRetry={() => {}}
              onDiscard={() => {}}
              onActions={() => {}}
            />
          )}
          myEmoji={
            reactions.find((r) => r.message_id === actionTarget.message.id && r.user_id === user?.id)?.emoji ?? null
          }
          onReact={(emoji) => {
            react(actionTarget.message.id, emoji);
            setActionTarget(null);
          }}
          onClose={() => setActionTarget(null)}
        />
      ) : null}

      <View style={[s.composerWrap, { paddingBottom: composerClearance }]}>
        {error && messages.length > 0 ? <Text style={s.sendError}>{error}</Text> : null}
        {statusError ? <Text style={s.sendError}>{statusError}</Text> : null}
        {isClosed ? (
          <Text style={s.closedNote}>This conversation is closed — sending a message reopens it.</Text>
        ) : null}

        {replyTo ? (
          <View style={[s.replyBar, { borderLeftColor: accent }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.quoteName, { color: accent }]} numberOfLines={1}>
                Replying to{' '}
                {replyTo.sender_kind === 'agent' && replyTo.sender_user_id === user?.id
                  ? 'yourself'
                  : replyTo.sender_name || (replyTo.sender_kind === 'customer' ? 'the customer' : 'SoWash')}
              </Text>
              <Text style={[s.quoteBody, { color: palette.muted }]} numberOfLines={1}>
                {replyTo.body || (replyTo.attachment_url ? attachmentLabel(replyTo.attachment_name || replyTo.attachment_url) : 'Message')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8} accessibilityLabel="Cancel reply">
              <X size={16} color={palette.muted} />
            </TouchableOpacity>
          </View>
        ) : null}

        {mentionQuery !== null ? (
          <View style={s.mentionBox}>
            {mentionMatches.length === 0 ? (
              <Text style={s.mentionEmpty}>No one matches "@{mentionQuery}"</Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {mentionMatches.map((agent) => (
                  <TouchableOpacity
                    key={agent.id}
                    style={s.mentionRow}
                    activeOpacity={0.8}
                    onPress={() => pickMention(agent)}
                  >
                    <View style={[s.mentionAvatar, { backgroundColor: colorFor(agent.name || 'A') }]}>
                      <Text style={s.mentionAvatarText}>{initial(agent.name || 'A')}</Text>
                    </View>
                    <Text style={s.mentionRowText} numberOfLines={1}>
                      {agent.name || agent.email || `Agent ${agent.id}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {photo ? (
          <View style={s.attachRow}>
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
          </View>
        ) : null}

        <View style={s.composerRow}>
          {voice.recording ? (
            <VoiceRecordingBar voice={voice} />
          ) : (
          <View style={s.pill}>
            <TextInput
              ref={composerRef}
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Reply… (@ to mention a colleague)"
              placeholderTextColor={palette.mutedLight}
              style={s.pillInput}
              multiline
            />
            {/* WhatsApp-style camera: tap = open camera (gallery button inside it), hold = record video straight away. */}
            <CameraPillButton onPicked={sendMedia} onLibrary={setPhoto} style={s.pillIcon} color={palette.muted} />
          </View>
          )}
          {canSend && !voice.recording ? (
            <TouchableOpacity onPress={onSend} style={[s.sendBtn, { backgroundColor: accent }]}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={18} color="#fff" />}
            </TouchableOpacity>
          ) : (
            // Nothing to send → the mic: HOLD to record, release to send, slide left to cancel.
            <VoiceMicButton voice={voice} accent={accent} buttonStyle={s.sendBtn} />
          )}
        </View>
      </View>
    </KeyboardScreen>
  );
}

/** Assign this conversation to one support agent — GET /commercial-chat/agents
 *  for the list (every ci_admin/Operations/Admin/Sales/accounts user —
 *  SUPPORT_ROLES in commercialChatRoutes.js), PATCH .../threads/:id
 *  { assigned_user_id } to set it. Everyone in SUPPORT_ROLES already sees
 *  every open thread regardless of assignment; this is ownership, not
 *  visibility. Type-to-filter by name or email, same as any contact picker. */
function AssignPicker({
  currentUserId,
  assigning,
  error,
  onClose,
  onPick,
}: {
  currentUserId: number | null;
  assigning: boolean;
  /** The last assign ATTEMPT's error, not the agent list's load error (see loadError below). */
  error: string | null;
  onClose: () => void;
  onPick: (userId: number | null, dueInMinutes?: number | null) => void;
}) {
  const { accent } = useAccent();
  // Step 2: after choosing a person, choose how long they have to resolve it.
  const [chosen, setChosen] = useState<StaffChatAgent | null>(null);
  const [timeline, setTimeline] = useState<string>('2h');
  const { data, loading, error: loadError } = useStaffChatAgents();
  const [query, setQuery] = useState('');
  const agents = useMemo(() => filterAgents(data?.agents ?? [], query), [data, query]);
  const keyboardHeight = useKeyboardHeight();
  const sheetMaxHeight = useSheetMaxHeight(keyboardHeight);
  useSheetBackButton(onClose);

  return (
    <View style={s.sheetOverlay}>
      {/* No KeyboardAvoidingView — this renders inside ThreadView, which
          already has its own (the composer's), and nesting a second one
          reacting to the same keyboard event is unreliable. Pushed up by
          the exact measured keyboard height instead. */}
      <Pressable style={[s.sheetBackdrop, { paddingBottom: keyboardHeight }]} onPress={onClose}>
        <Pressable style={[s.sheet, { maxHeight: sheetMaxHeight }]} onPress={(e) => e.stopPropagation()}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{chosen ? 'Time to resolve' : 'Assign conversation'}</Text>

          {chosen ? (
            // ── step 2: the timeline ──
            <View>
              <Text style={s.sheetSub}>
                {chosen.name || chosen.email || 'This person'} will be reminded before it is due and again if it runs late.
                Others will see if it was not resolved in time.
              </Text>
              <View style={s.timelineWrap}>
                {TIMELINES.map((t) => {
                  const on = timeline === t.key;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      onPress={() => setTimeline(t.key)}
                      activeOpacity={0.85}
                      style={[s.timelineChip, on && { backgroundColor: accent, borderColor: accent }]}
                    >
                      <Text style={[s.timelineChipText, on && { color: '#fff' }]}>{t.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {error ? <Text style={s.sheetError}>{error}</Text> : null}
              <TouchableOpacity
                style={[s.timelineGo, { backgroundColor: accent, opacity: assigning ? 0.6 : 1 }]}
                disabled={assigning}
                onPress={() => onPick(chosen.id, timelineMinutes(timeline))}
              >
                {assigning ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.timelineGoText}>Assign</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.sheetCancel} onPress={() => setChosen(null)}>
                <Text style={s.sheetCancelText}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <>

          {/* One scrollable body — results first, search box right after.
              Same mechanism already confirmed to position correctly above
              the keyboard. */}
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={accent} />
              </View>
            ) : loadError ? (
              <Text style={s.sheetError}>{loadError}</Text>
            ) : (
              <>
                {!query.trim() ? (
                  <TouchableOpacity
                    style={s.sheetRow}
                    disabled={assigning}
                    onPress={() => onPick(null)}
                  >
                    <Text style={s.sheetRowText}>Unassigned</Text>
                    {currentUserId === null ? <Check size={16} color={accent} /> : null}
                  </TouchableOpacity>
                ) : null}
                {agents.map((agent: StaffChatAgent) => (
                  <TouchableOpacity
                    key={agent.id}
                    style={s.sheetRow}
                    disabled={assigning}
                    onPress={() => setChosen(agent)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.sheetRowText} numberOfLines={1}>
                        {agent.name || agent.email || `Agent ${agent.id}`}
                      </Text>
                      {agent.email ? (
                        <Text style={s.sheetRowSub} numberOfLines={1}>
                          {agent.email}
                        </Text>
                      ) : null}
                    </View>
                    {currentUserId === agent.id ? <Check size={16} color={accent} /> : null}
                  </TouchableOpacity>
                ))}
                {query.trim() && agents.length === 0 ? (
                  <Text style={s.sheetEmptyText}>No one matches "{query.trim()}".</Text>
                ) : null}
              </>
            )}

            {loading ? null : (
              <View style={s.pickerSearchWrap}>
                <Search size={15} color={palette.mutedLight} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Type a name or email…"
                  placeholderTextColor={palette.mutedLight}
                  style={s.pickerSearchInput}
                  autoCapitalize="none"
                />
              </View>
            )}

            {error ? <Text style={s.sheetError}>{error}</Text> : null}

            <TouchableOpacity style={s.sheetCancel} onPress={onClose}>
              <Text style={s.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
          </>
          )}
        </Pressable>
      </Pressable>
    </View>
  );
}

/**
 * A tagged visit, read-only — deliberately NOT src/components/ChatVisitCard.tsx.
 * That component's "View details" tap opens app/(tabs)'s useJobDetail /
 * useSldWalkthrough, which hit /customer-portal/:id/detail and
 * /customer-portal/sld/:id — authenticatePortal-only endpoints that reject an
 * office_portal token outright. Staff has its own visit-detail endpoint
 * (GET /commercial-chat/visits/:scheduleId/detail), but wiring a second
 * detail-fetch path is a deliberate follow-up, not part of this pass — a
 * message tagged from the web console or the client's own app should still
 * show its summary here without an tap target that would 403.
 */
function VisitTagSummary({ visit, mine }: { visit: ChatVisitTag; mine: boolean }) {
  const meta = statusMeta(visit.status);
  const titleColor = mine ? '#fff' : palette.ink;
  const metaColor = mine ? '#ffffffbb' : palette.muted;

  return (
    <View style={[s.visitTag, mine ? s.visitTagMine : s.visitTagTheirs]}>
      <View style={s.visitTagTop}>
        <Text style={[s.visitTagTitle, { color: titleColor }]} numberOfLines={1}>
          {visit.site_name || 'Visit'}
        </Text>
        <View style={[s.visitTagDot, { backgroundColor: meta.color }]} />
        <Text style={[s.visitTagStatus, { color: mine ? '#fff' : meta.color }]}>{meta.label}</Text>
      </View>
      <View style={s.visitTagRow}>
        <CalendarDays size={11} color={metaColor} />
        <Text style={[s.visitTagMeta, { color: metaColor }]}>
          {formatDateOnly(visit.scheduled_date)}
          {visit.team_lead_name ? ` · ${visit.team_lead_name}` : ''}
        </Text>
      </View>
      {visit.photo_count > 0 ? (
        <View style={s.visitTagRow}>
          <Images size={11} color={metaColor} />
          <Text style={[s.visitTagMeta, { color: metaColor }]}>
            {visit.photo_count} photo{visit.photo_count === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Assignment changes (PATCH /commercial-chat/threads/:id in
 * commercialChatRoutes.js) insert a sender_kind='system' row with a body
 * like "Fatima assigned this conversation to Ahmed" — rendered centered,
 * no bubble/avatar, the same convention WhatsApp uses for "X added Y".
 */
function SystemLine({ message }: { message: ChatMessage }) {
  if (!message.body) return null;
  // The deadline notes written by the server (routes/commercialChatRoutes.js, services/chatDueReminders.js):
  // "⏰ Overdue — …" / "⏰ Resolved late — …" stand out in red, "✅ Resolved on time — …" in green, so anyone opening
  // the conversation later can see at once that it was not resolved in the allotted time.
  const late = message.body.startsWith('⏰');
  const onTime = message.body.startsWith('✅');
  return (
    <View
      style={[
        s.systemLine,
        late && { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1 },
        onTime && { backgroundColor: '#DCFCE7', borderColor: '#86EFAC', borderWidth: 1 },
      ]}
    >
      <Text style={[s.systemLineText, late && { color: '#B91C1C', fontWeight: '800' }, onTime && { color: '#166534', fontWeight: '800' }]}>
        {message.body}
      </Text>
    </View>
  );
}

/** Highlights the "@Name" the composer inserted into the body text — the
 *  string itself already carries the mention (pickMention() writes it in
 *  directly), this just makes it visually stand out the way WhatsApp bolds
 *  a mention instead of leaving it as plain text indistinguishable from the
 *  rest of the message. */
function MessageBody({
  body,
  mentionedName,
  mentionAll,
  mine,
  accent,
  searchQuery,
}: {
  body: string;
  mentionedName: string | null;
  /** Team groups: highlight every "@all" in the body (the message was sent with mention_all). */
  mentionAll?: boolean;
  mine: boolean;
  accent: string;
  /** Team chat's "search in chat" (TeamThreadView) — every case-insensitive occurrence gets highlighted, not just one. Undefined/empty outside an active search. */
  searchQuery?: string;
}) {
  const textColor = mine ? '#fff' : palette.ink;

  // One pass over every highlight range (the mention tag, at most one, plus
  // every search-query occurrence) rather than two separate split passes —
  // a search match landing INSIDE the mention tag (searching for part of a
  // name that was also mentioned) needs to compose cleanly against it
  // instead of the two fighting over the same characters.
  type Range = { start: number; end: number; kind: 'mention' | 'search' };
  const ranges: Range[] = [];

  const tag = mentionedName ? `@${mentionedName}` : null;
  if (tag) {
    const idx = body.indexOf(tag);
    if (idx !== -1) ranges.push({ start: idx, end: idx + tag.length, kind: 'mention' });
  }

  if (mentionAll) {
    const re = /(^|\s)(@all)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const start = m.index + m[1].length;
      ranges.push({ start, end: start + m[2].length, kind: 'mention' });
    }
  }

  const q = searchQuery?.trim().toLowerCase();
  if (q) {
    const lower = body.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(q, from);
      if (idx === -1) break;
      ranges.push({ start: idx, end: idx + q.length, kind: 'search' });
      from = idx + q.length;
    }
  }

  if (ranges.length === 0) {
    return <Text style={[s.text, { color: textColor }]}>{body}</Text>;
  }

  ranges.sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start < cursor) return; // Already covered by an earlier, overlapping range.
    if (r.start > cursor) parts.push(body.slice(cursor, r.start));
    const slice = body.slice(r.start, r.end);
    parts.push(
      r.kind === 'mention' ? (
        <Text key={`m-${i}`} style={[s.mentionHighlight, { color: mine ? '#fff' : accent }]}>
          {slice}
        </Text>
      ) : (
        <Text key={`s-${i}`} style={s.searchHighlight}>
          {slice}
        </Text>
      ),
    );
    cursor = r.end;
  });
  if (cursor < body.length) parts.push(body.slice(cursor));

  return <Text style={[s.text, { color: textColor }]}>{parts}</Text>;
}

/** The soft light-to-deep sheen on my own bubbles (sits under the content; the bubble's own colour shows at the corners). */
function BubbleGradient({ accent, brand, amber }: { accent: string; brand?: boolean; amber?: boolean }) {
  return (
    <LinearGradient
      pointerEvents="none"
      // `brand` = the logo's sky blue (deep enough for white text) — used for my own bubbles in Team (internal) chat.
      // `amber` = my message inside an assigned stretch (see assignedSpanIds) — deep enough for white text.
      colors={amber ? ['#E9A500', '#C27C00'] : brand ? ['#0E78B5', '#2AA9E3'] : [shade(accent, 0.12), shade(accent, -0.14)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={s.bubbleGradient}
    />
  );
}

/** Chips straddling a bubble's bottom edge — shared by the Support bubble (Team's inlines the same markup). */
function ReactionChips({
  reactions,
  myUserId,
  mine,
  accent,
}: {
  reactions: TeamReaction[];
  myUserId: number | undefined;
  mine: boolean;
  accent: string;
}) {
  const counts = reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});
  const myReaction = reactions.find((r) => r.user_id === myUserId)?.emoji;
  return (
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
  );
}

const Bubble = React.memo(function Bubble({
  message,
  accent,
  myUserId,
  assigned,
  reactions,
  searchQuery,
  onOpenPhoto,
  onRetry,
  onDiscard,
  onActions,
  onReply,
  onJumpTo,
}: {
  message: ChatMessage;
  accent: string;
  /** The VIEWING agent's own id — see the sender_user_id comment on ChatMessage. */
  myUserId: number | undefined;
  /** Inside an assigned stretch (assign → close): drawn yellow. */
  assigned?: boolean;
  reactions?: TeamReaction[];
  searchQuery?: string;
  onOpenPhoto: (messageId: number) => void;
  onRetry: (localId: number) => void;
  onDiscard: (localId: number) => void;
  /** Long-press: reaction bar; `rect` is the row's window position. */
  onActions: (message: ChatMessage, rect: ActionRect) => void;
  /** Swipe right → reply (omitted for the copy drawn inside the long-press overlay). */
  onReply?: (message: ChatMessage) => void;
  /** Tap a quote → scroll to the original. */
  onJumpTo?: (messageId: number) => void;
}) {
  if (message.sender_kind === 'system') return <SystemLine message={message} />;

  // Not just sender_kind === 'agent': that alone means "some staff member
  // sent this," true for every colleague's reply too, which is exactly what
  // put every agent message on the right for every viewer once more than
  // one office role could answer the same thread.
  const mine = message.sender_kind === 'agent' && myUserId != null && message.sender_user_id === myUserId;
  const url = (message.pending || message.failed) && message.localPhotoUri ? message.localPhotoUri : photoUrl(message.attachment_url);
  const name = message.sender_name || (mine ? 'You' : 'Customer');
  const photoSize = usePhotoBubbleSize();
  const rowRef = React.useRef<View>(null);
  const hasReactions = !!reactions && reactions.length > 0;

  // Swipe-right-to-reply — the same gesture as TeamBubble below.
  const swipeX = React.useRef(new Animated.Value(0)).current;
  const SWIPE_TRIGGER = 56;
  const canReply = !!onReply && message.id > 0 && !message.pending && !message.failed;
  const onSwipe = React.useRef(
    Animated.event([{ nativeEvent: { translationX: swipeX } }], { useNativeDriver: true }),
  ).current;
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
          <View style={[s.msgAvatar, { backgroundColor: colorFor(name) }]}>
            <Text style={s.msgAvatarText}>{initial(name)}</Text>
          </View>
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
            mine ? { backgroundColor: assigned ? '#D99400' : accent, borderBottomRightRadius: 6 } : [s.bubbleTheirs, { borderBottomLeftRadius: 6 }],
            !mine && assigned ? s.bubbleAssigned : null,
            hasReactions ? { marginBottom: 14 } : null,
          ]}
        >
          {mine ? <BubbleGradient accent={accent} amber={assigned} /> : null}
          {!mine && message.sender_name ? <Text style={[s.sender, { color: accent }]}>{message.sender_name}</Text> : null}

          {/* the client replied to a specific message (support-chat reply-to) */}
          {message.reply_to ? (
            <TouchableOpacity
              activeOpacity={0.8}
              disabled={!onJumpTo}
              onPress={() => onJumpTo?.(message.reply_to!.id)}
              style={[s.quote, mine ? s.quoteMine : s.quoteTheirs, { borderLeftColor: mine ? '#fff' : accent }]}
            >
              <Text style={[s.quoteName, { color: mine ? '#fff' : accent }]} numberOfLines={1}>
                {message.reply_to.sender_name || 'Message'}
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

          {message.visit ? <VisitTagSummary visit={message.visit} mine={mine} /> : null}

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
            <TouchableOpacity activeOpacity={0.9} disabled={message.pending || message.failed} onPress={() => onOpenPhoto(message.id)}>
              <ChatPhoto url={url} width={photoSize.width} height={photoSize.height} uploading={message.pending} />
            </TouchableOpacity>
          ) : null}

          {message.body ? (
            <MessageBody
              body={message.body}
              mentionedName={message.mentioned_name ?? null}
              mine={mine}
              accent={accent}
              searchQuery={searchQuery}
            />
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

          {hasReactions ? <ReactionChips reactions={reactions!} myUserId={myUserId} mine={mine} accent={accent} /> : null}

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

/* ==================================================================== *
 * One Team conversation (Phase 5)
 * ==================================================================== */

/** Same convention as SystemLine — "X added Y" / "X removed Y" / "X renamed this to Y". */
const TeamSystemLine = React.memo(function TeamSystemLine({ message }: { message: TeamMessage }) {
  if (!message.body) return null;
  return (
    <View style={s.systemLine}>
      <Text style={s.systemLineText}>{message.body}</Text>
    </View>
  );
});

/**
 * Same shape as Bubble above, minus the visit tag (not applicable here) —
 * a distinct component rather than a generalised one because ChatMessage
 * and TeamMessage are separate types with different sender_kind value sets
 * ('agent'/'customer'/'system' vs 'staff'/'system'), so the "mine" formula's
 * literal string comparison can't be shared without widening one type into
 * the other. MessageBody itself IS reused as-is — it never depended on
 * ChatMessage, only body/mentionedName/mine/accent.
 */
type ActionRect = { x: number; y: number; w: number; h: number };

const TeamBubble = React.memo(function TeamBubble({
  message,
  accent,
  myUserId,
  conversation,
  onOpenPhoto,
  onRetry,
  onDiscard,
  onReply,
  onActions,
  reactions,
  onJumpTo,
  searchQuery,
}: {
  message: TeamMessage;
  accent: string;
  myUserId: number | undefined;
  conversation: TeamConversationDetail | null;
  onOpenPhoto: (messageId: number) => void;
  onRetry: (localId: number) => void;
  onDiscard: (localId: number) => void;
  /** Swipe a bubble right to reply to it. */
  onReply: (message: TeamMessage) => void;
  /** Long-press a bubble for the reaction bar + Reply; `rect` is the row's window position so the overlay can float the message in place. */
  onActions: (message: TeamMessage, rect: ActionRect) => void;
  /** This message's reactions, if any (already filtered to it). */
  reactions?: TeamReaction[];
  /** Tap a quote block to scroll to the message it quotes. */
  onJumpTo: (messageId: number) => void;
  searchQuery?: string;
}) {
  if (message.sender_kind === 'system') return <TeamSystemLine message={message} />;

  const mine = message.sender_kind === 'staff' && myUserId != null && message.sender_user_id === myUserId;
  // A pending optimistic send shows its local file:// preview immediately —
  // attachment_url doesn't exist yet (see useTeamConversation's send()).
  const url = (message.pending || message.failed) && message.localPhotoUri ? message.localPhotoUri : photoUrl(message.attachment_url);
  const name = message.sender_name || (mine ? 'You' : 'Colleague');
  const photoSize = usePhotoBubbleSize();
  const seenStatus = messageSeenStatus(message, conversation, myUserId, mine);
  const reactionCounts = (reactions ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
    return acc;
  }, {});
  const myReaction = (reactions ?? []).find((r) => r.user_id === myUserId)?.emoji;

  // Swipe-right-to-reply (WhatsApp's own gesture). Hand-rolled on RNGH's
  // classic PanGestureHandler + built-in Animated, same reason ZoomableImage
  // is: no Reanimated worklets in this project (CLAUDE.md §6). Horizontal
  // activation only, so the list's vertical scroll is never claimed.
  const rowRef = React.useRef<View>(null);
  const swipeX = React.useRef(new Animated.Value(0)).current;
  const SWIPE_TRIGGER = 56;
  const canReply = message.id > 0 && !message.pending && !message.failed;
  // Native-driven: the drag is applied on the UI thread, never round-tripped
  // through JS per frame (that per-frame setValue was what made it feel heavy).
  const onSwipe = React.useRef(
    Animated.event([{ nativeEvent: { translationX: swipeX } }], { useNativeDriver: true }),
  ).current;
  const swipeShift = swipeX.interpolate({ inputRange: [0, 80], outputRange: [0, 80], extrapolate: 'clamp' });
  const onSwipeState = (e: { nativeEvent: { state: number; translationX: number } }) => {
    const { state, translationX } = e.nativeEvent;
    if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
      if (state === State.END && translationX >= SWIPE_TRIGGER) onReply(message);
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
        <View style={[s.msgAvatar, { backgroundColor: colorFor(name) }]}>
          <Text style={s.msgAvatarText}>{initial(name)}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        activeOpacity={0.95}
        // Local (negative-id) bubbles have no server id to react/reply to yet.
        onLongPress={
          message.id > 0
            ? () => rowRef.current?.measureInWindow((x, y, w, h) => onActions(message, { x, y, w, h }))
            : undefined
        }
        delayLongPress={300}
        style={[
          s.bubble,
          mine ? { backgroundColor: accent, borderBottomRightRadius: 6 } : [s.bubbleTheirs, { borderBottomLeftRadius: 6 }],
          reactions && reactions.length > 0 ? { marginBottom: 14 } : null,
        ]}
      >
        {mine ? <BubbleGradient accent={accent} /> : null}
        {!mine && message.sender_name ? <Text style={[s.sender, { color: accent }]}>{message.sender_name}</Text> : null}

        {message.reply_to ? (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => onJumpTo(message.reply_to!.id)}
            style={[s.quote, mine ? s.quoteMine : s.quoteTheirs, { borderLeftColor: mine ? '#fff' : accent }]}
          >
            <Text style={[s.quoteName, { color: mine ? '#fff' : accent }]} numberOfLines={1}>
              {message.reply_to.sender_name || 'Colleague'}
            </Text>
            <Text style={[s.quoteBody, { color: mine ? '#ffffffcc' : palette.muted }]} numberOfLines={2}>
              {message.reply_to.body || (message.reply_to.has_photo ? 'Photo' : 'Message')}
            </Text>
          </TouchableOpacity>
        ) : null}

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
          <TouchableOpacity activeOpacity={0.9} disabled={message.pending || message.failed} onPress={() => onOpenPhoto(message.id)}>
            <ChatPhoto url={url} width={photoSize.width} height={photoSize.height} uploading={message.pending} />
          </TouchableOpacity>
        ) : null}

        {message.body ? (
          <MessageBody
            body={message.body}
            mentionedName={message.mentioned_name}
            mentionAll={message.mention_all}
            mine={mine}
            accent={accent}
            searchQuery={searchQuery}
          />
        ) : null}

        <View style={s.timeRow}>
          <Text style={[s.time, { marginTop: 0, alignSelf: 'auto' }, mine ? { color: '#ffffffaa' } : { color: palette.mutedLight }]}>
            {formatTime(message.created_at)}
          </Text>
          {message.failed ? (
            <CircleAlert size={13} color="#ffd6d6" />
          ) : message.pending ? (
            <Clock size={12} color="#ffffffaa" />
          ) : seenStatus === 'seen' ? (
            <CheckCheck size={13} color={s.tickSeen.color} />
          ) : seenStatus === 'delivered' ? (
            <CheckCheck size={13} color="#ffffffcc" />
          ) : seenStatus === 'sent' ? (
            <Check size={13} color="#ffffffaa" />
          ) : null}
        </View>

        {reactions && reactions.length > 0 ? (
          <View style={[s.reactionRow, mine ? { right: 10 } : { left: 10 }]}>
            {Object.entries(reactionCounts).map(([emoji, count]) => (
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
 * WhatsApp-style long-press menu: the page dims, the pressed message floats
 * at exactly where it was (a live copy of its row), a pill of quick reactions
 * sits next to it ("+" opens a bigger set), and a small Reply card sits on the
 * other side. Rendered in-screen, not a Modal (see sheetOverlay's comment) —
 * so positions are converted from window coordinates using this view's own
 * measured window origin.
 */
function MessageActionsOverlay({
  target,
  accent,
  mine,
  renderMessage,
  myEmoji,
  onReact,
  onReply,
  onDelete,
  onClose,
}: {
  target: { rect: ActionRect };
  accent: string;
  /** Which side the message sits on — the pill and menu hug the same side. */
  mine: boolean;
  /** A live, inert copy of the pressed message, drawn where it was (Team and Support bubbles differ, so the caller supplies it). */
  renderMessage: () => React.ReactNode;
  myEmoji: string | null;
  onReact: (emoji: string) => void;
  /** Omit to hide the Reply row (Support chat has no reply-to-message yet). */
  onReply?: () => void;
  /** Admin-only (Team chat) — omit to hide the Delete row. */
  onDelete?: () => void;
  onClose: () => void;
}) {
  const rootRef = React.useRef<View>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number; h: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pop = React.useRef(new Animated.Value(0)).current;
  // One value per quick emoji so they bounce in one after another, like
  // WhatsApp's bar, instead of the whole pill appearing at once.
  const emojiPops = React.useRef(QUICK_REACTIONS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, bounciness: 8, speed: 18 }).start();
    Animated.stagger(
      35,
      emojiPops.map((v) => Animated.spring(v, { toValue: 1, useNativeDriver: true, bounciness: 14, speed: 22 })),
    ).start();
  }, [pop, emojiPops]);

  const { rect } = target;
  const PILL_H = 56;
  const MENU_H = (onReply ? 52 : 0) + (onDelete ? 52 : 0) || 52;

  let pillTop = 0;
  let menuTop = 0;
  let bubbleTop = 0;
  if (origin) {
    bubbleTop = rect.y - origin.y;
    const above = bubbleTop >= PILL_H + 16;
    pillTop = above ? bubbleTop - PILL_H - 8 : bubbleTop + rect.h + 8;
    menuTop = above ? bubbleTop + rect.h + 8 : pillTop + PILL_H + 8;
    menuTop = Math.min(menuTop, origin.h - MENU_H - 12);
  }
  const side = mine ? { right: 12 } : { left: 12 };

  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={s.actionOverlay}
      onLayout={() => rootRef.current?.measureInWindow((x, y, _w, h) => setOrigin({ x, y, h }))}
    >
      <TouchableOpacity style={s.actionBackdrop} activeOpacity={1} onPress={onClose} />

      {origin ? (
        <>
          {/* The message itself, held exactly where it was. */}
          <View pointerEvents="none" style={{ position: 'absolute', left: rect.x - origin.x, top: bubbleTop, width: rect.w }}>
            {renderMessage()}
          </View>

          {pickerOpen ? (
            <Animated.View style={[s.emojiSheet, { opacity: pop }]}>
              <View style={s.emojiSheetHandle} />
              <Text style={s.emojiSheetTitle}>React to message</Text>
              <View style={s.emojiGrid}>
                {EXTRA_REACTIONS.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[s.emojiGridBtn, myEmoji === emoji && { backgroundColor: accent + '1f', borderColor: accent + '66' }]}
                    activeOpacity={0.7}
                    onPress={() => onReact(emoji)}
                  >
                    <Text style={s.emojiGridText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          ) : (
            <>
              <Animated.View
                style={[
                  s.reactionPill,
                  side,
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
                <View style={s.pillDivider} />
                <TouchableOpacity style={s.pillPlus} activeOpacity={0.7} onPress={() => setPickerOpen(true)}>
                  <Plus size={18} color={palette.muted} />
                </TouchableOpacity>
              </Animated.View>

              {onReply || onDelete ? (
                <Animated.View style={[s.actionMenu, side, { top: menuTop, opacity: pop }]}>
                  {onReply ? (
                    <TouchableOpacity style={s.actionRow} activeOpacity={0.7} onPress={onReply}>
                      <Reply size={18} color={palette.ink} />
                      <Text style={s.actionRowText}>Reply</Text>
                    </TouchableOpacity>
                  ) : null}
                  {onDelete ? (
                    <TouchableOpacity style={s.actionRow} activeOpacity={0.7} onPress={onDelete}>
                      <Trash2 size={18} color={palette.danger} />
                      <Text style={[s.actionRowText, { color: palette.danger }]}>Delete</Text>
                    </TouchableOpacity>
                  ) : null}
                </Animated.View>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </View>
  );
}

/**
 * Three bouncing dots, RN's built-in `Animated` API (no Reanimated — see
 * CLAUDE.md §6, same reason SldWalkthrough.tsx doesn't use it either: this
 * project has no babel.config.js for v4's worklets plugin). Purely
 * decorative, so `useNativeDriver: true` throughout — opacity/translateY
 * both run on the native thread.
 */
function TypingDots({ color }: { color: string }) {
  const values = React.useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const loops = values.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(value, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(300 - i * 150 + 150),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values]);

  return (
    <View style={s.typingDotsRow}>
      {values.map((value, i) => (
        <Animated.View
          key={i}
          style={[
            s.typingDot,
            {
              backgroundColor: color,
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
              transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * The small dark "…" pill WhatsApp floats directly above its own compose
 * bar while the other side is typing — not a chat bubble in the message
 * list, a fixed row between the messages and the composer (see
 * TeamThreadView below), left-aligned, disappearing the instant
 * typingNames empties out.
 */
function TypingPill() {
  return (
    <View style={s.typingPillRow}>
      <View style={s.typingPill}>
        <TypingDots color="#ffffffcc" />
      </View>
    </View>
  );
}

function TeamThreadView({ conversationId, onBack }: { conversationId: number; onBack: () => void }) {
  const { accent } = useAccent();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { conversation, messages, loading, error, sending, send, retry, discard, reactions, react, typingUserIds, notifyTyping, stopTyping, hasMore, loadingOlder, loadOlder, deleteMessage } =
    useTeamConversation(conversationId, user?.id);
  // Only an org-level admin can delete messages (the server enforces the same rule).
  const isAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';
  const confirmDelete = (m: TeamMessage) => {
    setActionTarget(null);
    Alert.alert('Delete message?', 'This removes it for everyone in the chat.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const err = await deleteMessage(m.id);
          if (err) Alert.alert('Could not delete', err);
        },
      },
    ]);
  };

  const [draft, setDraft] = useState(() => teamDraftCache.get(conversationId) ?? '');
  const [photo, setPhoto] = useState<ChatPhotoInput | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionedUserId, setMentionedUserId] = useState<number | null>(null);
  const [mentionedName, setMentionedName] = useState<string | null>(null);
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null);
  // The message the next send will quote (long-press a bubble to set it).
  const [replyTo, setReplyTo] = useState<TeamMessage | null>(null);
  // The message whose reaction bar / Reply menu is open (long-press), with where it sits on screen.
  const [actionTarget, setActionTarget] = useState<{ message: TeamMessage; rect: ActionRect } | null>(null);
  const reactionsByMessage = useMemo(() => {
    const map = new Map<number, TeamReaction[]>();
    for (const r of reactions) {
      const list = map.get(r.message_id);
      if (list) list.push(r);
      else map.set(r.message_id, [r]);
    }
    return map;
  }, [reactions]);
  // Stable identity — TeamBubble is memo'd (see jumpTo/openPhoto below).
  const openActions = useCallback((m: TeamMessage, rect: ActionRect) => setActionTarget({ message: m, rect }), []);
  const listRef = React.useRef<FlatList<TeamMessage>>(null);
  const chatScroll = useChatScroll(listRef, true, { hasMore, loadingOlder, loadOlder }, messages.length > 0);

  // Every photo message in THIS thread, in the same chronological order as
  // `messages` itself (not reversed, unlike GroupInfoView's media grid) —
  // tapping a bubble opens the viewer already positioned on that photo,
  // and swiping from there moves through the conversation in reading
  // order, the same as WhatsApp's own in-chat photo viewer.
  const photoMedia = useMemo(
    () =>
      messages
        .filter((m) => !!m.attachment_url && mediaKind(m.attachment_name || m.attachment_url) === 'image')
        .map((m) => ({
          id: m.id,
          url: photoUrl(m.attachment_url),
          senderName: m.sender_name,
          createdAt: m.created_at,
        })),
    [messages],
  );
  const replyRef = (m: TeamMessage): TeamReplyRef => ({
    id: m.id,
    sender_name: m.sender_user_id === user?.id ? 'You' : m.sender_name,
    body: m.body,
    has_photo: !!m.attachment_url || !!m.localPhotoUri,
  });
  // useCallback, not plain functions: TeamBubble is React.memo, and a new
  // function identity per render would defeat it — every keystroke in the
  // composer would re-render every visible bubble.
  // Stable identities (latest data read through refs) so memoised bubbles don't all re-render on every send.
  const teamMessagesRef = React.useRef(messages);
  teamMessagesRef.current = messages;
  const teamPhotoMediaRef = React.useRef(photoMedia);
  teamPhotoMediaRef.current = photoMedia;
  const jumpTo = useCallback((messageId: number) => {
    const idx = teamMessagesRef.current.findIndex((m) => m.id === messageId);
    if (idx >= 0) listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
  }, []);
  const openPhoto = useCallback((messageId: number) => {
    const idx = teamPhotoMediaRef.current.findIndex((m) => m.id === messageId);
    if (idx >= 0) setPhotoViewerIndex(idx);
  }, []);

  // Search-in-chat — WhatsApp's own header search icon. Client-side, over
  // whatever this thread has already loaded (up to 500 messages, see
  // useTeamConversation) rather than a new backend search endpoint: this
  // is internal staff chat, not years of WhatsApp history, so "search what
  // the thread already has in memory" covers the real case without new
  // server-side infrastructure.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchPos, setSearchMatchPos] = useState(0);

  // {idx} is this match's position in the FULL `messages` array — what
  // FlatList's scrollToIndex actually needs — not its position among
  // matches, which searchMatchPos tracks separately.
  const searchMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return messages.reduce<number[]>((acc, m, idx) => {
      if (m.sender_kind !== 'system' && (m.body || '').toLowerCase().includes(q)) acc.push(idx);
      return acc;
    }, []);
  }, [messages, searchQuery]);

  const scrollToSearchMatch = (pos: number) => {
    const targetIdx = searchMatches[pos];
    if (targetIdx == null) return;
    listRef.current?.scrollToIndex({ index: targetIdx, animated: true, viewPosition: 0.5 });
  };

  // Jump to the MOST RECENT match first (matches WhatsApp's own default),
  // then up/down step further back / forward through older/newer ones.
  useEffect(() => {
    if (searchMatches.length === 0) return;
    const last = searchMatches.length - 1;
    setSearchMatchPos(last);
    scrollToSearchMatch(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, messages.length]);

  const stepSearchMatch = (direction: -1 | 1) => {
    if (searchMatches.length === 0) return;
    const next = (searchMatchPos + direction + searchMatches.length) % searchMatches.length;
    setSearchMatchPos(next);
    scrollToSearchMatch(next);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery('');
    setSearchMatchPos(0);
  };

  // Android hardware back closes search first, same convention every other
  // in-screen overlay in this file follows (useSheetBackButton) — not that
  // hook itself, since this one only needs to listen while searchOpen is
  // actually true, not for the component's whole lifetime.
  useEffect(() => {
    if (!searchOpen) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSearch();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen]);

  // Scoped to THIS conversation's own participants, not the whole staff
  // directory — the backend refuses a mention for anyone who isn't actually
  // a participant, so a wider picker here would just invite a 400.
  const mentionCandidates = useMemo(
    () => (conversation?.participants ?? []).filter((p) => p.id !== user?.id),
    [conversation, user],
  );
  const isGroup = conversation?.kind === 'group';
  // WhatsApp-style "@all" row, groups only, shown while what's typed so far
  // is a prefix of "all" (or nothing yet).
  const showAllOption =
    isGroup && mentionQuery !== null && 'all'.startsWith(mentionQuery.trim().toLowerCase());
  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.trim().toLowerCase();
    return q ? mentionCandidates.filter((p) => (p.name || '').toLowerCase().includes(q)) : mentionCandidates;
  }, [mentionQuery, mentionCandidates]);

  // Names, not ids, for the header line below — resolved against this
  // conversation's own participant list rather than a directory lookup,
  // same source TeamBubble/mention picker already use for names here.
  const typingNames = useMemo(() => {
    if (!conversation) return [];
    return typingUserIds
      .map((id) => conversation.participants.find((p) => p.id === id)?.name)
      .filter((name): name is string => !!name);
  }, [typingUserIds, conversation]);

  const onDraftChange = (text: string) => {
    setDraft(text);
    // Survives navigating away and back — see teamDraftCache's own comment
    // (near INBOX_POLL_MS) for why this can't just live in this
    // component's state: TeamThreadView fully unmounts when you back out
    // to the list.
    if (text) teamDraftCache.set(conversationId, text);
    else teamDraftCache.delete(conversationId);
    if (text.trim().length > 0) {
      notifyTyping();
    } else {
      stopTyping();
    }
    const m = /(?:^|\s)@(\w*)$/.exec(text);
    setMentionQuery(m ? m[1] : null);
    if (mentionedName && !text.includes(`@${mentionedName}`)) {
      setMentionedUserId(null);
      setMentionedName(null);
    }
  };

  const pickMention = (person: TeamParticipant) => {
    const name = person.name || `User ${person.id}`;
    setDraft((prev) => {
      const next = prev.replace(/(?:^|\s)@(\w*)$/, (whole) => `${whole.startsWith(' ') ? ' ' : ''}@${name} `);
      teamDraftCache.set(conversationId, next);
      return next;
    });
    setMentionedUserId(person.id);
    setMentionedName(name);
    setMentionQuery(null);
  };

  const pickMentionAll = () => {
    setDraft((prev) => {
      const next = prev.replace(/(?:^|\s)@(\w*)$/, (whole) => `${whole.startsWith(' ') ? ' ' : ''}@all `);
      teamDraftCache.set(conversationId, next);
      return next;
    });
    setMentionQuery(null);
  };


  const onSend = async () => {
    // Derived from the text itself, so deleting the "@all" un-mentions it.
    const mentionAll = isGroup && /(^|\s)@all\b/i.test(draft);
    const ok = await send({ body: draft, photo, mentionedUserId, mentionAll, replyTo: replyTo ? replyRef(replyTo) : null });
    if (!ok) return;
    setDraft('');
    teamDraftCache.delete(conversationId);
    setPhoto(null);
    setReplyTo(null);
    setMentionedUserId(null);
    setMentionedName(null);
    setMentionQuery(null);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  // Voice note (hold the mic) and recorded video are sent straight away — no Send button.
  const sendMedia = async (file: ChatPhotoInput) => {
    const ok = await send({ body: '', photo: file, replyTo: replyTo ? replyRef(replyTo) : null });
    if (!ok) return;
    setReplyTo(null);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };
  const voice = useVoiceHold(sendMedia);

  const canSend = (draft.trim().length > 0 || !!photo) && !sending;
  const composerClearance = 10 + TAB_BAR_CLEARANCE;

  const myRole = conversation?.participants.find((p) => p.id === user?.id)?.role;
  const canManage = conversation?.kind === 'group' && myRole === 'admin';
  const title = conversation?.name || (conversation?.kind === 'group' ? 'Group' : 'Conversation');
  // Presence only applies to a dm — a group shows its member count instead,
  // matching WhatsApp's own convention of never showing "online" for a
  // group header.
  const otherParticipant =
    conversation?.kind === 'dm' ? conversation.participants.find((p) => p.id !== user?.id) ?? null : null;

  // Full-screen replacement, not an overlay on top of the thread — tapping
  // the header of a group opens this the same way WhatsApp's own group info
  // screen works, instead of a "Manage" button opening a sheet.
  if (showInfo && conversation) {
    return (
      <GroupInfoView
        conversation={conversation}
        messages={messages}
        myUserId={user?.id}
        canManage={canManage}
        onBack={() => setShowInfo(false)}
      />
    );
  }

  // Tapping a photo bubble — WhatsApp's own "tap the photo" destination,
  // same full-screen-replace convention as showInfo above.
  if (photoViewerIndex !== null) {
    return <MediaViewerView media={photoMedia} initialIndex={photoViewerIndex} onBack={() => setPhotoViewerIndex(null)} />;
  }

  return (
    <KeyboardScreen style={s.screen}>
      <ChatBackground />

      {searchOpen ? (
        <ChatHeaderBar>
          <TouchableOpacity onPress={closeSearch} style={s.backBtn} hitSlop={8}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search in this chat…"
            placeholderTextColor="rgba(255,255,255,0.7)"
            style={s.searchHeaderInputOnColor}
            autoFocus
            returnKeyType="search"
          />
          {searchQuery.trim() ? (
            <Text style={s.searchMatchCountOnColor}>
              {searchMatches.length > 0 ? `${searchMatchPos + 1}/${searchMatches.length}` : '0/0'}
            </Text>
          ) : null}
          <TouchableOpacity onPress={() => stepSearchMatch(-1)} disabled={searchMatches.length === 0} hitSlop={8}>
            <ChevronUp size={20} color={searchMatches.length === 0 ? 'rgba(255,255,255,0.45)' : '#fff'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => stepSearchMatch(1)} disabled={searchMatches.length === 0} hitSlop={8} style={{ marginLeft: 6 }}>
            <ChevronDown size={20} color={searchMatches.length === 0 ? 'rgba(255,255,255,0.45)' : '#fff'} />
          </TouchableOpacity>
        </ChatHeaderBar>
      ) : (
        <ChatHeaderBar>
          <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={8}>
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.threadHeaderInfo}
            activeOpacity={conversation?.kind === 'group' ? 0.7 : 1}
            disabled={conversation?.kind !== 'group'}
            onPress={() => setShowInfo(true)}
          >
            <View>
              <View style={[s.headerAvatar, { backgroundColor: colorFor(title) }]}>
                <Text style={s.headerAvatarText}>{initial(title)}</Text>
              </View>
              {conversation?.kind === 'dm' && otherParticipant?.online ? <View style={s.onlineDot} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.threadTitleOnColor} numberOfLines={1}>
                {title}
              </Text>
              {typingNames.length > 0 ? (
                <Text style={s.headerSubOnColor} numberOfLines={1}>
                  {typingNames.length === 1
                    ? `${typingNames[0]} is typing…`
                    : typingNames.length === 2
                      ? `${typingNames[0]} and ${typingNames[1]} are typing…`
                      : `${typingNames.length} people are typing…`}
                </Text>
              ) : conversation?.kind === 'group' ? (
                <Text style={s.headerSubOnColor}>{conversation.participants.length} members</Text>
              ) : otherParticipant?.online ? (
                <Text style={[s.headerSubOnColor, { color: '#bbf7d0' }]}>Online</Text>
              ) : otherParticipant?.last_seen_at ? (
                <Text style={s.headerSubOnColor}>{lastSeenLabel(otherParticipant.last_seen_at)}</Text>
              ) : null}
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSearchOpen(true)} style={s.backBtn} hitSlop={8}>
            <Search size={20} color="#fff" />
          </TouchableOpacity>
        </ChatHeaderBar>
      )}

      {loading && messages.length === 0 ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : error && messages.length === 0 ? (
        <View style={s.centre}>
          <CircleAlert size={22} color={palette.danger} />
          <Text style={s.emptyTitle}>Could not load</Text>
          <Text style={s.emptyBody}>{error}</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={s.centre}>
          <MessagesSquare size={24} color={palette.mutedLight} />
          <Text style={s.emptyTitle}>No messages yet</Text>
          <Text style={s.emptyBody}>Say hello to start the conversation.</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          style={[{ flex: 1 }, chatScroll.hiddenStyle]}
          onScroll={chatScroll.onScroll}
          // Lay out the whole page (≤40, then ≤40 more per older page) in the FIRST pass: with the default
          // 10-item window the list's end is only an estimate, so scrollToEnd landed short of the newest message.
          initialNumToRender={60}
          maxToRenderPerBatch={60}
          windowSize={31}
          removeClippedSubviews={false}
          onScrollBeginDrag={chatScroll.onScrollBeginDrag}
          scrollEventThrottle={64}
          maintainVisibleContentPosition={chatScroll.maintainVisibleContentPosition}
          contentContainerStyle={s.messageList}
          showsVerticalScrollIndicator={false}
          // Auto-scroll-to-newest would fight an active search jump (a new
          // message landing mid-search shouldn't yank the view away from
          // whatever match is currently focused).
          onContentSizeChange={() => {
            if (!searchOpen) chatScroll.onContentSizeChange();
          }}
          // Variable bubble heights mean scrollToIndex can't always land
          // exactly on the first attempt — this is the standard FlatList
          // fallback: estimate an offset from the average row height, then
          // retry once layout has caught up.
          onScrollToIndexFailed={(info) => {
            const offset = info.averageItemLength * info.index;
            listRef.current?.scrollToOffset({ offset, animated: false });
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }), 100);
          }}
          renderItem={({ item }) => (
            <TeamBubble
              message={item}
              accent={accent}
              myUserId={user?.id}
              conversation={conversation}
              onOpenPhoto={openPhoto}
              onRetry={retry}
              onDiscard={discard}
              onReply={setReplyTo}
              onActions={openActions}
              reactions={reactionsByMessage.get(item.id)}
              onJumpTo={jumpTo}
              searchQuery={searchOpen ? searchQuery : undefined}
            />
          )}
        />
      )}

      {typingNames.length > 0 ? <TypingPill /> : null}

      {actionTarget ? (
        <MessageActionsOverlay
          target={actionTarget}
          accent={accent}
          mine={actionTarget.message.sender_kind === 'staff' && actionTarget.message.sender_user_id === user?.id}
          renderMessage={() => (
            <TeamBubble
              message={actionTarget.message}
              accent={accent}
              myUserId={user?.id}
              conversation={conversation}
              reactions={reactionsByMessage.get(actionTarget.message.id)}
              onOpenPhoto={() => {}}
              onRetry={() => {}}
              onDiscard={() => {}}
              onReply={() => {}}
              onActions={() => {}}
              onJumpTo={() => {}}
            />
          )}
          myEmoji={
            reactions.find((r) => r.message_id === actionTarget.message.id && r.user_id === user?.id)?.emoji ?? null
          }
          onReact={(emoji) => {
            react(actionTarget.message.id, emoji);
            setActionTarget(null);
          }}
          onReply={() => {
            setReplyTo(actionTarget.message);
            setActionTarget(null);
          }}
          onDelete={isAdmin && actionTarget.message.id > 0 ? () => confirmDelete(actionTarget.message) : undefined}
          onClose={() => setActionTarget(null)}
        />
      ) : null}

      <View style={[s.composerWrap, { paddingBottom: composerClearance }]}>
        {error && messages.length > 0 ? <Text style={s.sendError}>{error}</Text> : null}

        {replyTo ? (
          <View style={[s.replyBar, { borderLeftColor: accent }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.quoteName, { color: accent }]} numberOfLines={1}>
                Replying to {replyTo.sender_user_id === user?.id ? 'yourself' : replyTo.sender_name || 'colleague'}
              </Text>
              <Text style={[s.quoteBody, { color: palette.muted }]} numberOfLines={1}>
                {replyTo.body || (replyTo.attachment_url ? attachmentLabel(replyTo.attachment_name || replyTo.attachment_url) : 'Message')}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={8}>
              <X size={16} color={palette.muted} />
            </TouchableOpacity>
          </View>
        ) : null}

        {mentionQuery !== null ? (
          <View style={s.mentionBox}>
            {mentionMatches.length === 0 && !showAllOption ? (
              <Text style={s.mentionEmpty}>No one matches "@{mentionQuery}"</Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {showAllOption ? (
                  <TouchableOpacity style={s.mentionRow} activeOpacity={0.8} onPress={pickMentionAll}>
                    <View style={[s.mentionAvatar, { backgroundColor: accent }]}>
                      <Text style={s.mentionAvatarText}>@</Text>
                    </View>
                    <Text style={s.mentionRowText} numberOfLines={1}>
                      all — notify everyone in this group
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {mentionMatches.map((person) => (
                  <TouchableOpacity
                    key={person.id}
                    style={s.mentionRow}
                    activeOpacity={0.8}
                    onPress={() => pickMention(person)}
                  >
                    <View style={[s.mentionAvatar, { backgroundColor: colorFor(person.name || 'A') }]}>
                      <Text style={s.mentionAvatarText}>{initial(person.name || 'A')}</Text>
                    </View>
                    <Text style={s.mentionRowText} numberOfLines={1}>
                      {person.name || `User ${person.id}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}

        {photo ? (
          <View style={s.attachRow}>
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
          </View>
        ) : null}

        <View style={s.composerRow}>
          {voice.recording ? (
            <VoiceRecordingBar voice={voice} />
          ) : (
          <View style={s.pill}>
            <TextInput
              value={draft}
              onChangeText={onDraftChange}
              placeholder="Message… (@ to mention someone)"
              placeholderTextColor={palette.mutedLight}
              style={s.pillInput}
              multiline
            />
            {/* WhatsApp-style camera: tap = open camera (gallery button inside it), hold = record video straight away. */}
            <CameraPillButton onPicked={sendMedia} onLibrary={setPhoto} style={s.pillIcon} color={palette.muted} />
          </View>
          )}
          {canSend && !voice.recording ? (
            <TouchableOpacity onPress={onSend} style={[s.sendBtn, { backgroundColor: accent }]}>
              {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={18} color="#fff" />}
            </TouchableOpacity>
          ) : (
            // Nothing to send → the mic: HOLD to record, release to send, slide left to cancel.
            <VoiceMicButton voice={voice} accent={accent} buttonStyle={s.sendBtn} />
          )}
        </View>
      </View>
    </KeyboardScreen>
  );
}

/**
 * Full-screen contact picker — WhatsApp's own "New chat"/"Add participants"
 * screen shape: a normal screen with a search bar under the header and a
 * plain scrolling list below it, not a bottom sheet. Reused by both
 * NewConversationSheet (start a DM, or pick a new group's members) and
 * GroupInfoView (add members to an existing group) so the two flows share
 * one implementation instead of drifting apart.
 *
 * `multi` decides the interaction: false fires `onPickSingle` immediately on
 * tap (a DM); true toggles a checkbox via `onToggle` and waits for the
 * header's confirm action. Nothing here is keyboard-sheet-positioning logic
 * — the search box lives at the top of an ordinary screen, so the keyboard
 * overlap problems the old bottom sheets had structurally can't happen here.
 */
function PeoplePickerView({
  title,
  people,
  loading,
  loadError,
  multi,
  selectedIds,
  disabledIds,
  onToggle,
  onPickSingle,
  confirmLabel,
  confirmDisabled,
  busy,
  onConfirm,
  headerExtra,
  emptyHint,
  onBack,
}: {
  title: string;
  people: StaffDirectoryUser[];
  loading: boolean;
  loadError?: string | null;
  multi: boolean;
  selectedIds?: number[];
  disabledIds?: Set<number>;
  onToggle?: (id: number) => void;
  onPickSingle?: (id: number) => void;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  busy?: boolean;
  onConfirm?: () => void;
  headerExtra?: React.ReactNode;
  emptyHint?: string;
  onBack: () => void;
}) {
  const { accent } = useAccent();
  useSheetBackButton(onBack);
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => filterDirectory(people, query), [people, query]);

  return (
    <View style={s.screen}>
      <PageHeader
        title={title}
        onBack={onBack}
        right={
          multi && onConfirm ? (
            <TouchableOpacity onPress={onConfirm} disabled={confirmDisabled || busy} hitSlop={8}>
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  style={[s.pickerConfirmText, { color: confirmDisabled ? 'rgba(255,255,255,0.5)' : '#fff' }]}
                >
                  {confirmLabel || 'Done'}
                </Text>
              )}
            </TouchableOpacity>
          ) : undefined
        }
      />

      {headerExtra}

      <View style={s.searchWrap}>
        <Search size={16} color={palette.mutedLight} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or email…"
          placeholderTextColor={palette.mutedLight}
          style={s.searchInput}
          autoCapitalize="none"
        />
      </View>

      {loading ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : loadError ? (
        <View style={s.centre}>
          <CircleAlert size={22} color={palette.danger} />
          <Text style={s.emptyTitle}>Could not load people</Text>
          <Text style={s.emptyBody}>{loadError}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const disabled = disabledIds?.has(item.id) ?? false;
            const selected = selectedIds?.includes(item.id) ?? false;
            const name = item.name || item.email || `User ${item.id}`;
            return (
              <TouchableOpacity
                style={[s.pickerRow, disabled && { opacity: 0.4 }]}
                activeOpacity={0.85}
                disabled={disabled || busy}
                onPress={() => (multi ? onToggle?.(item.id) : onPickSingle?.(item.id))}
              >
                <View style={[s.avatar, { backgroundColor: colorFor(name) }]}>
                  <Text style={s.avatarText}>{initial(name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowName} numberOfLines={1}>
                    {name}
                  </Text>
                  {item.email ? (
                    <Text style={s.rowPreview} numberOfLines={1}>
                      {item.email}
                    </Text>
                  ) : null}
                </View>
                {multi ? (
                  <View style={[s.pickerCheck, selected && { backgroundColor: accent, borderColor: accent }]}>
                    {selected ? <Check size={13} color="#fff" /> : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <Text style={s.emptyTitle}>No one matches</Text>
              <Text style={s.emptyBody}>
                {query.trim() ? 'Try a different search.' : emptyHint || 'No eligible people to show.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

/**
 * Full-screen group info — WhatsApp's own "tap the group name" destination,
 * replacing the old Manage-button bottom sheet (TeamThreadView opens this
 * via the same tap-the-header interaction WhatsApp uses, see the early
 * return near the top of that component). Renders in place of the thread;
 * itself early-returns to PeoplePickerView while adding members, matching
 * the same full-screen-replace convention used everywhere else in this
 * file (StaffChatsScreen ↔ list/thread, TeamThreadView ↔ this).
 */
function GroupInfoView({
  conversation,
  messages,
  myUserId,
  canManage,
  onBack,
}: {
  conversation: TeamConversationDetail;
  messages: TeamMessage[];
  myUserId: number | undefined;
  canManage: boolean;
  onBack: () => void;
}) {
  const { accent } = useAccent();
  useSheetBackButton(onBack);
  const [live, setLive] = useState(conversation);
  useEffect(() => setLive(conversation), [conversation]);

  const [addOpen, setAddOpen] = useState(false);
  const [addSelected, setAddSelected] = useState<number[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(live.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const { data: dirData, loading: dirLoading } = useStaffDirectory();
  const currentIds = useMemo(() => new Set(live.participants.map((p) => p.id)), [live]);

  // Newest first — same order WhatsApp's own group-media grid uses. Derived
  // from whatever this conversation's thread has already loaded (up to 500
  // messages, see useTeamConversation) rather than a separate endpoint —
  // every photo message already carries everything a gallery needs.
  const media = useMemo(
    () =>
      messages
        .filter((m) => !!m.attachment_url && mediaKind(m.attachment_name || m.attachment_url) === 'image')
        .map((m) => ({
          id: m.id,
          url: photoUrl(m.attachment_url),
          senderName: m.sender_name,
          createdAt: m.created_at,
        }))
        .reverse(),
    [messages],
  );

  const title = live.name || 'Group';

  const onSaveRename = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === live.name) {
      setRenaming(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await renameTeamGroup(live.id, trimmed);
      setLive(updated);
      setRenaming(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not rename the group.'));
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (userId: number) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateTeamGroupMembers(live.id, { remove: [userId] });
      setLive(updated);
    } catch (err) {
      setError(errorMessage(err, 'Could not remove that person.'));
    } finally {
      setBusy(false);
    }
  };

  const onConfirmAdd = async () => {
    if (addSelected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateTeamGroupMembers(live.id, { add: addSelected });
      setLive(updated);
      setAddSelected([]);
      setAddOpen(false);
    } catch (err) {
      setError(errorMessage(err, 'Could not add those people.'));
    } finally {
      setBusy(false);
    }
  };

  if (addOpen) {
    return (
      <PeoplePickerView
        title="Add members"
        people={(dirData?.users ?? []).filter((u) => !currentIds.has(u.id))}
        loading={dirLoading}
        multi
        selectedIds={addSelected}
        onToggle={(id) =>
          setAddSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
        }
        confirmLabel={`Add (${addSelected.length})`}
        confirmDisabled={addSelected.length === 0 || busy}
        busy={busy}
        onConfirm={onConfirmAdd}
        emptyHint="Everyone eligible is already in this group."
        onBack={() => {
          setAddOpen(false);
          setAddSelected([]);
        }}
      />
    );
  }

  if (viewerIndex !== null) {
    return <MediaViewerView media={media} initialIndex={viewerIndex} onBack={() => setViewerIndex(null)} />;
  }

  return (
    <View style={s.screen}>
      <PageHeader title="Group info" onBack={onBack} />

      <ScrollView
        contentContainerStyle={s.groupInfoBody}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.groupInfoHeader}>
          <View style={[s.groupInfoAvatar, { backgroundColor: colorFor(title) }]}>
            <Text style={s.groupInfoAvatarText}>{initial(title)}</Text>
          </View>

          {canManage && renaming ? (
            <View style={s.pickerSearchWrap}>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Group name"
                placeholderTextColor={palette.mutedLight}
                style={s.pickerSearchInput}
                autoFocus
                onSubmitEditing={onSaveRename}
              />
              <TouchableOpacity onPress={onSaveRename} disabled={busy} hitSlop={8}>
                <Check size={18} color={accent} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={s.groupInfoNameRow}
              activeOpacity={canManage ? 0.7 : 1}
              disabled={!canManage}
              onPress={() => {
                setName(live.name || '');
                setRenaming(true);
              }}
            >
              <Text style={s.groupInfoName} numberOfLines={2}>
                {title}
              </Text>
              {canManage ? <Pencil size={15} color={palette.mutedLight} /> : null}
            </TouchableOpacity>
          )}
          <Text style={s.headerSub}>Group · {live.participants.length} members</Text>
        </View>

        {error ? <Text style={[s.sheetError, { paddingHorizontal: 20 }]}>{error}</Text> : null}

        {canManage ? (
          <TouchableOpacity style={s.groupInfoAction} activeOpacity={0.8} onPress={() => setAddOpen(true)}>
            <View style={[s.groupInfoActionIcon, { backgroundColor: accent }]}>
              <UserPlus size={16} color="#fff" />
            </View>
            <Text style={[s.groupInfoActionText, { color: accent }]}>Add members</Text>
          </TouchableOpacity>
        ) : null}

        {media.length > 0 ? (
          <>
            <Text style={s.groupInfoSectionLabel}>{media.length} MEDIA</Text>
            <View style={s.mediaGrid}>
              {media.slice(0, 9).map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  style={s.mediaThumbWrap}
                  activeOpacity={0.85}
                  onPress={() => setViewerIndex(idx)}
                >
                  {item.url ? <Image source={{ uri: item.url }} style={s.mediaThumb} contentFit="cover" /> : null}
                </TouchableOpacity>
              ))}
            </View>
            {media.length > 9 ? (
              <Text style={s.groupInfoMediaMore}>+{media.length - 9} more shared in this group</Text>
            ) : null}
          </>
        ) : null}

        <Text style={s.groupInfoSectionLabel}>{live.participants.length} MEMBERS</Text>
        {live.participants.map((p) => (
          <View key={p.id} style={[s.sheetRow, { paddingHorizontal: 20 }]}>
            <View style={[s.avatar, { width: 38, height: 38, borderRadius: 13, backgroundColor: colorFor(p.name || 'A') }]}>
              <Text style={[s.avatarText, { fontSize: 14 }]}>{initial(p.name || 'A')}</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.sheetRowText} numberOfLines={1}>
                {p.name || `User ${p.id}`}
                {p.id === myUserId ? ' (You)' : ''}
              </Text>
              {p.role === 'admin' ? <Text style={s.sheetRowSub}>Group admin</Text> : null}
            </View>
            {canManage && p.id !== myUserId ? (
              <TouchableOpacity onPress={() => onRemove(p.id)} disabled={busy} hitSlop={8}>
                <X size={16} color={palette.mutedLight} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

type GroupMediaItem = { id: number; url: string | null; senderName: string | null; createdAt: string };

/**
 * Full-screen swipe-through viewer — reused for both GroupInfoView's media
 * grid AND tapping a photo bubble directly in a thread (TeamThreadView),
 * the WhatsApp "tap a photo" destination either way. Same full-screen-
 * replace convention as everything else in this file rather than a Modal
 * (see sheetOverlay's own comment for why this file avoids Modal for
 * anything that needs to feel native, though this screen has no keyboard
 * involved — it's just consistency with the rest of the file's navigation
 * style).
 */
function MediaViewerView({
  media,
  initialIndex,
  onBack,
}: {
  media: GroupMediaItem[];
  initialIndex: number;
  onBack: () => void;
}) {
  useSheetBackButton(onBack);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  // Swiping to the next/previous photo while the current one is zoomed in
  // reads as a mistake more often than not (WhatsApp itself expects you to
  // zoom back out first) — this just disables the FlatList's own paging
  // for as long as ANY page reports itself zoomed, rather than trying to
  // arbitrate the two gestures against each other.
  const [pagingEnabled, setPagingEnabled] = useState(true);
  const listRef = React.useRef<FlatList<GroupMediaItem>>(null);
  const current = media[index];
  const viewportHeight = height - insets.top - insets.bottom - 70;

  return (
    <View style={[s.screen, { backgroundColor: '#000' }]}>
      <View style={[s.mediaViewerHeader, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={8}>
          <ChevronLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.mediaViewerName} numberOfLines={1}>
            {current?.senderName || 'Photo'}
          </Text>
          {current ? <Text style={s.mediaViewerDate}>{formatDateTime(current.createdAt)}</Text> : null}
        </View>
        {media.length > 1 ? (
          <Text style={s.mediaViewerCount}>
            {index + 1} / {media.length}
          </Text>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={media}
        horizontal
        pagingEnabled
        scrollEnabled={pagingEnabled}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(item) => String(item.id)}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => {
          setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={{ width, height: viewportHeight, alignItems: 'center', justifyContent: 'center' }}>
            {item.url ? (
              <ZoomableImage uri={item.url} width={width} height={viewportHeight} onZoomChange={(zoomed) => setPagingEnabled(!zoomed)} />
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 6 },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  // Coloured list header (see ChatsHeader)
  listTitle: { fontSize: 26, fontWeight: '900', color: '#fff' },
  listSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.95)', marginBottom: 12 },
  dayHeader: {
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: palette.muted,
    paddingHorizontal: 6,
    paddingTop: 8,
    paddingBottom: 2,
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  promoCard: {
    marginTop: 14,
    borderRadius: 22,
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  promoInner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 22, padding: 18 },
  promoTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  promoSub: { color: 'rgba(255,255,255,0.95)', fontSize: 12.5, fontWeight: '600', marginTop: 3 },
  promoIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 18,
    padding: 14,
  },
  tipIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  tipText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: palette.muted, lineHeight: 18 },
  statRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statChip: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 5 },
  statChipText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  rowUnread: { backgroundColor: '#ffffff' },
  rowEdge: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 4, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  rowNameUnread: { fontWeight: '900' },
  waitingChip: { alignSelf: 'flex-start', backgroundColor: '#fef3c7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, marginTop: 5 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 116,
    width: 58,
    height: 58,
    borderRadius: 29,
    shadowColor: '#0f172a',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabInner: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  bubbleGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14, padding: 4 },
  segmentBtn: { flex: 1, alignItems: 'center', borderRadius: 11, paddingVertical: 9 },
  segmentBtnOn: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  segmentText: { fontSize: 13.5, fontWeight: '800', color: '#fff' },
  // Thread header (on the accent colour)
  headerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  onlineDot: { position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: '#22c55e', borderWidth: 2, borderColor: '#fff' },
  threadTitleOnColor: { fontSize: 17, fontWeight: '900', color: '#fff' },
  headerSubOnColor: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.95)', marginTop: 1 },
  searchHeaderInputOnColor: { flex: 1, fontSize: 15.5, color: '#fff', paddingVertical: 4 },
  searchMatchCountOnColor: { fontSize: 12.5, fontWeight: '800', color: '#fff', marginRight: 4 },
  headerChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 110 },
  headerChipOn: { backgroundColor: '#fff' },
  headerChipIcon: { width: 36, height: 36, borderRadius: 18, paddingHorizontal: 0, paddingVertical: 0, justifyContent: 'center', maxWidth: 36 },
  headerChipText: { fontSize: 11.5, fontWeight: '800' },
  title: { fontSize: 24, fontWeight: '900', color: palette.ink },
  headerSub: { fontSize: 12.5, fontWeight: '600', color: palette.mutedLight, marginTop: 3 },

  tabRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginTop: 10 },
  tabPill: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tabPillText: { fontSize: 12.5, fontWeight: '800', color: palette.muted },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 14, color: palette.ink },
  searchHeaderInput: { flex: 1, fontSize: 15, color: palette.ink, paddingVertical: 4 },
  searchMatchCount: { fontSize: 12, fontWeight: '700', color: palette.mutedLight, marginRight: 4 },

  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 140, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 13,
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  // Pinned-to-top treatment for a conversation with an unread @-mention —
  // deliberately a different (danger/red) color from the normal accent, so
  // "someone tagged you" reads as visually distinct from an ordinary unread
  // message, matching the "top priority" ask this was built for.
  rowMentioned: { borderWidth: 1.5, borderColor: palette.danger, backgroundColor: '#fff5f5' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { flex: 1, fontSize: 14.5, fontWeight: '800', color: palette.ink },
  rowTime: { fontSize: 11, fontWeight: '600', color: palette.mutedLight },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  mentionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: palette.danger,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mentionPillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rowPreview: { flex: 1, fontSize: 12.5, fontWeight: '600', color: palette.muted },
  rowAssigned: { fontSize: 10.5, fontWeight: '600', color: palette.mutedLight, marginTop: 3 },
  // assigned to me + open (the dark theme maps the light yellow to a dark amber automatically)
  rowAssignedMine: { backgroundColor: '#FFF6D6', borderWidth: 1.5, borderColor: '#F5C84A' },
  assignedMinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: keep('#FDE68A'), // stays yellow-on-dark-text in both themes
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 5,
  },
  assignedMineText: { fontSize: 11, fontWeight: '800', color: keep(ASSIGNED_TEXT) },
  unreadBadge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  unreadBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '900' },

  emptyCard: { alignItems: 'center', gap: 6, marginTop: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', color: palette.ink, marginTop: 6 },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 19 },

  threadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  threadTitle: { fontSize: 16.5, fontWeight: '900', color: palette.ink },
  threadHeaderInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },

  // Full-screen picker/info views (GroupInfoView, PeoplePickerView) — the
  // WhatsApp-style replacement for the old bottom-sheet ManageGroupSheet.
  // Same header shape as threadHeader above but with an optional right-side
  // confirm action instead of the avatar+title being the whole row.
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  pickerHeaderTitle: { flex: 1, fontSize: 16.5, fontWeight: '900', color: palette.ink },
  pickerConfirmText: { fontSize: 14, fontWeight: '800' },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pickerCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupInfoBody: { paddingBottom: 60 },
  groupInfoHeader: { alignItems: 'center', paddingVertical: 22, paddingHorizontal: 24, gap: 6 },
  groupInfoAvatar: { width: 88, height: 88, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  groupInfoAvatarText: { color: '#fff', fontSize: 30, fontWeight: '900' },
  groupInfoNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' },
  groupInfoName: { fontSize: 20, fontWeight: '900', color: palette.ink, textAlign: 'center' },
  groupInfoAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#eef2f7',
  },
  groupInfoActionIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  groupInfoActionText: { fontSize: 14.5, fontWeight: '800' },
  groupInfoSectionLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: palette.mutedLight,
    letterSpacing: 0.4,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 18, gap: 6 },
  mediaThumbWrap: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#eef2f7',
  },
  mediaThumb: { width: '100%', height: '100%' },
  groupInfoMediaMore: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.mutedLight,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  mediaViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 4,
  },
  mediaViewerName: { fontSize: 14.5, fontWeight: '800', color: '#fff' },
  mediaViewerDate: { fontSize: 11.5, fontWeight: '600', color: '#ffffffaa', marginTop: 2 },
  mediaViewerCount: { fontSize: 12.5, fontWeight: '700', color: '#ffffffcc', paddingRight: 6 },

  assignChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 120,
    backgroundColor: palette.borderSubtle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  assignChipText: { fontSize: 11.5, fontWeight: '800' },

  // Full-bleed in-screen overlay, NOT a react-native <Modal> — a Modal opens
  // its own separate native window on Android, and KeyboardAvoidingView
  // inside that window is unreliable there (a known RN/Android quirk). The
  // composer's own @-mention box already proves the fix: it sits directly
  // in the normal screen tree. Written out by hand rather than
  // StyleSheet.absoluteFillObject — RN 0.86's types dropped that member.
  sheetOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, elevation: 20 },
  // paddingBottom is set inline per sheet to the measured keyboard height —
  // no KeyboardAvoidingView here either: these sheets can render inside a
  // screen that already has its own (the composer's), and a second, nested
  // one reacting to the same keyboard event is unreliable.
  sheetBackdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0', alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: palette.ink, marginBottom: 10 },
  sheetError: { fontSize: 12.5, color: palette.danger, paddingVertical: 8 },
  sheetEmptyText: { fontSize: 12.5, color: palette.mutedLight, textAlign: 'center', paddingVertical: 20 },
  pickerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.bg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, color: palette.ink },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eef2f7',
  },
  sheetRowText: { fontSize: 14, fontWeight: '700', color: palette.ink },
  sheetRowSub: { fontSize: 11.5, color: palette.muted, marginTop: 2 },
  sheetSub: { fontSize: 13, color: palette.muted, lineHeight: 18, paddingHorizontal: 18, paddingTop: 2 },
  sheetCancel: { marginTop: 14, alignItems: 'center', paddingVertical: 12 },
  sheetCancelText: { fontSize: 14, fontWeight: '700', color: palette.muted },

  messageList: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  systemLine: { alignItems: 'center', marginBottom: 10, paddingHorizontal: 30 },
  systemLineText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: palette.muted,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  bubbleLine: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 8 },
  msgAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  msgAvatarText: { color: '#fff', fontSize: 11, fontWeight: '900' },
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
  // a colleague's / the client's message inside an assigned stretch (dark theme maps it to a dark amber)
  bubbleAssigned: { backgroundColor: '#FFF3C4', borderWidth: 1.5, borderColor: '#F5C84A' },
  bubbleTheirs: {
    backgroundColor: '#fff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  sender: { fontSize: 11, fontWeight: '800', marginBottom: 3, color: palette.muted },
  text: { fontSize: 14.5, lineHeight: 21 },
  mentionHighlight: { fontWeight: '800' },
  searchHighlight: { backgroundColor: '#ffd54f', color: keep('#1a1a1a'), borderRadius: 3, fontWeight: '800' },
  typingPillRow: { paddingHorizontal: 16, paddingBottom: 6 },
  typingPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#1f2937',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  typingDotsRow: { flexDirection: 'row', gap: 4 },
  typingDot: { width: 6, height: 6, borderRadius: 3 },
  // WhatsApp's own blue-tick color — kept as a style object (not a bare
  // constant) only so TeamBubble can read `.color` off it, matching how
  // every other tick color here is already threaded through as a plain
  // string prop rather than a StyleSheet id (RN's <Icon color=.../> takes a
  // color value directly, not a style object).
  tickSeen: { color: '#4fc3f7' },
  time: { fontSize: 10.5, fontWeight: '600', marginTop: 4, alignSelf: 'flex-end' },
  // Wraps time + the tick icon for a Team message I sent — Support's own
  // Bubble still renders `time` bare (no ticks there), so this is additive,
  // not a replacement for that style.
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-end' },
  photo: { width: 200, height: 150, borderRadius: 14, marginBottom: 6 },

  visitTag: { borderRadius: 12, padding: 9, marginBottom: 6, minWidth: 180 },
  visitTagMine: { backgroundColor: '#ffffff26' },
  visitTagTheirs: { backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.borderSubtle },
  visitTagTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  visitTagTitle: { flex: 1, fontSize: 12.5, fontWeight: '800' },
  visitTagDot: { width: 6, height: 6, borderRadius: 3 },
  visitTagStatus: { fontSize: 10, fontWeight: '800' },
  visitTagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  visitTagMeta: { fontSize: 11, fontWeight: '600' },

  composerWrap: { paddingHorizontal: 12, paddingTop: 8 },
  // Straddles the bubble's bottom edge (the bubble reserves 14px for it). The
  // chip's border is the chat background colour, so it reads as notched out
  // of the bubble instead of stuck on top of it.
  reactionRow: { position: 'absolute', bottom: -15, flexDirection: 'row', gap: 4 },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fff',
    borderRadius: 13,
    borderWidth: 2,
    borderColor: palette.bg,
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
  pillDivider: { width: 1, height: 24, backgroundColor: '#e6eaf0', marginHorizontal: 4 },
  pillPlus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f4f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionMenu: {
    position: 'absolute',
    minWidth: 190,
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 20 },
  actionRowText: { fontSize: 16, fontWeight: '600', color: palette.ink },
  emojiSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingBottom: 28,
    paddingHorizontal: 12,
    elevation: 16,
  },
  emojiSheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#dfe5ec', alignSelf: 'center', marginBottom: 12 },
  emojiSheetTitle: { fontSize: 14, fontWeight: '800', color: palette.muted, textAlign: 'center', marginBottom: 10 },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  emojiGridBtn: {
    width: '12.5%',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiGridText: { fontSize: 27 },
  swipeHint: {
    position: 'absolute',
    left: 10,
    top: 0,
    bottom: 0,
    width: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderLeftWidth: 3,
    backgroundColor: '#f1f4f8',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  quote: { borderLeftWidth: 3, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 6 },
  quoteMine: { backgroundColor: 'rgba(255,255,255,0.18)' },
  quoteTheirs: { backgroundColor: 'rgba(0,0,0,0.05)' },
  quoteName: { fontSize: 12, fontWeight: '800' },
  quoteBody: { fontSize: 12.5, marginTop: 1 },
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
  failedRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 6 },
  failedText: { fontSize: 11.5, fontWeight: '700', color: '#ffd6d6' },
  failedAction: { fontSize: 12, fontWeight: '800', color: '#fff', textDecorationLine: 'underline' },
  waitingLine: { fontSize: 12.5, fontWeight: '800', color: '#b45309', paddingHorizontal: 18, paddingBottom: 8 },
  timelineWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 18, paddingTop: 10 },
  timelineChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  timelineChipText: { fontSize: 13.5, fontWeight: '800', color: palette.inkSoft },
  timelineGo: { marginHorizontal: 18, marginTop: 16, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  timelineGoText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  rowWaiting: { fontSize: 11.5, fontWeight: '800', color: '#b45309' },
  closedNote: { fontSize: 12, fontWeight: '700', color: palette.muted, textAlign: 'center', marginBottom: 8 },
  sendError: { fontSize: 12, color: palette.danger, marginBottom: 6, paddingHorizontal: 6 },
  mentionBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 8,
    maxHeight: 220,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: -4 },
    elevation: 4,
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  mentionAvatar: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  mentionAvatarText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  mentionRowText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: palette.ink },
  mentionEmpty: { fontSize: 12.5, color: palette.mutedLight, padding: 14, textAlign: 'center' },

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
  pillInput: { flex: 1, maxHeight: 110, fontSize: 15, color: palette.ink, paddingVertical: 10, paddingHorizontal: 2 },
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
});
