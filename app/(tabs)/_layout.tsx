// app/(tabs)/_layout.tsx
//
// Four tabs. Sites earns its place here rather than living only behind the
// header switcher — a commercial client's list of plants, with their sizes and
// install status, is something people come to look at directly.
//
// SiteProvider wraps the tabs rather than the root layout: it fetches
// /client/sites, which needs a session, and nothing outside the signed-in area
// has any use for it.

import React from 'react';
import { Tabs } from 'expo-router';
import { Building2, ClipboardList, LayoutGrid, User } from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { SiteProvider } from '../../src/site-context';

export default function TabsLayout() {
  const { accent } = useAccent();

  return (
    <SiteProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: accent,
          tabBarInactiveTintColor: palette.mutedLight,
          tabBarStyle: {
            backgroundColor: palette.surface,
            borderTopColor: palette.border,
            height: 62,
            paddingBottom: 8,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
          sceneStyle: { backgroundColor: palette.bg },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Overview',
            tabBarIcon: ({ color, size }) => <LayoutGrid size={size - 2} color={color} />,
          }}
        />
        <Tabs.Screen
          name="jobs"
          options={{
            title: 'Visits',
            tabBarIcon: ({ color, size }) => <ClipboardList size={size - 2} color={color} />,
          }}
        />
        <Tabs.Screen
          name="sites"
          options={{
            title: 'Sites',
            tabBarIcon: ({ color, size }) => <Building2 size={size - 2} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Account',
            tabBarIcon: ({ color, size }) => <User size={size - 2} color={color} />,
          }}
        />
      </Tabs>
    </SiteProvider>
  );
}
