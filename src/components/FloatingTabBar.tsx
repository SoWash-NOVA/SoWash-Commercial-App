// src/components/FloatingTabBar.tsx
//
// The client app's floating pill tab bar (originally hand-built once, inline,
// in app/(tabs)/_layout.tsx), generalised so app/staff/_layout.tsx can reuse
// the exact same visual language — rounded floating bar, spring-scaled active
// icons, one item raised in the centre as a bigger circle with an optional
// badge — without touching that file at all.
//
// app/(tabs)/_layout.tsx keeps its own original, untouched implementation:
// this component is additive, not a replacement, so the live client tab bar
// carries zero risk from this change. If it's ever worth migrating that file
// onto this shared component too, that's a deliberate follow-up, not a side
// effect of adding the staff tab bar.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../theme';
import { BRAND_GREEN_DEEP, BRAND_GREEN_MID, HEADER_STOPS } from '../brand';
import { useChatOpen } from '../chat-focus';

const IDLE = palette.mutedLight;
const CIRCLE = 42;
const CENTRE_CIRCLE = 60;

type IconComponent = React.ComponentType<{ size?: number; color?: string }>;

export type FloatingTabRoute = { key: string; name: string };
export type FloatingTabBarState = { index: number; routes: FloatingTabRoute[] };

/**
 * Loosely typed on purpose — mirrors the same tradeoff app/(tabs)/_layout.tsx
 * documents: the real BottomTabBarProps['navigation'] is generic over its own
 * event-map type and can't structurally satisfy a fixed interface.
 */
export type FloatingTabBarNavigation = {
  emit: (event: unknown) => unknown;
  navigate: (name: never) => void;
};

export interface FloatingTabItem {
  label: string;
  Icon: IconComponent;
}

interface Props {
  state: FloatingTabBarState;
  navigation: FloatingTabBarNavigation;
  /** Visual order of the bar, independent of file/registration order. */
  order: string[];
  /** One entry per name in `order`, including the centre one. */
  items: Record<string, FloatingTabItem>;
  /** Which entry in `order` renders as the raised centre button. */
  centreName: string;
  /** Badge on the centre button. 0 or omitted renders no badge. */
  centreBadge?: number;
}

function RegularItem({
  label,
  Icon,
  active,
  accent,
  onPress,
}: {
  label: string;
  Icon: IconComponent;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  const grow = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(grow, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
      friction: 7,
      tension: 90,
    }).start();
  }, [active, grow]);

  const scale = grow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });

  return (
    <TouchableOpacity onPress={onPress} style={local.item} activeOpacity={0.75}>
      <Animated.View
        style={[
          local.circle,
          active && { backgroundColor: `${accent}16` },
          { transform: [{ scale }] },
        ]}
      >
        <Icon size={20} color={active ? accent : IDLE} />
      </Animated.View>
      <View style={local.labelSlot}>
        {active ? (
          <Text style={[local.label, { color: accent }]} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function CentreItem({
  label,
  Icon,
  active,
  accent,
  badge,
  onPress,
}: {
  label: string;
  Icon: IconComponent;
  active: boolean;
  accent: string;
  badge: number;
  onPress: () => void;
}) {
  const press = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.timing(press, { toValue: 0.9, duration: 90, useNativeDriver: true }).start();
  };
  const onPressOut = () => {
    Animated.spring(press, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }).start();
  };

  return (
    <View style={local.centreSlot} pointerEvents="box-none">
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={0.9}
        style={local.centreTouchable}
      >
        <Animated.View
          style={[
            local.centreCircle,
            { backgroundColor: HEADER_STOPS.end, transform: [{ scale: press }] },
            active && local.centreCircleActive,
          ]}
        >
          {/* the same green as the page headers (src/brand.ts) */}
          <LinearGradient
            pointerEvents="none"
            colors={[BRAND_GREEN_MID, HEADER_STOPS.mid]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={local.centreFill}
          />
          <Icon size={26} color="#fff" />
          {badge > 0 ? (
            <View style={local.badge}>
              <Text style={local.badgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          ) : null}
        </Animated.View>
      </TouchableOpacity>
      <Text style={[local.centreLabel, { color: active ? accent : IDLE }]}>{label}</Text>
    </View>
  );
}

export default function FloatingTabBar({
  state,
  navigation,
  order,
  items,
  centreName,
  centreBadge = 0,
}: Props) {
  // Brand green (src/brand.ts), not the user-selectable accent: the bar matches the page headers.
  const accent = BRAND_GREEN_DEEP;
  const insets = useSafeAreaInsets();
  const chatOpen = useChatOpen();

  const byName: Record<string, { route: FloatingTabRoute; index: number }> = {};
  state.routes.forEach((r, i) => {
    byName[r.name] = { route: r, index: i };
  });

  const go = (name: string) => {
    const entry = byName[name];
    if (!entry) return;
    const isFocused = state.index === entry.index;
    const event = navigation.emit({
      type: 'tabPress',
      target: entry.route.key,
      canPreventDefault: true,
    }) as { defaultPrevented?: boolean } | undefined;
    if (!isFocused && !event?.defaultPrevented) {
      navigation.navigate(entry.route.name as never);
    }
  };

  // A chat is open: no tab bar, the conversation gets the full height.
  if (chatOpen) return null;

  return (
    <View style={[local.wrapper, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={local.shadow}>
        <View style={local.bar}>
          {order.map((name) => {
            const entry = byName[name];
            const item = items[name];
            if (!entry || !item) return null;
            const isFocused = state.index === entry.index;

            if (name === centreName) {
              return (
                <CentreItem
                  key={name}
                  label={item.label}
                  Icon={item.Icon}
                  active={isFocused}
                  accent={accent}
                  badge={centreBadge}
                  onPress={() => go(name)}
                />
              );
            }

            return (
              <RegularItem
                key={name}
                label={item.label}
                Icon={item.Icon}
                active={isFocused}
                accent={accent}
                onPress={() => go(name)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
  },
  shadow: {
    borderRadius: 28,
    backgroundColor: '#fff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 28,
    paddingHorizontal: 6,
    paddingTop: 10,
    paddingBottom: 10,
    backgroundColor: palette.surface,
  },

  item: { flex: 1, alignItems: 'center', paddingTop: 4 },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSlot: { height: 14, justifyContent: 'center', marginTop: 2 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2 },

  centreSlot: { flex: 1, alignItems: 'center' },
  centreTouchable: { marginTop: -30 },
  centreCircle: {
    width: CENTRE_CIRCLE,
    height: CENTRE_CIRCLE,
    borderRadius: CENTRE_CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  centreFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: CENTRE_CIRCLE / 2 },
  centreCircleActive: {
    shadowOpacity: 0.3,
  },
  centreLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.2, marginTop: 2 },

  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#f43f5e',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '900', lineHeight: 12 },
});
