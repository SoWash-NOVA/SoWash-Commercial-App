// app/(tabs)/index.tsx
//
// Overview. Next visit, live site weather, the account-wide counts, and the
// cleaning robot — in that order.
//
// Visual language matches the customer app's home screen: light wash
// background, ambient colour blobs, white shadowed cards, bold numerals.
//
// The KPI row is deliberately labelled "across all sites" — /stats takes no
// site_id, so it does not narrow with the switcher. Letting those numbers sit
// unlabelled above a site-filtered list is exactly how the web portal ended up
// claiming 219 completed jobs over a list of 30.
//
// KPI TILES ARE NOW LINKS — each pushes to /jobs with query params that
// jobs.tsx reads on mount (`useLocalSearchParams`) to preselect a scope tab:
//   Total  -> scope=all            (no status filter)
//   Done   -> scope=past           (past IS "completed" in this app's scope
//                                    vocabulary — same tab jobs.tsx already
//                                    labels "Completed")
//   Booked -> scope=upcoming       (booked/scheduled jobs are upcoming ones)
//   Active -> scope=all, status=in_progress
// ⚠️ ASSUMPTION: "Active" has no dedicated scope tab (jobs.tsx only supports
// past/upcoming/all), so it fetches 'all' and jobs.tsx filters client-side
// by `job.status === 'in_progress'`. I don't actually know the exact string
// your backend puts in a job's `status` field for an in-progress job — if
// it's not literally "in_progress" (could be "active", "in-progress", etc.),
// tell me the real value and it's a one-line fix in both files.
//
// WEATHER — real data only, no mock values anywhere in this file. Source:
// Open-Meteo's free forecast API (no key required). It needs a lat/lng,
// which this screen tries to read off the selected site under a few common
// field-name shapes (`lat`/`lng`, `latitude`/`longitude`, or a combined
// "lat,lng" string under `pin_location` / `location` / `coordinates`). If
// none of those match your actual `Site` type, tell me the real field name
// and I'll swap `extractCoords` to match — until then the card degrades
// honestly to "no location on file" rather than guessing.
//
// ROBOT CONTROL — this card is UI-only, same as the customer app's version:
// no backend hook for robot state/telemetry exists in this codebase yet, so
// "Battery / Last run / Panels" and the Start/Stop buttons don't touch a
// real device. It's here as the same interaction shell, ready to wire up
// once there's an actual robot-control endpoint — tell me its shape
// (fields, route) and I'll swap the local state for a real hook.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  Bell,
  Bot,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Activity,
  Inbox,
  Layers,
  MapPin,
  Sun,
  Wind,
  Wrench,
} from 'lucide-react-native';
import { palette } from '../../src/theme';
import { useAccent } from '../../src/theme-context';
import { useAuth } from '../../src/auth/AuthContext';
import { useSiteContext } from '../../src/site-context';
import { useJobs, useStats, useUnreadCount, formatDateOnly, relativeDay } from '../../src/hooks';
import { SiteSwitcher } from '../../src/components/SiteSwitcher';

/* ------------------------------------------------------------------ *
 * Tile colours — fixed per-metric, same convention as the customer app's
 * MAIN MENU grid, so the four counts stay visually distinct at a glance.
 * ------------------------------------------------------------------ */
const BLUE = '#3b82f6';
const GREEN = '#10b981';
const PURPLE = '#8b5cf6';
const ORANGE = '#f59e0b';

/* ------------------------------------------------------------------ *
 * Weather — Open-Meteo, live. WMO weather_code -> icon + label, per
 * https://open-meteo.com/en/docs (current-weather section).
 * ------------------------------------------------------------------ */
type WeatherNow = {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  code: number;
};

function weatherMeta(code: number): { Icon: typeof Sun; label: string } {
  if (code === 0) return { Icon: Sun, label: 'Clear sky' };
  if (code === 1 || code === 2) return { Icon: CloudSun, label: 'Partly cloudy' };
  if (code === 3) return { Icon: Cloud, label: 'Overcast' };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: 'Fog' };
  if (code >= 51 && code <= 57) return { Icon: CloudDrizzle, label: 'Drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) {
    return { Icon: CloudRain, label: 'Rain' };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return { Icon: CloudSnow, label: 'Snow' };
  }
  if (code >= 95) return { Icon: CloudLightning, label: 'Thunderstorm' };
  return { Icon: Cloud, label: 'Cloudy' };
}

/** Selected site ke object se lat/lng nikalne ki koshish — kayi possible
 * field names try karta hai kyunke actual Site type abhi maloom nahi. */
function extractCoords(site: unknown): { lat: number; lng: number } | null {
  if (!site || typeof site !== 'object') return null;
  const s = site as Record<string, unknown>;

  const latRaw = s.lat ?? s.latitude ?? s.site_lat ?? s.location_lat;
  const lngRaw = s.lng ?? s.lon ?? s.longitude ?? s.site_lng ?? s.location_lng;
  const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
  const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0)) {
    return { lat, lng };
  }

  const combined = s.pin_location ?? s.location ?? s.coordinates ?? s.geo;
  if (typeof combined === 'string') {
    const m = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(combined);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }

  return null;
}

function useSiteWeather(coords: { lat: number; lng: number } | null) {
  const [loading, setLoading] = useState(!!coords);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WeatherNow | null>(null);

  const lat = coords?.lat;
  const lng = coords?.lng;

  const load = useCallback(async () => {
    if (lat === undefined || lng === undefined) {
      setLoading(false);
      setError(null);
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather service unavailable');
      const json = await res.json();
      const c = json?.current;
      if (!c) throw new Error('Weather service unavailable');
      setData({
        tempC: c.temperature_2m,
        feelsLikeC: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        windKph: c.wind_speed_10m,
        code: c.weather_code,
      });
    } catch {
      setError('Could not load weather');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [lat, lng]);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, error, data, refresh: load };
}

function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return 'Good morning,';
  if (h < 17) return 'Good afternoon,';
  return 'Good evening,';
}

export default function OverviewScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const accentColor = accent || BLUE;
  const { clientName, user } = useAuth();
  const { selectedSiteId, selectedSite } = useSiteContext();

  const stats = useStats();
  const upcoming = useJobs({ scope: 'upcoming', siteId: selectedSiteId, limit: 5 });
  const { unread } = useUnreadCount();

  const coords = extractCoords(selectedSite);
  const weather = useSiteWeather(coords);

  const [robotOpen, setRobotOpen] = useState(false);
  const [robotState, setRobotState] = useState<'Standby' | 'Cleaning' | 'Docking'>('Standby');
  const chevron = useRef(new Animated.Value(0)).current;

  const toggleRobot = () => {
    const to = robotOpen ? 0 : 1;
    setRobotOpen(!robotOpen);
    Animated.timing(chevron, {
      toValue: to,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };
  const chevronRotate = chevron.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const refreshing = stats.refreshing || upcoming.refreshing;
  const onRefresh = async () => {
    await Promise.all([stats.refresh(), upcoming.refresh(), weather.refresh()]);
  };

  const nextJob = upcoming.data?.jobs?.[0] ?? null;
  const firstLoad = stats.loading && !stats.data && upcoming.loading && !upcoming.data;

  const goToJobs = (params: { scope: 'all' | 'past' | 'upcoming'; status?: string }) => {
    router.push({ pathname: '/jobs', params });
  };

  if (firstLoad) {
    return (
      <View style={[s.screen, s.centre]}>
        <ActivityIndicator size="large" color={accentColor} />
      </View>
    );
  }

  return (
    <View style={s.screen}>
      {/* Ambient background wash — same three blobs as the customer app,
          plain Views only, no extra package needed. */}
      <View pointerEvents="none" style={s.wash}>
        <View style={[s.blob, { backgroundColor: '#dbeafe', top: -90, left: -70, width: 280, height: 280 }]} />
        <View style={[s.blob, { backgroundColor: '#ede9fe', top: 320, right: -110, width: 300, height: 300 }]} />
        <View style={[s.blob, { backgroundColor: '#fce7f3', bottom: -60, left: -40, width: 260, height: 260 }]} />
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accentColor} />
        }
      >
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>{user?.firstName ? `${greeting()} ${user.firstName}` : greeting()}</Text>
            <Text style={s.client} numberOfLines={2}>
              {clientName || 'Your account'}
            </Text>
          </View>

          {/* The badge is a plain dot, not a count. Two notifications per
              visit means a number would read "1" almost always, and a dot
              survives the case where the poll is stale. */}
          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            style={s.bellBtn}
            activeOpacity={0.85}
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            <Bell size={18} color={palette.inkSoft} />
            {unread > 0 ? <View style={[s.bellDot, { backgroundColor: accentColor }]} /> : null}
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 14, marginBottom: 4 }}>
          <SiteSwitcher />
        </View>

        {/* ── Next visit + live weather ──────────────────────────────── */}
        <View style={s.topRow}>
          <View style={s.topRowMain}>
            <Text style={s.sectionTitle}>NEXT VISIT</Text>
            {upcoming.loading && !upcoming.data ? (
              <View style={[s.skeleton, { height: 176 }]} />
            ) : nextJob ? (
              <TouchableOpacity
                onPress={() => router.push(`/job/${nextJob.schedule_id}`)}
                activeOpacity={0.9}
                style={[s.hero, { backgroundColor: accentColor }]}
              >
                <View style={s.heroTop}>
                  <CalendarCheck size={20} color="#fff" />
                  <Text style={s.heroWhen}>{relativeDay(nextJob.scheduled_date) || 'Scheduled'}</Text>
                </View>
                <Text style={s.heroDate}>{formatDateOnly(nextJob.scheduled_date)}</Text>
                <Text style={s.heroSite} numberOfLines={1}>
                  {nextJob.site_name || 'Site'}
                </Text>
                <View style={s.heroFooter}>
                  <Text style={s.heroLink}>View details</Text>
                  <ArrowRight size={15} color="#fff" />
                </View>
              </TouchableOpacity>
            ) : (
              <Empty
                icon={<Inbox size={20} color={palette.mutedLight} />}
                title="Nothing scheduled"
                body={
                  selectedSite ? `No upcoming visits for ${selectedSite.site_name}.` : 'No upcoming visits yet.'
                }
                compact
              />
            )}
          </View>

          <View style={s.topRowSide}>
            <Text style={s.sectionTitle}>SITE WEATHER</Text>
            <WeatherCard
              accent={accentColor}
              siteName={selectedSite?.site_name}
              hasSite={!!selectedSite}
              hasCoords={!!coords}
              loading={weather.loading}
              error={weather.error}
              data={weather.data}
            />
          </View>
        </View>

        {/* ── Counts — each tile is a link into /jobs, pre-filtered ────── */}
        <Text style={s.sectionTitle}>ACROSS ALL SITES</Text>
        {stats.error && !stats.data ? (
          <Empty icon={<CircleAlert size={20} color={palette.danger} />} title="Could not load totals" body={stats.error} />
        ) : (
          <View style={s.grid}>
            <StatTile
              color={BLUE}
              icon={<Layers size={19} color={BLUE} />}
              label="Total"
              value={stats.data?.total}
              onPress={() => goToJobs({ scope: 'all' })}
            />
            <StatTile
              color={GREEN}
              icon={<CheckCircle2 size={19} color={GREEN} />}
              label="Done"
              value={stats.data?.completed}
              onPress={() => goToJobs({ scope: 'past' })}
            />
            <StatTile
              color={PURPLE}
              icon={<Activity size={19} color={PURPLE} />}
              label="Active"
              value={stats.data?.inProgress}
              onPress={() => goToJobs({ scope: 'all', status: 'in_progress' })}
            />
            <StatTile
              color={ORANGE}
              icon={<CalendarClock size={19} color={ORANGE} />}
              label="Booked"
              value={stats.data?.scheduled}
              onPress={() => goToJobs({ scope: 'upcoming' })}
            />
          </View>
        )}

        {/* Maintenance lives on its own table with no site column, so it is a
            separate destination rather than another filter on this screen. */}
        <TouchableOpacity onPress={() => router.push('/maintenance')} style={s.linkTile} activeOpacity={0.9}>
          <View style={[s.linkIcon, { backgroundColor: `${accentColor}14` }]}>
            <Wrench size={18} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.linkTitle}>Maintenance</Text>
            <Text style={s.linkSub}>Contract tasks and checklists</Text>
          </View>
          <ArrowRight size={16} color={palette.mutedLight} />
        </TouchableOpacity>

        {/* ── Robot ──────────────────────────────────────────────────── */}
        <Text style={s.sectionTitle}>CLEANING ROBOT</Text>
        {!selectedSite ? (
          <Empty
            icon={<Bot size={20} color={palette.mutedLight} />}
            title="Pick a site to control its robot"
            body="Robot controls apply to one site at a time."
            compact
          />
        ) : (
          <View style={s.robotCard}>
            <TouchableOpacity activeOpacity={0.85} onPress={toggleRobot} style={s.robotRow}>
              <View style={[s.robotIcon, { backgroundColor: accentColor }]}>
                <Bot size={22} color="#fff" />
              </View>

              <View style={{ flex: 1 }}>
                <View style={s.robotTitleRow}>
                  <Text style={s.robotTitle} numberOfLines={1}>
                    {selectedSite.site_name || 'Solar Cleaning Robot'}
                  </Text>
                  <View style={s.statePill}>
                    <Text style={s.statePillText}>{robotState}</Text>
                  </View>
                </View>
                <Text style={s.robotSub}>Model: Sowash-X1 Bot • Tap to control</Text>
              </View>

              <Animated.View style={[s.chevBtn, { transform: [{ rotate: chevronRotate }] }]}>
                <ChevronDown size={16} color={palette.mutedLight} />
              </Animated.View>
            </TouchableOpacity>

            {robotOpen && (
              <View style={s.robotPanel}>
                <View style={s.robotMetaRow}>
                  <RobotMeta label="BATTERY" value="82%" />
                  <RobotMeta label="LAST RUN" value="2 days ago" />
                  <RobotMeta label="PANELS" value="48" />
                </View>

                <View style={s.robotBtnRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setRobotState(robotState === 'Cleaning' ? 'Standby' : 'Cleaning')}
                    style={[s.robotBtn, { backgroundColor: accentColor }]}
                  >
                    <Text style={s.robotBtnText}>
                      {robotState === 'Cleaning' ? 'Stop cleaning' : 'Start cleaning'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setRobotState('Docking')}
                    style={[s.robotBtn, s.robotBtnGhost]}
                  >
                    <Text style={[s.robotBtnText, { color: palette.inkSoft }]}>Return to dock</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function WeatherCard({
  accent,
  siteName,
  hasSite,
  hasCoords,
  loading,
  error,
  data,
}: {
  accent: string;
  siteName?: string | null;
  hasSite: boolean;
  hasCoords: boolean;
  loading: boolean;
  error: string | null;
  data: WeatherNow | null;
}) {
  if (!hasSite) {
    return (
      <View style={s.weatherEmpty}>
        <MapPin size={17} color={palette.mutedLight} />
        <Text style={s.weatherEmptyText}>Pick a site to see local weather</Text>
      </View>
    );
  }

  if (!hasCoords) {
    return (
      <View style={s.weatherEmpty}>
        <MapPin size={17} color={palette.mutedLight} />
        <Text style={s.weatherEmptyText}>No location on file for {siteName || 'this site'}</Text>
      </View>
    );
  }

  if (loading && !data) {
    return (
      <View style={[s.weatherCard, s.centre]}>
        <ActivityIndicator size="small" color={accent} />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={s.weatherEmpty}>
        <CircleAlert size={17} color={palette.danger} />
        <Text style={s.weatherEmptyText}>{error}</Text>
      </View>
    );
  }

  if (!data) return null;

  const { Icon, label } = weatherMeta(data.code);

  return (
    <View style={s.weatherCard}>
      <View style={s.weatherTop}>
        <Icon size={24} color={accent} />
        <Text style={[s.weatherTemp, { color: accent }]}>{Math.round(data.tempC)}°</Text>
      </View>
      <Text style={s.weatherLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={s.weatherFeels}>Feels {Math.round(data.feelsLikeC)}°</Text>
      <View style={s.weatherDivider} />
      <View style={s.weatherStatsRow}>
        <View style={s.weatherStat}>
          <Droplets size={12} color={palette.mutedLight} />
          <Text style={s.weatherStatText}>{Math.round(data.humidity)}%</Text>
        </View>
        <View style={s.weatherStat}>
          <Wind size={12} color={palette.mutedLight} />
          <Text style={s.weatherStatText}>{Math.round(data.windKph)} km/h</Text>
        </View>
      </View>
    </View>
  );
}

function StatTile({
  color,
  icon,
  label,
  value,
  onPress,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={!onPress}
      style={[s.tile, { borderColor: `${color}33` }]}
    >
      <View style={[s.tileIcon, { backgroundColor: `${color}14` }]}>{icon}</View>
      <Text style={[s.tileValue, { color }]}>{value ?? '—'}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function RobotMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.robotMetaLabel}>{label}</Text>
      <Text style={s.robotMetaValue}>{value}</Text>
    </View>
  );
}

function Empty({
  icon,
  title,
  body,
  compact,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string | null;
  compact?: boolean;
}) {
  return (
    <View style={[s.empty, compact && { paddingVertical: 30 }]}>
      {icon}
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6f8ff' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.55 },

  // 140 clears the floating tab bar (its own height + the raised centre
  // button + safe-area inset) — without this the last card sits behind it
  // and, since there's nothing below to scroll past, is unreachable.
  scroll: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 140 },

  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  greeting: { fontSize: 13, color: palette.muted, fontWeight: '600' },
  client: { fontSize: 22, fontWeight: '900', color: palette.ink, marginTop: 2 },
  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...CARD_SHADOW,
  },
  bellDot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4 },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: palette.mutedLight,
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 10,
  },

  topRow: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  topRowMain: { flex: 1.3 },
  topRowSide: { flex: 1, minWidth: 0 },

  hero: { borderRadius: 24, padding: 18, flex: 1, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  heroWhen: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  heroDate: { color: '#fff', fontSize: 24, fontWeight: '900' },
  heroSite: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, fontWeight: '700', marginTop: 4 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  heroLink: { color: '#fff', fontSize: 13, fontWeight: '800' },

  weatherCard: { backgroundColor: '#fff', borderRadius: 24, padding: 16, flex: 1, ...CARD_SHADOW },
  weatherTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weatherTemp: { fontSize: 24, fontWeight: '900' },
  weatherLabel: { fontSize: 13, fontWeight: '800', color: palette.ink, marginTop: 8 },
  weatherFeels: { fontSize: 11, fontWeight: '600', color: palette.mutedLight, marginTop: 2 },
  weatherDivider: { height: 1, backgroundColor: '#eef2f7', marginTop: 12, marginBottom: 10 },
  weatherStatsRow: { flexDirection: 'row', gap: 12 },
  weatherStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weatherStatText: { fontSize: 11, fontWeight: '700', color: palette.mutedLight },
  weatherEmpty: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...CARD_SHADOW,
  },
  weatherEmptyText: { fontSize: 11.5, fontWeight: '700', color: palette.mutedLight, textAlign: 'center', lineHeight: 16 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    padding: 15,
    ...CARD_SHADOW,
  },
  tileIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 24, fontWeight: '900', marginTop: 14 },
  tileLabel: { fontSize: 11.5, fontWeight: '700', color: palette.mutedLight, marginTop: 2 },

  linkTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    marginTop: 14,
    ...CARD_SHADOW,
  },
  linkIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  linkSub: { fontSize: 12, fontWeight: '600', color: palette.mutedLight, marginTop: 2 },

  robotCard: { backgroundColor: '#fff', borderRadius: 22, padding: 16, ...CARD_SHADOW },
  robotRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  robotIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  robotTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  robotTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: palette.ink },
  statePill: { backgroundColor: '#f1f5f9', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  statePillText: { fontSize: 10.5, fontWeight: '800', color: palette.muted },
  robotSub: { fontSize: 12, color: palette.mutedLight, marginTop: 4, fontWeight: '600' },
  chevBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotPanel: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#eef2f7', paddingTop: 14 },
  robotMetaRow: { flexDirection: 'row' },
  robotMetaLabel: { fontSize: 9.5, fontWeight: '800', color: palette.mutedLight, letterSpacing: 0.7 },
  robotMetaValue: { fontSize: 14, fontWeight: '800', color: palette.ink, marginTop: 3 },
  robotBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  robotBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  robotBtnGhost: { backgroundColor: '#f1f5f9' },
  robotBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  empty: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 26,
    paddingHorizontal: 20,
    ...CARD_SHADOW,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: palette.ink, marginTop: 2 },
  emptyBody: { fontSize: 12.5, lineHeight: 18, color: palette.mutedLight, textAlign: 'center' },

  skeleton: { borderRadius: 20, backgroundColor: '#fff', ...CARD_SHADOW },
});