// src/components/JobCard.tsx
//
// One service visit, as it appears in a list. Shared by the dashboard and the
// Jobs tab so a job never looks like two different things in two places.
//
// Denser than the residential app's equivalent on purpose: a commercial user is
// scanning a list of visits across sites, so the site name has to lead and the
// row has to stay compact enough that several fit on screen.

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronRight, Images, MapPin, Route, User } from 'lucide-react-native';
import { palette } from '../theme';
import { useAccent } from '../theme-context';
import { JobSummary } from '../api/types';
import { formatDateOnly, relativeDay, statusMeta } from '../hooks';
import { parsePhotos } from '../api/client';

export function JobCard({ job, showSite = true }: { job: JobSummary; showSite?: boolean }) {
  const router = useRouter();
  const { accent } = useAccent();

  const meta = statusMeta(job.status);
  const when = relativeDay(job.scheduled_date);
  const photoCount =
    parsePhotos(job.before_photos).length + parsePhotos(job.after_photos).length;

  return (
    <TouchableOpacity
      onPress={() => router.push(`/job/${job.schedule_id}`)}
      style={local.card}
      accessibilityRole="button"
    >
      <View style={local.headerRow}>
        <View style={{ flex: 1 }}>
          {showSite ? (
            <Text style={local.site} numberOfLines={1}>
              {job.site_name || 'Site'}
            </Text>
          ) : null}
          <View style={local.metaRow}>
            <CalendarDays size={12} color={palette.mutedLight} />
            <Text style={local.date}>{formatDateOnly(job.scheduled_date)}</Text>
            {when ? <Text style={local.relative}>· {when}</Text> : null}
          </View>
        </View>

        <View style={[local.pill, { backgroundColor: meta.bg }]}>
          <Text style={[local.pillText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </View>

      {showSite && job.address ? (
        <View style={local.metaRow}>
          <MapPin size={12} color={palette.mutedLight} />
          <Text style={local.sub} numberOfLines={1}>
            {[job.address, job.city].filter(Boolean).join(', ')}
          </Text>
        </View>
      ) : null}

      <View style={local.footerRow}>
        <View style={local.badges}>
          {job.team_lead_name ? (
            <Badge icon={<User size={11} color={palette.muted} />} label={job.team_lead_name} />
          ) : null}
          {photoCount > 0 ? (
            <Badge
              icon={<Images size={11} color={palette.muted} />}
              label={`${photoCount} photo${photoCount === 1 ? '' : 's'}`}
            />
          ) : null}
          {job.has_sld_walkthrough ? (
            <Badge
              icon={<Route size={11} color={accent} />}
              label="Walkthrough"
              color={accent}
            />
          ) : null}
        </View>
        <ChevronRight size={16} color={palette.mutedLight} />
      </View>
    </TouchableOpacity>
  );
}

function Badge({
  icon,
  label,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  color?: string;
}) {
  return (
    <View style={local.badge}>
      {icon}
      <Text style={[local.badgeText, color ? { color } : null]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const local = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  site: { fontSize: 15, fontWeight: '800', color: palette.ink, marginBottom: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  date: { fontSize: 12, fontWeight: '700', color: palette.muted },
  relative: { fontSize: 12, fontWeight: '600', color: palette.mutedLight },
  sub: { flex: 1, fontSize: 12, color: palette.mutedLight, fontWeight: '600' },
  pill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10 },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.borderSubtle,
    paddingTop: 10,
  },
  badges: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 11, fontWeight: '700', color: palette.muted, maxWidth: 130 },
});

export default JobCard;
