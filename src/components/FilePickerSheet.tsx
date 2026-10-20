// "Choose from Files": the library as a bottom sheet inside a chat. Tap a file = send it (no upload).
// Staff only — opened from the Team chat composer.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { palette } from '../theme';
import { errorMessage } from '../api/client';
import { fetchFiles, formatBytes, StaffFile } from '../staffFiles';
import { FileTypeIcon } from './FileCard';
import KeyboardScreen from './KeyboardScreen';
import { formatDateTime } from '../hooks';

export default function FilePickerSheet({
  visible,
  accent,
  onClose,
  onPick,
}: {
  visible: boolean;
  accent: string;
  onClose: () => void;
  onPick: (file: StaffFile) => void;
}) {
  const [q, setQ] = useState('');
  const [files, setFiles] = useState<StaffFile[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async (query: string, offset: number) => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = await fetchFiles({ q: query, offset });
      if (mine !== seq.current) return;
      setFiles((prev) => (offset === 0 ? r.files : [...prev, ...r.files]));
      setMore(r.has_more);
      setError(null);
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err, 'Could not load the files.'));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    const t = setTimeout(() => void load(q.trim(), 0), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [visible, q, load]);

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardScreen style={sh.backdrop}>
        <View style={sh.sheet}>
          <View style={sh.head}>
            <View style={{ flex: 1 }}>
              <Text style={sh.title}>Choose from Files</Text>
              <Text style={sh.sub}>Sends the stored file — nothing is uploaded again.</Text>
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
              placeholder="Search files"
              placeholderTextColor={palette.mutedLight}
              autoCorrect={false}
            />
          </View>
          <FlatList
            data={files}
            keyExtractor={(f) => String(f.id)}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.4}
            onEndReached={() => {
              if (more && !loading) void load(q.trim(), files.length);
            }}
            ListFooterComponent={loading ? <ActivityIndicator style={{ marginVertical: 14 }} color={accent} /> : null}
            ListEmptyComponent={
              loading ? null : (
                <Text style={sh.empty}>{error || (q ? 'No files match.' : 'No files yet. Upload one from the paperclip menu.')}</Text>
              )
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={sh.row} activeOpacity={0.8} onPress={() => onPick(item)}>
                <View style={[sh.ico, { backgroundColor: `${accent}18` }]}>
                  <FileTypeIcon name={item.name} size={20} color={accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sh.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={sh.rowSub} numberOfLines={1}>
                    {[formatBytes(item.size), item.mine ? 'You' : item.owner_name, formatDateTime(item.created_at)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
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
    minHeight: 280,
  },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '800', color: palette.ink },
  sub: { fontSize: 12.5, color: palette.muted, marginTop: 2 },
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
  ico: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700', color: palette.ink },
  rowSub: { fontSize: 12, color: palette.muted, marginTop: 1 },
  empty: { textAlign: 'center', color: palette.muted, marginTop: 30, paddingHorizontal: 20 },
});
