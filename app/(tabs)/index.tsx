// app/(tabs)/index.tsx
//
// Overview. Next visit, live site weather, the account-wide counts, and the
// cleaning robot — in that order.
//
// Look (2026-10-05 redesign): the SoWash logo's colours throughout — a blue→aqua
// gradient "next visit" hero with a date tile, a "coming up" list, a weather strip,
// a completion bar over four count tiles and the robot card (Maintenance and
// Documentation are reached from the Account tab); sections cascade in (FadeInRow). Fixed brand colours, not the
// user-selectable accent.
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
  ArrowUpRight,
  Bell,
  Bot,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
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
  FileText,
  Inbox,
  Layers,
  MapPin,
  Sun,
  Wind,
  Wrench,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette } from '../../src/theme';
import FadeInRow from '../../src/components/FadeInRow';
import { openJobActions } from '../../src/components/JobActions';
import { tc } from '../../src/themeEngine';
import { useAuth } from '../../src/auth/AuthContext';
import { useSiteContext } from '../../src/site-context';
import { useJobs, useStats, useUnreadCount, formatDateOnly, relativeDay } from '../../src/hooks';
import { SiteSwitcher } from '../../src/components/SiteSwitcher';
import PageHeader from '../../src/components/PageHeader';

/* ------------------------------------------------------------------ *
 * Weather — Open-Meteo, live. WMO weather_code -> icon + label, per
 * https://open-meteo.com/en/docs (current-weather section).
 * ------------------------------------------------------------------ */
type WeatherDay = {
  /** "YYYY-MM-DD" in the SITE's own timezone (Open-Meteo `timezone=auto`). */
  date: string;
  code: number;
  maxC: number;
  minC: number;
  /** Chance of rain that day, 0–100 (null if the service didn't send it). */
  rainPct: number | null;
};

type WeatherNow = {
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windKph: number;
  code: number;
  /** The next days at the site (today first). */
  daily: WeatherDay[];
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
        // The forecast for the same coordinates: next 7 days (today first), in the site's own timezone.
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
        `&forecast_days=7&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Weather service unavailable');
      const json = await res.json();
      const c = json?.current;
      if (!c) throw new Error('Weather service unavailable');
      const d = json?.daily;
      const daily: WeatherDay[] = Array.isArray(d?.time)
        ? d.time.map((date: string, i: number) => ({
            date,
            code: d.weather_code?.[i] ?? 0,
            maxC: d.temperature_2m_max?.[i],
            minC: d.temperature_2m_min?.[i],
            rainPct: d.precipitation_probability_max?.[i] ?? null,
          }))
        : [];
      setData({
        tempC: c.temperature_2m,
        feelsLikeC: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        windKph: c.wind_speed_10m,
        code: c.weather_code,
        daily: daily.filter((x) => Number.isFinite(x.maxC) && Number.isFinite(x.minC)),
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

/** "2026-10-07" → { day: '7', month: 'OCT' } from the string parts (never through a Date — see CLAUDE.md §3). */
function dateParts(value: string | null | undefined): { day: string; month: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return { day: String(parseInt(m[3], 10)), month: months[parseInt(m[2], 10) - 1] };
}

export default function OverviewScreen() {
  const router = useRouter();
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

  const jobs = upcoming.data?.jobs ?? [];
  const nextJob = jobs[0] ?? null;
  const comingUp = jobs.slice(1, 4);
  const firstLoad = stats.loading && !stats.data && upcoming.loading && !upcoming.data;

  const total = stats.data?.total ?? 0;
  const done = stats.data?.completed ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const goToJobs = (params: { scope: 'all' | 'past' | 'upcoming'; status?: string }) => {
    router.push({ pathname: '/jobs', params });
  };

  if (firstLoad) {
    return (
      <View style={[s.screen, s.centre]}>
        <ActivityIndicator size="large" color={C.blue} />
      </View>
    );
  }

  const nextParts = nextJob ? dateParts(nextJob.scheduled_date) : null;

  return (
    <View style={s.screen}>

      <PageHeader
        title={user?.firstName ? `${greeting()} ${user.firstName}` : greeting()}
        subtitle={clientName || 'Your account'}
        right={
          /* The badge is a plain dot, not a count. Two notifications per
             visit means a number would read "1" almost always, and a dot
             survives the case where the poll is stale. */
          <TouchableOpacity
            onPress={() => router.push('/notifications')}
            style={s.bellBtn}
            activeOpacity={0.85}
            accessibilityLabel={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
          >
            <Bell size={18} color="#fff" />
            {unread > 0 ? <View style={s.bellDot} /> : null}
          </TouchableOpacity>
        }
      >
        <SiteSwitcher />
      </PageHeader>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}
      >
        {/* ── Next visit: the hero ─────────────────────────────────── */}
        <FadeInRow index={0}>
          <SectionHead title="Next visit" action="All visits" onAction={() => goToJobs({ scope: 'upcoming' })} />
          {upcoming.loading && !upcoming.data ? (
            <View style={[s.skeleton, { height: 196 }]} />
          ) : nextJob ? (
            <TouchableOpacity
              onPress={() => router.push(`/job/${nextJob.schedule_id}`)}
              onLongPress={() => openJobActions(nextJob)}
              delayLongPress={300}
              activeOpacity={0.92}
              style={s.heroShadow}
            >
              <LinearGradient
                colors={['#1689CC', '#2EAEE8']}
                locations={[0, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.hero}
              >
                {/* decoration: soft rings + a lime glow */}
                <View pointerEvents="none" style={[s.ring, { width: 220, height: 220, top: -90, right: -70 }]} />
                <View pointerEvents="none" style={[s.ring, { width: 140, height: 140, top: -40, right: -20 }]} />

                <View style={s.heroTop}>
                  <View style={s.glassPill}>
                    <CalendarCheck size={13} color="#fff" />
                    <Text style={s.glassPillText}>{relativeDay(nextJob.scheduled_date) || 'Scheduled'}</Text>
                  </View>
                  {nextJob.service_number != null && String(nextJob.service_number) !== '' ? (
                    <View style={s.glassPill}>
                      <Text style={s.glassPillText}>Service #{nextJob.service_number}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={s.heroMid}>
                  {nextParts ? (
                    <View style={s.heroDateBox}>
                      <Text style={s.heroDay}>{nextParts.day}</Text>
                      <Text style={s.heroMonth}>{nextParts.month}</Text>
                    </View>
                  ) : null}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.heroDate}>{formatDateOnly(nextJob.scheduled_date)}</Text>
                    <View style={s.heroSiteRow}>
                      <MapPin size={13} color="rgba(255,255,255,0.95)" />
                      <Text style={s.heroSite} numberOfLines={1}>
                        {nextJob.site_name || 'Site'}
                        {nextJob.city ? ` · ${nextJob.city}` : ''}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={s.heroFooter}>
                  <Text style={s.heroTeam} numberOfLines={1}>
                    {nextJob.team_lead_name ? `Team lead · ${nextJob.team_lead_name}` : 'Tap to see the visit details'}
                  </Text>
                  <View style={s.heroGo}>
                    <ArrowRight size={17} color={C.blue} />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <Empty
              icon={<Inbox size={20} color={C.blue} />}
              title="Nothing scheduled"
              body={selectedSite ? `No upcoming visits for ${selectedSite.site_name}.` : 'No upcoming visits yet.'}
              compact
            />
          )}
        </FadeInRow>

        {/* ── Coming up: the next few after the hero ───────────────── */}
        {comingUp.length > 0 ? (
          <FadeInRow index={1}>
            <SectionHead title="Coming up" />
            <View style={s.listCard}>
              {comingUp.map((job, i) => {
                const p = dateParts(job.scheduled_date);
                return (
                  <TouchableOpacity
                    key={job.schedule_id}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/job/${job.schedule_id}`)}
                    onLongPress={() => openJobActions(job)}
                    delayLongPress={300}
                    style={[s.upRow, i > 0 && s.upRowBorder]}
                  >
                    <LinearGradient colors={[tc(C.blueSoft), tc(C.blueSoft)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.upDate}>
                      <Text style={s.upDay}>{p?.day ?? '—'}</Text>
                      <Text style={s.upMonth}>{p?.month ?? ''}</Text>
                    </LinearGradient>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.upSite} numberOfLines={1}>
                        {job.site_name || 'Site'}
                      </Text>
                      <Text style={s.upWhen} numberOfLines={1}>
                        {relativeDay(job.scheduled_date) || formatDateOnly(job.scheduled_date)}
                        {job.city ? ` · ${job.city}` : ''}
                      </Text>
                    </View>
                    <ChevronRight size={17} color={palette.mutedLight} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </FadeInRow>
        ) : null}

        {/* ── Site weather ─────────────────────────────────────────── */}
        <FadeInRow index={2}>
          <SectionHead title="Site weather" />
          <WeatherCard
            siteName={selectedSite?.site_name}
            hasSite={!!selectedSite}
            hasCoords={!!coords}
            loading={weather.loading}
            error={weather.error}
            data={weather.data}
          />
        </FadeInRow>

        {/* ── Counts — each tile is a link into /jobs, pre-filtered ────── */}
        <FadeInRow index={3}>
          <SectionHead title="Across all sites" />
          {stats.error && !stats.data ? (
            <Empty icon={<CircleAlert size={20} color={palette.danger} />} title="Could not load totals" body={stats.error} />
          ) : (
            <>
              {/* completion: done / total, both straight from /stats */}
              <View style={s.progressCard}>
                <View style={s.progressTop}>
                  <View>
                    <Text style={s.progressLabel}>Visits completed</Text>
                    <Text style={s.progressValue}>{stats.data ? `${done} of ${total}` : '—'}</Text>
                  </View>
                  <Text style={s.progressPct}>{stats.data ? `${pct}%` : ''}</Text>
                </View>
                <View style={s.track}>
                  <LinearGradient
                    colors={['#2EAEE8', C.blue]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[s.fill, { width: `${Math.max(pct, stats.data && done > 0 ? 4 : 0)}%` }]}
                  />
                </View>
              </View>

              <View style={s.grid}>
                <StatTile
                  colors={[tc(C.blueSoft), tc(C.blueSoft)]}
                  tint={C.blueSoft}
                  color={C.blue}
                  icon={<Layers size={18} color={C.blue} />}
                  label="Total visits"
                  value={stats.data?.total}
                  onPress={() => goToJobs({ scope: 'all' })}
                />
                <StatTile
                  colors={[tc(C.blueSoft), tc(C.blueSoft)]}
                  tint={C.greenSoft}
                  color={C.blue}
                  icon={<CheckCircle2 size={18} color={C.blue} />}
                  label="Completed"
                  value={stats.data?.completed}
                  onPress={() => goToJobs({ scope: 'past' })}
                />
                <StatTile
                  colors={[tc(C.blueSoft), tc(C.blueSoft)]}
                  tint={C.tealSoft}
                  color={C.blue}
                  icon={<Activity size={18} color={C.blue} />}
                  label="In progress"
                  value={stats.data?.inProgress}
                  onPress={() => goToJobs({ scope: 'all', status: 'in_progress' })}
                />
                <StatTile
                  colors={[tc(C.blueSoft), tc(C.blueSoft)]}
                  tint={C.amberSoft}
                  color={C.blue}
                  icon={<CalendarClock size={18} color={C.blue} />}
                  label="Booked"
                  value={stats.data?.scheduled}
                  onPress={() => goToJobs({ scope: 'upcoming' })}
                />
              </View>
            </>
          )}
        </FadeInRow>

        {/* ── Robot ──────────────────────────────────────────────────── */}
        <FadeInRow index={4}>
          <SectionHead title="Cleaning robot" />
          {!selectedSite ? (
            <Empty
              icon={<Bot size={20} color={C.blue} />}
              title="Pick a site to control its robot"
              body="Robot controls apply to one site at a time."
              compact
            />
          ) : (
            <View style={s.robotCard}>
              <TouchableOpacity activeOpacity={0.85} onPress={toggleRobot} style={s.robotRow}>
                <LinearGradient colors={[tc(C.blueSoft), tc(C.blueSoft)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.robotIcon}>
                  <Bot size={22} color={C.blue} />
                </LinearGradient>

                <View style={{ flex: 1 }}>
                  <View style={s.robotTitleRow}>
                    <Text style={s.robotTitle} numberOfLines={1}>
                      {selectedSite.site_name || 'Solar Cleaning Robot'}
                    </Text>
                    <View style={[s.statePill, robotState === 'Cleaning' && { backgroundColor: tc(C.greenSoft) }]}>
                      <View style={[s.stateDot, { backgroundColor: robotState === 'Cleaning' ? C.green : palette.mutedLight }]} />
                      <Text style={[s.statePillText, robotState === 'Cleaning' && { color: C.green }]}>{robotState}</Text>
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
                      style={{ flex: 1 }}
                    >
                      <LinearGradient colors={['#33B8F0', C.blue]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.robotBtn}>
                        <Text style={s.robotBtnText}>{robotState === 'Cleaning' ? 'Stop cleaning' : 'Start cleaning'}</Text>
                      </LinearGradient>
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
        </FadeInRow>
      </ScrollView>
    </View>
  );
}

/** Section title: a small blue→lime bar, the title, and an optional link on the right. */
function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={s.sectionHead}>
      <LinearGradient colors={[C.blue, C.blue]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={s.sectionBar} />
      <Text style={s.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} style={s.sectionAction}>
          <Text style={s.sectionActionText}>{action}</Text>
          <ChevronRight size={14} color={C.blue} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function WeatherCard({
  siteName,
  hasSite,
  hasCoords,
  loading,
  error,
  data,
}: {
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
        <MapPin size={17} color={C.blue} />
        <Text style={s.weatherEmptyText}>Pick a site to see local weather</Text>
      </View>
    );
  }

  if (!hasCoords) {
    return (
      <View style={s.weatherEmpty}>
        <MapPin size={17} color={C.blue} />
        <Text style={s.weatherEmptyText}>No location on file for {siteName || 'this site'}</Text>
      </View>
    );
  }

  if (loading && !data) {
    return (
      <View style={[s.weatherEmpty, { minHeight: 82 }]}>
        <ActivityIndicator size="small" color={C.blue} />
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
    <View style={{ gap: 10 }}>
    <LinearGradient colors={[tc('#FFFFFF'), tc('#FFFFFF')]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.weatherCard}>
      <LinearGradient colors={[tc(C.blueSoft), tc(C.blueSoft)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.weatherIcon}>
        <Icon size={26} color={C.blue} />
      </LinearGradient>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.weatherTempRow}>
          <Text style={s.weatherTemp}>{Math.round(data.tempC)}°</Text>
          <Text style={s.weatherFeels}>Feels {Math.round(data.feelsLikeC)}°</Text>
        </View>
        <Text style={s.weatherLabel} numberOfLines={1}>
          {label}
          {siteName ? ` · ${siteName}` : ''}
        </Text>
      </View>
      <View style={s.weatherChips}>
        <View style={s.weatherChip}>
          <Droplets size={12} color={C.blue} />
          <Text style={s.weatherChipText}>{Math.round(data.humidity)}%</Text>
        </View>
        <View style={s.weatherChip}>
          <Wind size={12} color={C.blue} />
          <Text style={s.weatherChipText}>{Math.round(data.windKph)} km/h</Text>
        </View>
      </View>
    </LinearGradient>

    {/* Forecast for the same site: the next days, with the chance of rain (useful for planning a clean). */}
    {data.daily.length > 1 ? (
      <View style={s.forecastCard}>
        <Text style={s.forecastTitle}>{siteName ? `Forecast · ${siteName}` : 'Forecast'}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.forecastRow}>
          {data.daily.map((day, i) => {
            const DayIcon = weatherMeta(day.code).Icon;
            return (
              <View key={day.date} style={[s.forecastDay, i === 0 && s.forecastDayToday]}>
                <Text style={s.forecastDayName}>{i === 0 ? 'Today' : weekdayShort(day.date)}</Text>
                <DayIcon size={22} color={C.blue} />
                <Text style={s.forecastMax}>{Math.round(day.maxC)}°</Text>
                <Text style={s.forecastMin}>{Math.round(day.minC)}°</Text>
                <View style={s.forecastRain}>
                  <Droplets size={10} color={day.rainPct != null && day.rainPct >= 40 ? C.blue : palette.mutedLight} />
                  <Text style={[s.forecastRainText, day.rainPct != null && day.rainPct >= 40 && { color: C.blue }]}>
                    {day.rainPct != null ? `${Math.round(day.rainPct)}%` : '–'}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    ) : null}
    </View>
  );
}

/** "2026-10-09" → "Fri", from the string parts (never through a UTC-parsed Date — see CLAUDE.md §3). */
function weekdayShort(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return '';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()];
}

function StatTile({
  colors,
  tint,
  color,
  icon,
  label,
  value,
  onPress,
}: {
  colors: [string, string];
  tint: string;
  color: string;
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} disabled={!onPress} style={s.tile}>
      {/* a soft tinted circle in the corner */}
      <View style={s.tileTop}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.tileIcon}>
          {icon}
        </LinearGradient>
        <ArrowUpRight size={15} color={color} />
      </View>
      <Text style={s.tileValue}>{value ?? '—'}</Text>
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
    <View style={[s.empty, compact && { paddingVertical: 28 }]}>
      <View style={s.emptyIcon}>{icon}</View>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
    </View>
  );
}

/* Brand-harmonious colours for this screen — the logo's blue and green, plus a teal
   between them and one warm amber so the four counts stay distinct at a glance. Fixed,
   not the user-selectable accent, like the headers. */
const C = {
  blue: '#1C9BE0',
  blueSoft: '#E6F5FD',
  green: '#3E9F00',
  greenSoft: '#EEFAE0',
  teal: '#0E9F9A',
  tealSoft: '#E0F6F4',
  amber: '#E08E0B',
  amberSoft: '#FDF1DA',
};

const CARD_SHADOW = {
  shadowColor: '#0b2a3a',
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FA' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  blob: { position: 'absolute', borderRadius: 999, opacity: 0.6 },

  // 140 clears the floating tab bar (its own height + the raised centre
  // button + safe-area inset) — without this the last card sits behind it
  // and, since there's nothing below to scroll past, is unreachable.
  scroll: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 140 },

  bellBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 9,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#FF5A5F',
    borderWidth: 1.5,
    borderColor: '#fff',
  },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, marginBottom: 12 },
  sectionBar: { width: 4, height: 16, borderRadius: 2 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: palette.ink, letterSpacing: -0.1 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { fontSize: 12.5, fontWeight: '800', color: C.blue },

  // hero
  heroShadow: {
    borderRadius: 26,
    shadowColor: '#1C9BE0',
    shadowOpacity: 0.35,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  hero: { borderRadius: 26, padding: 18, overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  glassPillText: { color: '#fff', fontSize: 11.5, fontWeight: '800', letterSpacing: 0.3 },
  heroMid: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 },
  heroDateBox: {
    width: 62,
    height: 66,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDay: { fontSize: 26, fontWeight: '900', color: C.blue, lineHeight: 30 },
  heroMonth: { fontSize: 11, fontWeight: '900', color: palette.muted, letterSpacing: 1 },
  heroDate: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '900',
    textShadowColor: 'rgba(8,60,95,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  heroSiteRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  heroSite: { flex: 1, color: '#fff', fontSize: 13.5, fontWeight: '700' },
  heroFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.28)',
  },
  heroTeam: { flex: 1, color: 'rgba(255,255,255,0.95)', fontSize: 12.5, fontWeight: '700' },
  heroGo: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },

  // coming up
  listCard: { backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 14, ...CARD_SHADOW },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  upRowBorder: { borderTopWidth: 1, borderTopColor: '#EEF3F7' },
  upDate: { width: 46, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  upDay: { fontSize: 17, fontWeight: '900', color: C.blue, lineHeight: 20 },
  upMonth: { fontSize: 9.5, fontWeight: '900', color: palette.muted, letterSpacing: 0.8 },
  upSite: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  upWhen: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 2 },

  // weather
  weatherCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EDF2F6',
    ...CARD_SHADOW,
  },
  weatherIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  weatherTempRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  weatherTemp: { fontSize: 28, fontWeight: '900', color: palette.ink },
  weatherFeels: { fontSize: 11.5, fontWeight: '700', color: palette.mutedLight },
  weatherLabel: { fontSize: 12.5, fontWeight: '700', color: palette.muted, marginTop: 1 },
  weatherChips: { gap: 6 },
  weatherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    borderColor: '#E3EEF4',
  },
  weatherChipText: { fontSize: 11, fontWeight: '800', color: palette.inkSoft },
  weatherEmpty: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...CARD_SHADOW,
  },
  weatherEmptyText: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: palette.muted, lineHeight: 17 },

  // forecast strip under the current weather
  forecastCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#EDF2F6',
    ...CARD_SHADOW,
  },
  forecastTitle: { fontSize: 12, fontWeight: '800', color: palette.muted, paddingHorizontal: 16, marginBottom: 8 },
  forecastRow: { paddingHorizontal: 12, gap: 8 },
  forecastDay: {
    width: 64,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#F4F9FC',
  },
  forecastDayToday: { backgroundColor: '#E3F2FB' },
  forecastDayName: { fontSize: 11.5, fontWeight: '800', color: palette.inkSoft },
  forecastMax: { fontSize: 15, fontWeight: '900', color: palette.ink },
  forecastMin: { fontSize: 12, fontWeight: '700', color: palette.mutedLight },
  forecastRain: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  forecastRainText: { fontSize: 10.5, fontWeight: '800', color: palette.mutedLight },

  // progress + tiles
  progressCard: { backgroundColor: '#fff', borderRadius: 22, padding: 16, marginBottom: 12, ...CARD_SHADOW },
  progressTop: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  progressLabel: { fontSize: 12, fontWeight: '700', color: palette.muted },
  progressValue: { fontSize: 18, fontWeight: '900', color: palette.ink, marginTop: 2 },
  progressPct: { fontSize: 22, fontWeight: '900', color: C.blue },
  track: { height: 10, borderRadius: 5, backgroundColor: '#EDF3F7', marginTop: 12, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 15,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  tileBlob: { position: 'absolute', width: 96, height: 96, borderRadius: 48, top: -36, right: -30 },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  tileIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  tileValue: { fontSize: 28, fontWeight: '900', color: palette.ink, marginTop: 14 },
  tileLabel: { fontSize: 12, fontWeight: '700', color: palette.muted, marginTop: 1 },

  // robot
  robotCard: { backgroundColor: '#fff', borderRadius: 22, padding: 16, ...CARD_SHADOW },
  robotRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  robotIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  robotTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  robotTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: palette.ink },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  stateDot: { width: 6, height: 6, borderRadius: 3 },
  statePillText: { fontSize: 10.5, fontWeight: '800', color: palette.muted },
  robotSub: { fontSize: 12, color: palette.mutedLight, marginTop: 4, fontWeight: '600' },
  chevBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F4F8FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotPanel: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#EEF3F7', paddingTop: 14 },
  robotMetaRow: { flexDirection: 'row' },
  robotMetaLabel: { fontSize: 9.5, fontWeight: '800', color: palette.mutedLight, letterSpacing: 0.7 },
  robotMetaValue: { fontSize: 14, fontWeight: '800', color: palette.ink, marginTop: 3 },
  robotBtnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  robotBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  robotBtnGhost: { backgroundColor: '#F1F5F9' },
  robotBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },

  empty: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 26,
    paddingHorizontal: 20,
    ...CARD_SHADOW,
  },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 14.5, fontWeight: '800', color: palette.ink, marginTop: 2 },
  emptyBody: { fontSize: 12.5, lineHeight: 18, color: palette.muted, textAlign: 'center' },

  skeleton: { borderRadius: 26, backgroundColor: '#fff', ...CARD_SHADOW },
});
