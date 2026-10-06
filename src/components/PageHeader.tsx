// src/components/PageHeader.tsx
//
// The page title bar every screen outside the chat threads uses: the same
// gradient header as the chat screens (see ChatHeaderBar — including the matching
// status-bar strip), with a title, optional subtitle, optional back button, an
// optional widget on the right (a bell, a switcher…) and optional extra content
// underneath (a site switcher, filter pills…).

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import ChatHeaderBar from './ChatHeaderBar';

export default function PageHeader({
  title,
  subtitle,
  onBack,
  right,
  children,
}: {
  title: string;
  subtitle?: string | null;
  /** When given, a back chevron is shown and the title is slightly smaller. */
  onBack?: () => void;
  /** A widget on the right edge of the title row. */
  right?: React.ReactNode;
  /** Extra content under the title row, still on the gradient. */
  children?: React.ReactNode;
}) {
  return (
    <ChatHeaderBar
      rounded
      style={{ flexDirection: 'column', alignItems: 'stretch', paddingHorizontal: 18, paddingBottom: 16, gap: 10 }}
    >
      <View style={styles.row}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.back} hitSlop={8} accessibilityLabel="Back">
            <ChevronLeft size={24} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <View style={styles.titleBlock}>
          <Text
            style={[styles.title, onBack ? styles.titleSmall : null]}
            numberOfLines={1}
            // a long title ("Good afternoon, Muhammad", a long client name) shrinks to fit instead of being cut off
            adjustsFontSizeToFit
            minimumFontScale={0.62}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.sub} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </ChatHeaderBar>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: { width: 34, height: 34, marginLeft: -6, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1 },
  // soft shadow: white on the logo's light sky blue needs a little help to read
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    textShadowColor: 'rgba(8,60,95,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  titleSmall: { fontSize: 20 },
  sub: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    marginTop: 2,
    textShadowColor: 'rgba(8,60,95,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
