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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Animated,
  Easing,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ImagePlus,
  MessagesSquare,
  Send,
  Users,
  X,
} from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useSiteContext } from '../../src/site-context';
import { photoUrl } from '../../src/api/client';
import { useChat, useJobs, formatDateOnly, formatTime, ChatPhotoInput } from '../../src/hooks';
import { ChatMessage } from '../../src/api/types';
// A tagged visit renders as a preview card — photos, site, crew — that opens
// the whole visit in a sheet. See src/components/ChatVisitCard.tsx.
import ChatVisitCard from '../../src/components/ChatVisitCard';

const TAB_BAR_CLEARANCE = 92;
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

  if (activeSite) {
    return (
      <ChatThread
        site={activeSite === 'general' ? null : activeSite}
        onBack={() => setActiveSite(null)}
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
        <View style={[s.blob, { backgroundColor: '#dbeafe', top: -90, left: -70, width: 240, height: 240 }]} />
        <View style={[s.blob, { backgroundColor: '#ede9fe', top: 200, right: -100, width: 240, height: 240 }]} />
      </View>

      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Support</Text>
          <Text style={s.headerSub}>Pick a site to start a conversation</Text>
        </View>
      </View>

      <FlatList
        data={sites}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={s.siteList}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <TouchableOpacity style={s.siteRow} activeOpacity={0.85} onPress={() => onOpen('general')}>
            <View style={[s.siteAvatar, { backgroundColor: '#0f172a' }]}>
              <Users size={18} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.siteName}>General</Text>
              <Text style={s.siteSub} numberOfLines={1}>
                Not about one specific site
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
                  Shared account conversation
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
 * Thread
 * ==================================================================== */

function ChatThread({ site, onBack }: { site: SiteLike | null; onBack: () => void }) {
  const { accent } = useAccent();
  const insets = useSafeAreaInsets();
  const { messages, loading, error, sending, send } = useChat();

  const [draft, setDraft] = useState('');
  const [photo, setPhoto] = useState<ChatPhotoInput | null>(null);
  const [tagId, setTagId] = useState<number | null>(null);
  const [tagOpen, setTagOpen] = useState(false);

  const [ringing, setRinging] = useState(false);
  const [ringCooldownUntil, setRingCooldownUntil] = useState(0);
  const [ringToast, setRingToast] = useState(false);
  const ringPulse = useRef(new Animated.Value(0)).current;
  const toastFade = useRef(new Animated.Value(0)).current;

  const listRef = useRef<FlatList<Row>>(null);

  // Visit picker IS genuinely scoped to the tapped site — useJobs already
  // supports siteId elsewhere in the app.
  const visits = useJobs({ scope: 'all', siteId: site?.id ?? undefined, limit: 20 });
  const visitList = useMemo(() => visits.data?.jobs ?? [], [visits.data]);
  const taggedVisit = useMemo(
    () => visitList.find((v) => v.schedule_id === tagId) ?? null,
    [visitList, tagId],
  );

  const rows = useMemo(() => buildRows(messages), [messages]);

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
    });
    setRinging(false);
    if (ok) {
      setRingCooldownUntil(Date.now() + RING_COOLDOWN_MS);
      showToast();
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    }
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, name: asset.fileName ?? 'photo.jpg', mimeType: asset.mimeType ?? 'image/jpeg' });
  };

  const onSend = async () => {
    const ok = await send({ body: draft, photo, scheduleId: tagId });
    if (!ok) return;
    setDraft('');
    setPhoto(null);
    setTagId(null);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const canSend = (draft.trim().length > 0 || !!photo) && !sending;
  const composerClearance = Math.max(insets.bottom, 10) + TAB_BAR_CLEARANCE;

  const ringScale = ringPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = ringPulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.4, 0.1, 0] });

  const headerName = site?.site_name || 'General';
  const headerColor = site ? colorFor(headerName, SITE_TINTS) : '#0f172a';

  return (
    <KeyboardAvoidingView
      style={s.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View pointerEvents="none" style={s.wash}>
        <View style={[s.blob, { backgroundColor: '#dbeafe', top: -90, left: -70, width: 240, height: 240 }]} />
        <View style={[s.blob, { backgroundColor: '#ede9fe', top: 200, right: -100, width: 240, height: 240 }]} />
      </View>

      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={s.threadHeader}>
        <TouchableOpacity onPress={onBack} style={s.backBtn} hitSlop={8}>
          <ChevronLeft size={22} color={palette.ink} />
        </TouchableOpacity>

        <View style={[s.threadAvatar, { backgroundColor: headerColor }]}>
          {site ? (
            <Text style={s.threadAvatarText}>{initial(headerName)}</Text>
          ) : (
            <Users size={16} color="#fff" />
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.threadTitle} numberOfLines={1}>
            {headerName}
          </Text>
          <View style={s.statusRow}>
            <View style={[s.statusDot, { backgroundColor: isActive ? '#10b981' : palette.mutedLight }]} />
            <Text style={s.statusText}>
              {isActive ? 'Active now' : 'Away — ring to notify'}
              {site ? ' · shared conversation' : ''}
            </Text>
          </View>
        </View>

        <View style={s.ringSlot}>
          {ringing ? (
            <Animated.View
              pointerEvents="none"
              style={[s.ringPulse, { backgroundColor: accent, opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
            />
          ) : null}
          <TouchableOpacity
            onPress={ringSupport}
            disabled={ringing || ringOnCooldown}
            activeOpacity={0.8}
            style={[s.ringBtn, { backgroundColor: ringOnCooldown ? '#f1f5f9' : `${accent}16` }]}
          >
            {ringing ? (
              <ActivityIndicator size="small" color={accent} />
            ) : (
              <Bell size={18} color={ringOnCooldown ? palette.mutedLight : accent} />
            )}
          </TouchableOpacity>
        </View>
      </View>

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
          style={{ flex: 1 }}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) =>
            item.kind === 'separator' ? (
              <View style={s.daySep}>
                <View style={s.daySepLine} />
                <Text style={s.daySepText}>{item.label}</Text>
                <View style={s.daySepLine} />
              </View>
            ) : (
              <Bubble message={item.message} accent={accent} showAvatar={item.showAvatar} showName={item.showName} />
            )
          }
        />
      )}

      {/* ── Composer — WhatsApp-style rounded pill ──────────────────── */}
      <View style={[s.composerWrap, { paddingBottom: composerClearance }]}>
        {error && messages.length > 0 ? <Text style={s.sendError}>{error}</Text> : null}

        {(photo || taggedVisit) ? (
          <View style={s.attachRow}>
            {photo ? (
              <View style={s.attachChip}>
                <Image source={{ uri: photo.uri }} style={s.attachThumb} />
                <Text style={s.attachText} numberOfLines={1}>
                  {photo.name || 'Photo'}
                </Text>
                <TouchableOpacity onPress={() => setPhoto(null)} hitSlop={8}>
                  <X size={14} color={palette.muted} />
                </TouchableOpacity>
              </View>
            ) : null}

            {taggedVisit ? (
              <View style={s.attachChip}>
                <CalendarDays size={13} color={accent} />
                <Text style={s.attachText} numberOfLines={1}>
                  {taggedVisit.site_name} · {formatDateOnly(taggedVisit.scheduled_date)}
                </Text>
                <TouchableOpacity onPress={() => setTagId(null)} hitSlop={8}>
                  <X size={14} color={palette.muted} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={s.composerRow}>
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
              value={draft}
              onChangeText={setDraft}
              placeholder="Message SoWash…"
              placeholderTextColor={palette.mutedLight}
              style={s.pillInput}
              multiline
            />
          </View>

          <TouchableOpacity
            onPress={onSend}
            disabled={!canSend}
            style={[s.sendBtn, { backgroundColor: canSend ? accent : palette.border }]}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Send size={18} color="#fff" />}
          </TouchableOpacity>
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
    </KeyboardAvoidingView>
  );
}

function Bubble({
  message,
  accent,
  showAvatar,
  showName,
}: {
  message: ChatMessage;
  accent: string;
  showAvatar: boolean;
  showName: boolean;
}) {
  const mine = message.sender_kind === 'customer';
  const url = photoUrl(message.attachment_url);
  const name = message.sender_name || 'SoWash';

  return (
    <View style={[s.bubbleLine, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      {!mine ? (
        showAvatar ? (
          <View style={[s.avatar, { backgroundColor: colorFor(name, AVATAR_COLORS) }]}>
            <Text style={s.avatarText}>{initial(name)}</Text>
          </View>
        ) : (
          <View style={s.avatarSpacer} />
        )
      ) : null}

      <View
        style={[
          s.bubble,
          mine ? { backgroundColor: accent, borderBottomRightRadius: 6 } : [s.bubbleTheirs, { borderBottomLeftRadius: 6 }],
        ]}
      >
        {!mine && showName && message.sender_name ? (
          <Text style={[s.sender, { color: accent }]}>{message.sender_name}</Text>
        ) : null}

        {message.visit ? <ChatVisitCard visit={message.visit} mine={mine} /> : null}

        {url ? <Image source={{ uri: url }} style={s.photo} resizeMode="cover" /> : null}

        {message.body ? (
          <Text style={[s.text, mine ? { color: '#fff' } : { color: palette.ink }]}>{message.body}</Text>
        ) : null}

        <Text style={[s.time, mine ? { color: '#ffffffaa' } : { color: palette.mutedLight }]}>
          {formatTime(message.created_at)}
        </Text>
      </View>
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

  // Site list header
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
  siteAvatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
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

  bubble: { maxWidth: '78%', borderRadius: 20, padding: 12 },
  bubbleTheirs: { backgroundColor: '#fff', ...CARD_SHADOW },
  sender: { fontSize: 11, fontWeight: '800', marginBottom: 3 },
  text: { fontSize: 14, lineHeight: 20 },
  time: { fontSize: 10.5, fontWeight: '600', marginTop: 4, alignSelf: 'flex-end' },
  photo: { width: 200, height: 150, borderRadius: 14, marginBottom: 6 },
  // The visit tag's styling lives in src/components/ChatVisitCard.tsx — it is
  // a preview card now, not a chip.

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

  // Bordered, not a filled pill — matches the search/composer convention
  // used elsewhere in the app (white bg, thin border, moderate radius)
  // instead of a fully-rounded chat-app blob.
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingLeft: 4,
    paddingRight: 6,
    minHeight: 46,
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
    width: 46,
    height: 46,
    borderRadius: 23,
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