// app/job-chat/[id].tsx
//
// Job Chat for one visit: the field supervisor, the client and SoWash office in one room.
// Used by BOTH identities (client and staff) — 'job-chat' is in SHARED_STACK_SEGMENTS in app/_layout.tsx.
// The room itself is src/components/JobChatRoom.tsx.

import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { styles } from '../../src/theme';
import PageHeader from '../../src/components/PageHeader';
import JobChatRoom, { RoomHeader } from '../../src/components/JobChatRoom';

export default function JobChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [header, setHeader] = useState<RoomHeader | null>(null);
  const scheduleId = Number(id);

  return (
    <View style={styles.screen}>
      <PageHeader
        title={header?.site_name || 'Visit chat'}
        subtitle={header ? `${header.client_name} · ${header.scheduled_date}${header.team_lead_name ? ' · Supervisor ' + header.team_lead_name : ''}` : null}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/job-chat' as never))}
      />
      {Number.isInteger(scheduleId) && scheduleId > 0 ? <JobChatRoom scheduleId={scheduleId} onHeader={setHeader} /> : null}
    </View>
  );
}
