// src/components/StatusFilterBar.tsx
//
// Horizontal status chips (All / Scheduled / Ongoing / Completed / Cancelled) shared by the client Visits list
// and the staff Jobs list. Filtering is done on the rows already loaded (matchesStatusFilter in src/hooks.ts).

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { palette } from '../theme';
import { useAccent } from '../theme-context';
import { STATUS_FILTERS, StatusFilterKey } from '../hooks';

export function StatusFilterBar({
  value,
  onChange,
  counts,
}: {
  value: StatusFilterKey;
  onChange: (k: StatusFilterKey) => void;
  counts?: Partial<Record<StatusFilterKey, number>>;
}) {
  const { accent } = useAccent();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.scroll}
      contentContainerStyle={s.row}
      keyboardShouldPersistTaps="handled"
    >
      {STATUS_FILTERS.map((f) => {
        const on = f.key === value;
        const n = counts?.[f.key];
        return (
          <TouchableOpacity
            key={f.key}
            activeOpacity={0.8}
            onPress={() => onChange(f.key)}
            style={[s.chip, on && { backgroundColor: `${accent}18`, borderColor: accent }]}
          >
            <Text style={[s.text, on && { color: accent }]}>
              {f.label}
              {n !== undefined ? ` · ${n}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: '#fff',
  },
  text: { fontSize: 12.5, fontWeight: '800', color: palette.muted },
});
