// app/staff/_layout.tsx
//
// Office/staff tab shell (Phase 2). A real path segment, not a route group —
// see app/_layout.tsx's STAFF_ROOT comment for why "/staff" instead of "/".
//
// Same floating-pill visual language as the client tab bar
// (app/(tabs)/_layout.tsx), via the shared src/components/FloatingTabBar.tsx —
// see that file's header for why it's a separate component rather than an
// edit to the client's existing one. Chats sits in the raised centre slot,
// mirroring Support's role there for the client: the one tab that's about
// talking to someone, not looking something up.
//
// The centre badge is threads-needing-attention from useStaffChatUnread()
// (/api/commercial-chat/unread, the STAFF-scoped count) PLUS every unread
// Team message from useTeamUnread() (Phase 5, /api/staff-chat/unread) —
// combined into one number, per this file's own earlier note anticipating
// exactly this. Deliberately NOT the client's useChatUnread(): that hook
// calls /customer-portal/chat/unread, which assumes a client_id a staff
// session doesn't have.
//
// The Team socket (src/teamChatSocket.ts) is started/stopped here rather
// than the root layout — internal chat is staff-only, and there is nothing
// to connect for a client session.
//
// No SiteProvider here — that's the client's "which site am I looking at"
// filter (src/site-context.tsx), fetched from /client/sites, which is
// meaningless for a session with no client_id. StaffScopeProvider (Phase 3)
// is its client-level equivalent — "which CLIENT am I looking at" — and does
// wrap the tabs here, the same way SiteProvider wraps app/(tabs)/_layout.tsx.

import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Building2, ClipboardList, LayoutGrid, MessagesSquare, User } from 'lucide-react-native';
import FloatingTabBar, { FloatingTabItem } from '../../src/components/FloatingTabBar';
import { StaffScopeProvider } from '../../src/staff-context';
import { useStaffChatUnread, useTeamUnread } from '../../src/hooks';
import { startTeamSocket, stopTeamSocket } from '../../src/teamChatSocket';

// 'chats' sits at index 2 (the middle of 5) on purpose — FloatingTabBar
// renders whichever name matches centreName as the raised circle, but its
// HORIZONTAL slot is still just its position in this array. Matches
// app/(tabs)/_layout.tsx's own ORDER, where 'support' is likewise the
// middle entry, not just centreName-tagged.
const ORDER = ['index', 'jobs', 'chats', 'clients', 'account'] as const;
const CENTRE_NAME = 'chats';

const META: Record<(typeof ORDER)[number], FloatingTabItem> = {
  index: { label: 'Overview', Icon: LayoutGrid },
  jobs: { label: 'Jobs', Icon: ClipboardList },
  clients: { label: 'Clients', Icon: Building2 },
  chats: { label: 'Chats', Icon: MessagesSquare },
  account: { label: 'Account', Icon: User },
};

function StaffTabBar(props: {
  state: React.ComponentProps<typeof FloatingTabBar>['state'];
  navigation: unknown;
}) {
  const { unread: supportUnread } = useStaffChatUnread();
  const { unread: teamUnread } = useTeamUnread();
  return (
    <FloatingTabBar
      state={props.state}
      // The real NavigationHelpers['emit'] is generic over its own event-map
      // type and can't structurally satisfy a fixed interface — same
      // tradeoff app/(tabs)/_layout.tsx makes with its own local
      // TabBarNavigation type, made explicit here with a cast instead of
      // widening FloatingTabBarNavigation's own signature to `any`.
      navigation={props.navigation as React.ComponentProps<typeof FloatingTabBar>['navigation']}
      order={ORDER as unknown as string[]}
      items={META}
      centreName={CENTRE_NAME}
      centreBadge={supportUnread + teamUnread}
    />
  );
}

export default function StaffTabsLayout() {
  useEffect(() => {
    startTeamSocket();
    return () => stopTeamSocket();
  }, []);

  return (
    <StaffScopeProvider>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <StaffTabBar state={props.state} navigation={props.navigation} />}
      >
        <Tabs.Screen name="index" options={{ title: 'Overview' }} />
        <Tabs.Screen name="jobs" options={{ title: 'Jobs' }} />
        <Tabs.Screen name="clients" options={{ title: 'Clients' }} />
        <Tabs.Screen name="chats" options={{ title: 'Chats' }} />
        <Tabs.Screen name="account" options={{ title: 'Account' }} />
      </Tabs>
    </StaffScopeProvider>
  );
}
