// src/components/ChatInfoView.tsx
//
// The client app's version of the staff "Group info" screen: tap the conversation name ("General") in
// the chat header and get its details — the shared media (photos and videos) as a grid, and who is in
// the conversation. Everything is derived from the messages the chat has already loaded, so there is
// no extra request.
//
// Videos are deleted from the server 30 days after upload (CLAUDE.md, voice + video entry); an old one
// shows as "expired" here, the same as in the chat.

import React, { useEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Play, Users, VideoOff } from 'lucide-react-native';
import PageHeader from './PageHeader';
import PhotoViewerModal, { ViewerPhoto } from './PhotoViewerModal';
import { VideoModal } from './ChatAttachment';
import { photoUrl } from '../api/client';
import { ChatMessage } from '../api/types';
import { durationFromName, formatClock, mediaKind, videoExpired } from '../chat-media';
import { palette } from '../theme';

const MAX_TILES = 24;

interface MediaItem {
  id: number;
  kind: 'image' | 'video';
  url: string;
  senderName: string;
  createdAt: string;
  durationSec: number | null;
  expired: boolean;
}

interface Person {
  key: string;
  name: string;
  role: string;
}

export default function ChatInfoView({
  title,
  messages,
  myUserId,
  accent,
  onClose,
}: {
  title: string;
  messages: ChatMessage[];
  myUserId: number | undefined;
  accent: string;
  onClose: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Newest first, like the staff group media grid. Photos and videos only (voice notes play in the chat).
  const media = useMemo<MediaItem[]>(() => {
    const out: MediaItem[] = [];
    for (const m of messages) {
      if (m.id <= 0 || !m.attachment_url) continue;
      const kind = mediaKind(m.attachment_name || m.attachment_url);
      if (kind === 'audio') continue;
      const url = photoUrl(m.attachment_url);
      if (!url) continue;
      const mine = m.sender_user_id != null && m.sender_user_id === myUserId;
      out.push({
        id: m.id,
        kind,
        url,
        senderName: mine ? 'You' : m.sender_name || (m.sender_kind === 'agent' ? 'SoWash' : 'Colleague'),
        createdAt: m.created_at,
        durationSec: durationFromName(m.attachment_name),
        expired: kind === 'video' && videoExpired(m.created_at),
      });
    }
    return out.reverse();
  }, [messages, myUserId]);

  const photos = useMemo<ViewerPhoto[]>(
    () =>
      media
        .filter((x) => x.kind === 'image')
        .map((x) => ({ id: x.id, url: x.url, senderName: x.senderName, createdAt: x.createdAt })),
    [media],
  );

  // Who has taken part: the SoWash support team (always listed), plus every colleague from this company who wrote.
  const people = useMemo<Person[]>(() => {
    const list: Person[] = [{ key: 'support', name: 'SoWash Support', role: 'Support team' }];
    const seen = new Set<string>();
    for (const m of messages) {
      if (m.sender_kind !== 'customer') continue;
      const mine = m.sender_user_id != null && m.sender_user_id === myUserId;
      const key = String(m.sender_user_id ?? m.sender_name ?? 'x');
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, name: mine ? 'You' : m.sender_name || 'Colleague', role: mine ? 'Your account' : 'Your company' });
    }
    // You first after Support, even if you haven't written yet.
    if (!list.some((p) => p.name === 'You')) list.splice(1, 0, { key: 'me', name: 'You', role: 'Your account' });
    return list;
  }, [messages, myUserId]);

  const openTile = (item: MediaItem) => {
    if (item.kind === 'video') {
      if (!item.expired) setVideoUrl(item.url);
      return;
    }
    const i = photos.findIndex((p) => p.id === item.id);
    if (i >= 0) setPhotoIndex(i);
  };

  const shown = media.slice(0, MAX_TILES);

  // Android back closes this screen first (a listener added later runs before the chat's own).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  // A full-screen replace (like the staff Group info), not a Modal: the root status-bar strip and the
  // gradient header are drawn by the app shell, which a Modal would sit outside of.
  return (
    <>
      <View style={st.screen}>
        <PageHeader title="Conversation info" onBack={onClose} />

        <ScrollView contentContainerStyle={st.body} showsVerticalScrollIndicator={false}>
          <View style={st.top}>
            <View style={[st.avatar, { backgroundColor: accent }]}>
              <Users size={34} color="#fff" />
            </View>
            <Text style={st.name} numberOfLines={2}>
              {title}
            </Text>
            <Text style={st.sub}>
              Conversation · {people.length} {people.length === 1 ? 'person' : 'people'}
            </Text>
          </View>

          <Text style={st.sectionLabel}>{media.length} MEDIA</Text>
          {media.length === 0 ? (
            <Text style={st.empty}>Photos and videos shared in this conversation will appear here.</Text>
          ) : (
            <>
              <View style={st.grid}>
                {shown.map((item) => (
                  <TouchableOpacity key={item.id} style={st.tileWrap} activeOpacity={0.85} onPress={() => openTile(item)}>
                    {item.kind === 'image' ? (
                      <Image source={{ uri: item.url }} style={st.tile} contentFit="cover" />
                    ) : (
                      <View style={[st.tile, st.videoTile]}>
                        {item.expired ? <VideoOff size={22} color={palette.muted} /> : <Play size={24} color="#fff" fill="#fff" />}
                        {item.durationSec != null && !item.expired ? (
                          <View style={st.badge}>
                            <Text style={st.badgeText}>{formatClock(item.durationSec)}</Text>
                          </View>
                        ) : null}
                        {item.expired ? <Text style={st.expiredText}>Expired</Text> : null}
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              {media.length > MAX_TILES ? (
                <Text style={st.more}>+{media.length - MAX_TILES} more shared in this conversation</Text>
              ) : null}
            </>
          )}

          <Text style={st.sectionLabel}>{people.length} IN THIS CONVERSATION</Text>
          {people.map((p) => (
            <View key={p.key} style={st.personRow}>
              <View style={[st.personAvatar, { backgroundColor: p.key === 'support' ? accent : palette.mutedLight }]}>
                <Text style={st.personInitial}>{(p.name.trim()[0] || '?').toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.personName} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={st.personRole}>{p.role}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>

      {photoIndex !== null && photos.length > 0 ? (
        <PhotoViewerModal photos={photos} initialIndex={photoIndex} onClose={() => setPhotoIndex(null)} />
      ) : null}
      {videoUrl ? <VideoModal url={videoUrl} onClose={() => setVideoUrl(null)} /> : null}
    </>
  );
}

const GAP = 4;

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  body: { paddingBottom: 40 },
  top: { alignItems: 'center', paddingTop: 22, paddingBottom: 8, paddingHorizontal: 24 },
  avatar: { width: 84, height: 84, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  name: { marginTop: 12, fontSize: 22, fontWeight: '800', color: palette.ink, textAlign: 'center' },
  sub: { marginTop: 4, fontSize: 13, color: palette.muted },
  sectionLabel: {
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 20,
    fontSize: 11.5,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: palette.muted,
  },
  empty: { paddingHorizontal: 20, fontSize: 13.5, color: palette.muted, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20 - GAP / 2 },
  tileWrap: { width: '33.3333%', padding: GAP / 2 },
  tile: { width: '100%', aspectRatio: 1, borderRadius: 10 },
  videoTile: { backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', gap: 4 },
  badge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '700' },
  expiredText: { color: palette.muted, fontSize: 11, fontWeight: '700' },
  more: { paddingHorizontal: 20, paddingTop: 8, fontSize: 12.5, color: palette.muted },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  personAvatar: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  personInitial: { color: '#fff', fontWeight: '800', fontSize: 15 },
  personName: { fontSize: 15, fontWeight: '700', color: palette.ink },
  personRole: { fontSize: 12, color: palette.muted, marginTop: 1 },
});
