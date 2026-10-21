// app/files.tsx — Shared Files (office staff only).
//
// The library of documents that went through Team chats. Upload a file once, then share it into any DM or group
// from here — nothing is uploaded again (the message just points at the stored file; identical bytes are stored
// once on the server). A root-level stack page reached from the staff Account tab; app/_layout.tsx lists it in
// STAFF_STACK_SEGMENTS so a client session is redirected away from it.
//
// You see: files you uploaded, plus files that reached you in a chat you are in. Only your own can be removed.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { CircleAlert, FolderOpen, Plus, Search, Send, Trash2 } from 'lucide-react-native';
import { palette } from '../src/theme';
import { useAccent } from '../src/theme-context';
import PageHeader from '../src/components/PageHeader';
import ChatTargetSheet from '../src/components/ChatTargetSheet';
import { FileTypeIcon } from '../src/components/FileCard';
import { errorMessage } from '../src/api/client';
import { formatDateTime } from '../src/hooks';
import {
  FileError,
  StaffFile,
  displayName,
  fetchFiles,
  formatBytes,
  openFile,
  pickDocument,
  removeFile,
  sendFileToConversation,
  uploadFile,
} from '../src/staffFiles';

const PAGE = 30;

export default function FilesScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const [files, setFiles] = useState<StaffFile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [shareTarget, setShareTarget] = useState<StaffFile | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (q: string, offset: number) => {
    const mine = ++seq.current;
    try {
      const r = await fetchFiles({ q, offset, limit: PAGE });
      if (mine !== seq.current) return;
      setFiles((prev) => (offset === 0 ? r.files : [...prev, ...r.files]));
      setMore(r.has_more);
      setError(null);
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err, 'Could not load the files.'));
    } finally {
      if (mine === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(query.trim(), 0), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, load]);

  const upload = async () => {
    if (uploading) return;
    try {
      const doc = await pickDocument();
      if (!doc) return;
      setUploading(true);
      const { deduped } = await uploadFile(doc);
      await load(query.trim(), 0);
      if (deduped) Alert.alert('Already stored', 'This file was already on the server, so nothing new was uploaded. It is in your list now.');
    } catch (err) {
      Alert.alert('Could not upload', err instanceof FileError ? err.message : errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const open = async (f: StaffFile) => {
    try {
      await openFile(f.id, f.name);
    } catch (err) {
      Alert.alert('Could not open the file', errorMessage(err));
    }
  };

  const confirmRemove = (f: StaffFile) => {
    Alert.alert(
      'Remove from your files?',
      `${f.name} will leave this list. Chats it was already sent in keep it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeFile(f.id);
              setFiles((prev) => prev.filter((x) => x.id !== f.id));
            } catch (err) {
              Alert.alert('Could not remove', errorMessage(err));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={s.screen}>
      <PageHeader title="Shared Files" subtitle="Upload once, share anywhere" onBack={() => router.back()} />
      <ChatTargetSheet
        visible={!!shareTarget}
        title="Send file to chat"
        subtitle={shareTarget?.name}
        accent={accent}
        onClose={() => setShareTarget(null)}
        onPick={async (conversationId, conversationTitle) => {
          if (!shareTarget) throw new Error('No file selected.');
          await sendFileToConversation(conversationId, shareTarget.id);
          return `${shareTarget.name} sent to ${conversationTitle}.`;
        }}
      />

      <FlatList
        data={files}
        keyExtractor={(f) => String(f.id)}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={accent}
            onRefresh={() => {
              setRefreshing(true);
              void load(query.trim(), 0);
            }}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (more && !loading) void load(query.trim(), files.length);
        }}
        ListHeaderComponent={
          <View>
            <TouchableOpacity style={[s.uploadBtn, { backgroundColor: accent }]} onPress={upload} disabled={uploading} activeOpacity={0.85}>
              {uploading ? <ActivityIndicator color="#fff" /> : <Plus size={18} color="#fff" />}
              <Text style={s.uploadText}>{uploading ? 'Uploading…' : 'Upload a file'}</Text>
            </TouchableOpacity>
            <View style={s.searchWrap}>
              <Search size={16} color={palette.mutedLight} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search files…"
                placeholderTextColor={palette.mutedLight}
                style={s.searchInput}
                autoCorrect={false}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={s.row} activeOpacity={0.85} onPress={() => open(item)} onLongPress={item.mine ? () => confirmRemove(item) : undefined} delayLongPress={350}>
            <View style={[s.ico, { backgroundColor: `${accent}18` }]}>
              <FileTypeIcon name={item.name} size={22} color={accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={2}>
                {displayName(item.name)}
              </Text>
              <Text style={s.meta} numberOfLines={1}>
                {[formatBytes(item.size), item.mine ? 'You' : item.owner_name, formatDateTime(item.created_at)].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.actBtn, { backgroundColor: `${accent}14` }]}
              onPress={() => setShareTarget(item)}
              hitSlop={8}
              accessibilityLabel={`Send ${item.name} to a chat`}
            >
              <Send size={17} color={accent} />
            </TouchableOpacity>
            {item.mine ? (
              <TouchableOpacity style={[s.actBtn, { backgroundColor: '#ef444414' }]} onPress={() => confirmRemove(item)} hitSlop={8} accessibilityLabel={`Remove ${item.name}`}>
                <Trash2 size={17} color="#ef4444" />
              </TouchableOpacity>
            ) : null}
          </TouchableOpacity>
        )}
        ListFooterComponent={more ? <ActivityIndicator style={{ marginVertical: 14 }} color={accent} /> : null}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={accent} />
          ) : error ? (
            <View style={s.empty}>
              <CircleAlert size={22} color={palette.danger} />
              <Text style={s.emptyBody}>{error}</Text>
            </View>
          ) : (
            <View style={s.empty}>
              <FolderOpen size={26} color={palette.mutedLight} />
              <Text style={s.emptyTitle}>{query ? 'No matches' : 'No files yet'}</Text>
              <Text style={s.emptyBody}>
                {query ? 'Try a different search.' : 'Upload a file here, or send one in a Team chat — it will appear here so you can share it again without uploading.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  list: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40, gap: 8 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginBottom: 10 },
  uploadText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 15, color: palette.ink },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
  },
  ico: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  meta: { fontSize: 12, color: palette.muted, marginTop: 2, fontWeight: '600' },
  actBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 6, paddingTop: 50, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 19 },
});
