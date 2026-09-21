// app/(tabs)/_layout.tsx
//
// Five tabs, Support raised in the centre as the one people reach for most
// mid-job — a bigger, lifted circle rather than another same-size icon in
// the row, the way a camera button sits centre in a lot of tab bars.
//
// Visual language matches the customer app's BottomNav: floating pill bar,
// 28-radius corners, soft shadow, spring animation on the active icon
// instead of an instant swap.
//
// SiteProvider wraps the tabs rather than the root layout: it fetches
// /client/sites, which needs a session, and nothing outside the signed-in
// area has any use for it.
//
// FIX: the previous version imported `BottomTabBarProps` from
// `@react-navigation/bottom-tabs`. Expo Router uses that package
// internally, but it isn't always resolvable as a direct import with types
// in every project setup. Replaced with a small local type that only
// describes the two things this file actually reads off the tabBar props
// (`state`, `navigation`) — no external type import needed.
//
// NOTE: uses `react-native-safe-area-context` for the bottom inset (the
// same package the customer app's nav uses) — already a transitive
// dependency of expo-router, but flagging in case your Expo SDK version
// needs it added directly.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Building2, ClipboardList, LayoutGrid, MessagesSquare, User } from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { SiteProvider } from '../../src/site-context';
import { useChatUnread } from '../../src/hooks';

const IDLE = palette.mutedLight;
const CIRCLE = 42;
const CENTRE_CIRCLE = 60;

/* ------------------------------------------------------------------ *
 * Local stand-in for BottomTabBarProps — only the shape this file reads.
 * Avoids importing types from @react-navigation/bottom-tabs (unreliable
 * as a direct dependency), but `navigation.emit` on the real object is
 * generic over its own event-map type and can't structurally satisfy a
 * fixed interface — so `navigation` is typed loosely here and only
 * `state` (a plain data shape) gets a real type.
 * ------------------------------------------------------------------ */
type TabRoute = { key: string; name: string };
type TabBarState = { index: number; routes: TabRoute[] };

/* ------------------------------------------------------------------ *
 * Visual order of the bar — independent of file/registration order,
 * so `app/(tabs)/support.tsx` etc. don't need to move on disk.
 * Support sits in the middle (index 2 of 5) and renders as the raised
 * centre button instead of a regular item.
 * ------------------------------------------------------------------ */
const ORDER = ['index', 'jobs', 'support', 'sites', 'profile'] as const;

const META: Record<(typeof ORDER)[number], { label: string; Icon: typeof LayoutGrid }> = {
  index: { label: 'Overview', Icon: LayoutGrid },
  jobs: { label: 'Visits', Icon: ClipboardList },
  support: { label: 'Support', Icon: MessagesSquare },
  sites: { label: 'Sites', Icon: Building2 },
  profile: { label: 'Account', Icon: User },
};

function RegularItem({
  label,
  Icon,
  active,
  accent,
  onPress,
}: {
  label: string;
  Icon: typeof LayoutGrid;
  active: boolean;
  accent: string;
  onPress: () => void;
}) {
  // 0 = resting, 1 = active. Spring rather than an instant colour/size swap.
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
  active,
  accent,
  badge,
  onPress,
}: {
  active: boolean;
  accent: string;
  badge: number;
  onPress: () => void;
}) {
  // Press feedback only — the button is deliberately the same size and
  // colour whether active or not, since it's raised above the bar to be
  // found by touch, not by scanning for the highlighted one.
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
            { backgroundColor: accent, transform: [{ scale: press }] },
            active && local.centreCircleActive,
          ]}
        >
          <MessagesSquare size={26} color="#fff" />
          {badge > 0 ? (
            <View style={local.badge}>
              <Text style={local.badgeText}>{badge > 9 ? '9+' : badge}</Text>
            </View>
          ) : null}
        </Animated.View>
      </TouchableOpacity>
      <Text style={[local.centreLabel, { color: active ? accent : IDLE }]}>Support</Text>
    </View>
  );
}

function CustomTabBar({
  state,
  navigation,
}: {
  state: TabBarState;
  // The real object's `emit` is generic over its own event-map type and
  // `navigate` accepts richer args than a bare string — both are widened
  // here rather than fought with a fixed interface.
  navigation: { emit: (event: unknown) => unknown; navigate: (name: never) => void };
}) {
  const { accent } = useAccent();
  const { unread } = useChatUnread();
  const insets = useSafeAreaInsets();

  const byName: Record<string, { route: TabRoute; index: number }> = {};
  state.routes.forEach((r: TabRoute, i: number) => {
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

  return (
    <View style={[local.wrapper, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
      <View style={local.shadow}>
        <View style={local.bar}>
          {ORDER.map((name) => {
            const entry = byName[name];
            if (!entry) return null;
            const isFocused = state.index === entry.index;
            const { label, Icon } = META[name];

            if (name === 'support') {
              return (
                <CentreItem
                  key={name}
                  active={isFocused}
                  accent={accent}
                  badge={unread ?? 0}
                  onPress={() => go(name)}
                />
              );
            }

            return (
              <RegularItem
                key={name}
                label={label}
                Icon={Icon}
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

export default function TabsLayout() {
  return (
    <SiteProvider>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <CustomTabBar state={props.state} navigation={props.navigation} />}
      >
        <Tabs.Screen name="index" options={{ title: 'Overview' }} />
        <Tabs.Screen name="jobs" options={{ title: 'Visits' }} />
        <Tabs.Screen name="sites" options={{ title: 'Sites' }} />
        <Tabs.Screen name="support" options={{ title: 'Support' }} />
        <Tabs.Screen name="profile" options={{ title: 'Account' }} />
      </Tabs>
    </SiteProvider>
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

  // The centre item gets its own flex slot so the four regular items stay
  // evenly spaced either side of it, then the circle itself is pulled up
  // out of the bar with a negative margin — "raised", not just "bigger".
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