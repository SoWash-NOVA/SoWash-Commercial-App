// src/components/ChatVisitCard.tsx
//
// The rich "about this visit" preview inside a chat bubble, and the popup it
// opens. The customer-side twin of sowash-frontend
// src/pages/CI/ChatJobPreview.js — both render the same `message.visit`
// payload, so a tagged message looks the same to the site manager and to the
// agent answering them.
//
// Before this, a tagged message was one line of grey text. Now it is what a
// WhatsApp link preview is: photos of the actual work, the site, the date, the
// crew lead — and the whole visit on tap.
//
// ── No request to draw the card ────────────────────────────────────────────
// Everything on the face of it rides along on the message. The backend
// (utils/commercialChatVisit.js) pre-parses the photo columns and caps the
// strip at four already-normalised paths, so a long thread does not carry a
// photo array per message. Only opening the popup costs a fetch.
//
// ── can_open is not decoration ─────────────────────────────────────────────
// GET /customer-portal/:id/detail admits a visit only when it is approved, or
// scheduled for today. A completed visit still waiting on CI admin is
// therefore taggable, listed, and genuinely un-openable — and the backend
// withholds its photos rather than show the client work nobody has signed off.
// When can_open is false this card must NOT offer a tap: it says why instead.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronRight, CircleAlert, Images, X } from 'lucide-react-native';
import { palette, styles as shared } from '../theme';
import { useAccent } from '../theme-context';
import { photoUrl } from '../api/client';
import { ChatVisitTag } from '../api/types';
import { useJobDetail, useSldWalkthrough, sldHasWalk, formatDateOnly, statusMeta } from '../hooks';
import JobDetailBody, { detailStyles } from './JobDetailBody';

const CARD_WIDTH = 238;
const GAP = 2;

interface Props {
  visit: ChatVisitTag;
  /** True inside the customer's own (accent-coloured) bubble. */
  mine: boolean;
}

export default function ChatVisitCard({ visit, mine }: Props) {
  const { accent } = useAccent();
  const [open, setOpen] = useState(false);

  const meta = statusMeta(visit.status);
  const photos = visit.photos ?? [];
  const extra = Math.max(0, (visit.photo_count ?? 0) - photos.length);
  const canOpen = visit.can_open !== false;

  const place = [visit.address, visit.city].filter(Boolean).join(', ');

  // Text on an accent-filled bubble has to stay legible without a second
  // palette: white at reduced opacity rather than a different colour.
  const titleColor = mine ? '#fff' : palette.ink;
  const metaColor = mine ? '#ffffffbb' : palette.muted;
  const linkColor = mine ? '#fff' : accent;

  return (
    <>
      <Pressable
        onPress={canOpen ? () => setOpen(true) : undefined}
        disabled={!canOpen}
        style={({ pressed }) => [
          local.card,
          mine ? local.cardMine : local.cardTheirs,
          pressed && canOpen ? { opacity: 0.85 } : null,
        ]}
      >
        <PhotoStrip photos={photos} extra={extra} />

        <View style={local.body}>
          <View style={local.topRow}>
            <Text style={[local.title, { color: titleColor }]} numberOfLines={1}>
              {visit.site_name || 'Visit'}
            </Text>
            <View style={[local.dot, { backgroundColor: meta.color }]} />
            <Text style={[local.status, { color: mine ? '#fff' : meta.color }]}>{meta.label}</Text>
          </View>

          <View style={local.metaRow}>
            <CalendarDays size={11} color={metaColor} />
            <Text style={[local.meta, { color: metaColor }]} numberOfLines={1}>
              {formatDateOnly(visit.scheduled_date)}
              {visit.team_lead_name ? ` · ${visit.team_lead_name}` : ''}
            </Text>
          </View>

          {place ? (
            <Text style={[local.meta, { color: metaColor, marginTop: 2 }]} numberOfLines={1}>
              {place}
            </Text>
          ) : null}

          {visit.photo_count > 0 ? (
            <View style={local.metaRow}>
              <Images size={11} color={metaColor} />
              <Text style={[local.meta, { color: metaColor }]}>
                {visit.photo_count} photo{visit.photo_count === 1 ? '' : 's'}
              </Text>
            </View>
          ) : null}

          {canOpen ? (
            <View style={local.linkRow}>
              <Text style={[local.link, { color: linkColor }]}>View details</Text>
              <ChevronRight size={13} color={linkColor} />
            </View>
          ) : (
            <Text style={[local.pending, { color: mine ? '#ffffffcc' : palette.mutedLight }]}>
              {isFinished(visit.status)
                ? 'Details open once this visit is approved'
                : 'Details open on the day of the visit'}
            </Text>
          )}
        </View>
      </Pressable>

      {/* Mounted only while open, so the fetch fires on the tap and not on
          every tagged message in the thread. */}
      {open ? (
        <VisitDetailSheet
          scheduleId={visit.id}
          siteName={visit.site_name}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

const isFinished = (status: string | null | undefined) =>
  String(status || '').trim().toLowerCase().startsWith('complet');

/* ── the thumbnails ──────────────────────────────────────────────────────
 *
 * Laid out the way a messaging app lays out an album: one photo goes full
 * width, two or three go in a row, four become a 2×2 grid. A fixed 4-across
 * strip inside a chat bubble produces four unreadable slivers.
 *
 * The "+N" sits on the LAST tile — the backend caps `photos` at four but keeps
 * counting, so a visit with eleven photos reads "+7" rather than pretending it
 * has four.
 */
function PhotoStrip({ photos, extra }: { photos: string[]; extra: number }) {
  const uris = useMemo(
    () => photos.map(photoUrl).filter((u): u is string => !!u),
    [photos],
  );

  if (uris.length === 0) return null;

  const n = uris.length;
  const rowHeight = n === 1 ? 148 : n === 2 ? 104 : n === 3 ? 82 : 82;
  const grid = n >= 4;

  return (
    <View style={[local.strip, grid ? local.stripGrid : null]}>
      {uris.map((uri, i) => {
        const last = i === uris.length - 1;
        const width = grid
          ? (CARD_WIDTH - GAP) / 2
          : (CARD_WIDTH - GAP * (n - 1)) / n;

        return (
          <View key={`${uri}-${i}`} style={{ width, height: rowHeight }}>
            <Image source={{ uri }} style={local.thumb} resizeMode="cover" />
            {last && extra > 0 ? (
              <View style={local.more}>
                <Text style={local.moreText}>+{extra}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

/* ── the popup ───────────────────────────────────────────────────────────
 *
 * A bottom sheet rather than a route push: the customer is mid-conversation,
 * and navigating away from a chat to read a job report then having to find
 * their way back is the wrong shape for "what were these photos of?".
 *
 * It renders the SAME JobDetailBody as app/job/[id].tsx, so the report cannot
 * quietly diverge between the two places it appears.
 */
function VisitDetailSheet({
  scheduleId,
  siteName,
  onClose,
}: {
  scheduleId: number;
  siteName: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { accent } = useAccent();
  const { data, loading, error } = useJobDetail(scheduleId);
  const { data: sld } = useSldWalkthrough(scheduleId);

  const job = data?.job;
  const walkPoints = sldHasWalk(sld)
    ? (sld?.points ?? []).filter((p) => p.before_url || p.after_url).length
    : 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={local.backdrop} onPress={onClose}>
        <Pressable style={local.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={local.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={local.sheetTitle} numberOfLines={1}>
                {job?.site_name || siteName || 'Visit details'}
              </Text>
              <Text style={local.sheetSub}>Service visit</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={local.sheetClose}>
              <X size={18} color={palette.inkSoft} />
            </TouchableOpacity>
          </View>

          {loading && !data ? (
            <View style={detailStyles.centre}>
              <ActivityIndicator size="large" color={accent} />
            </View>
          ) : !job ? (
            <View style={detailStyles.centre}>
              <CircleAlert size={26} color={palette.mutedLight} />
              <Text style={detailStyles.emptyTitle}>Not available</Text>
              <Text style={detailStyles.emptyBody}>
                {error ||
                  'This visit is not available yet. Completed visits appear once CI admin has approved them.'}
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={shared.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <JobDetailBody
                job={job}
                walkPoints={walkPoints}
                // The walkthrough IS a route, so the sheet gets out of the way
                // first — leaving a modal stacked under a pushed screen leaves
                // the customer with two back affordances that disagree.
                onWalk={() => {
                  onClose();
                  router.push({
                    pathname: '/walkthrough/[id]',
                    params: { id: String(scheduleId), site: job.site_name ?? '' },
                  });
                }}
              />
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const local = StyleSheet.create({
  card: { width: CARD_WIDTH, borderRadius: 14, overflow: 'hidden', marginBottom: 6 },
  cardMine: { backgroundColor: '#ffffff26' },
  cardTheirs: { backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.borderSubtle },

  strip: { flexDirection: 'row', gap: GAP, backgroundColor: '#00000022' },
  stripGrid: { flexWrap: 'wrap' },
  thumb: { width: '100%', height: '100%', backgroundColor: '#e2e8f0' },
  // Written out rather than spread from StyleSheet.absoluteFillObject — RN
  // 0.86's types no longer expose that member and tsc rejects it.
  more: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#00000088',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: '#fff', fontSize: 17, fontWeight: '900' },

  body: { paddingHorizontal: 10, paddingVertical: 9 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  title: { flex: 1, fontSize: 13, fontWeight: '800' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  status: { fontSize: 10, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  meta: { flex: 1, fontSize: 11, fontWeight: '600' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 7 },
  link: { fontSize: 11.5, fontWeight: '800' },
  pending: { fontSize: 10.5, fontWeight: '700', marginTop: 7, lineHeight: 14 },

  backdrop: { flex: 1, backgroundColor: '#00000066', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    backgroundColor: palette.bg,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: 'hidden',
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: palette.surface,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: palette.ink },
  sheetSub: { fontSize: 12, color: palette.mutedLight, fontWeight: '600', marginTop: 2 },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
