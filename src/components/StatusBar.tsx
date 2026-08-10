import React from 'react';
import { View, Text } from 'react-native';
import { Activity, BatteryCharging } from 'lucide-react-native';
import { styles } from '../theme';

/**
 * The mock "9:41" status row from the design mockups. Purely decorative — it is
 * not the real device status bar (that is configured in app/_layout.tsx).
 */
export function StatusBar({ light = false }: { light?: boolean }) {
  const tint = light ? 'rgba(255,255,255,0.8)' : '#64748b';
  return (
    <View style={[styles.statusBar, { zIndex: 50 }]}>
      <Text style={[styles.statusText, { color: tint }]}>9:41</Text>
      <View style={styles.statusIcons}>
        <Activity size={12} color={tint} />
        <BatteryCharging size={12} color={tint} />
      </View>
    </View>
  );
}
