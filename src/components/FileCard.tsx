// A document inside a chat bubble: icon, name, type · size. Tap = open / download it (staffFiles.openFile).

import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Download, File as FileIcon, FileArchive, FileSpreadsheet, FileText } from 'lucide-react-native';
import { errorMessage } from '../api/client';
import { fileExt, formatBytes, openFile } from '../staffFiles';
import { keep } from '../themeEngine';
import { palette } from '../theme';

export function FileTypeIcon({ name, size, color }: { name: string; size: number; color: string }) {
  const ext = fileExt(name);
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return <FileSpreadsheet size={size} color={color} />;
  if (['zip'].includes(ext)) return <FileArchive size={size} color={color} />;
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'ppt', 'pptx'].includes(ext)) return <FileText size={size} color={color} />;
  return <FileIcon size={size} color={color} />;
}

export default function FileCard({
  fileId,
  name,
  size,
  mine,
  accent,
  sending,
}: {
  fileId: number | null;
  name: string;
  size?: number | null;
  mine: boolean;
  accent: string;
  /** Still uploading / failed: not openable yet. */
  sending?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const ink = mine ? keep('#fff') : accent;

  const open = async () => {
    if (!fileId || busy || sending) return;
    setBusy(true);
    try {
      await openFile(fileId);
    } catch (err) {
      Alert.alert('Could not open the file', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const meta = [fileExt(name).toUpperCase(), size ? formatBytes(size) : ''].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      style={[st.card, { backgroundColor: mine ? 'rgba(255,255,255,0.18)' : `${accent}14` }]}
      activeOpacity={0.8}
      onPress={open}
      disabled={!fileId || sending}
      accessibilityLabel={`File ${name}. Tap to open`}
    >
      <View style={[st.icon, { backgroundColor: mine ? 'rgba(255,255,255,0.22)' : `${accent}1f` }]}>
        <FileTypeIcon name={name} size={22} color={ink} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.name, { color: mine ? keep('#fff') : palette.ink }]} numberOfLines={2}>
          {name}
        </Text>
        {meta ? <Text style={[st.meta, { color: mine ? 'rgba(255,255,255,0.8)' : palette.muted }]}>{meta}</Text> : null}
      </View>
      {busy ? <ActivityIndicator size="small" color={ink} /> : <Download size={18} color={ink} />}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 10, minWidth: 220, maxWidth: 280 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 11.5, fontWeight: '600', marginTop: 2, opacity: 0.85 },
});
