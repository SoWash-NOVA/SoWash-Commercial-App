import { StyleSheet } from 'react-native';

/**
 * Shared design system with sowash-customer-app. The component language —
 * cards, tabs, rows, spacing — is deliberately identical; the two apps differ
 * by accent and density, not by structure. If you change a style here that is
 * not commercial-specific, consider whether the customer app needs it too.
 *
 * COMMERCIAL vs RESIDENTIAL
 *   accent  — teal, against residential's #2E6BFF. Deliberately distinguishable
 *             at a glance, since some people will have both apps installed.
 *   density — commercial users read site tables, not hero cards. See the
 *             `compact*` styles at the end of this file.
 */

/** Default accent. Runtime accent lives in ThemeProvider (src/theme-context.tsx). */
export const ACCENT_DEFAULT = '#0F766E';

export const palette = {
  bg: '#F4F7FC',
  surface: '#ffffff',
  border: '#e2e8f0',
  borderSubtle: '#f1f5f9',
  ink: '#1e293b',
  inkSoft: '#334155',
  muted: '#64748b',
  mutedLight: '#94a3b8',
  good: '#00C853',
  goodBright: '#00E676',
  warn: '#FFB800',
  danger: '#f43f5e',
} as const;

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F7FC' },
  statusBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusIcons: { flexDirection: 'row', gap: 4 },
  heroIconBox: { width: 140, height: 140, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 32, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, elevation: 10 },
  titleExtrabold: { fontSize: 32, fontWeight: '900', color: '#1e293b', textAlign: 'center', marginBottom: 12 },
  subTextCenter: { fontSize: 16, color: '#64748b', textAlign: 'center', lineHeight: 24, maxWidth: 280, marginBottom: 32 },
  dotsRow: { flexDirection: 'row', gap: 8 },
  dot: { height: 8, borderRadius: 4 },
  btnPrimary: { width: '100%', paddingVertical: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  btnSecondary: { width: '100%', paddingVertical: 18, alignItems: 'center' },
  btnSecondaryText: { color: '#64748b', fontSize: 14, fontWeight: '600' },
  avatarBox: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#2E6BFF', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 24 },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '900' },
  subText: { fontSize: 14, color: '#64748b', marginBottom: 32 },
  inputContainer: { marginTop: 8 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 16, height: 56 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15, color: '#1e293b' },
  inputIconRight: { marginLeft: 12 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 24 },
  divider: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dividerText: { marginHorizontal: 12, fontSize: 12, color: '#94a3b8' },
  btnOutline: { width: '100%', paddingVertical: 16, borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnOutlineText: { color: '#334155', fontSize: 15, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, zIndex: 10 },
  greetingText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  userNameText: { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  bellBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, borderWidth: 2, borderColor: '#fff' },
  scrollContent: { padding: 20, paddingBottom: 120 },
  card: { backgroundColor: '#fff', borderRadius: 28, padding: 20, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 16, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  flexRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitle: { fontSize: 11, fontWeight: '800', color: '#64748b', letterSpacing: 1 },
  pill: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  pillText: { fontSize: 9, fontWeight: '800', color: '#94a3b8', letterSpacing: 1 },
  tabRow: { flexDirection: 'row', backgroundColor: '#f8fafc', padding: 4, borderRadius: 12, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  tabText: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  tabTextActive: { color: '#1e293b' },
  heroStatsRow: { flexDirection: 'row', backgroundColor: '#f8fafc', padding: 16, borderRadius: 20, borderWidth: 1, borderColor: '#f1f5f9', marginBottom: 16 },
  statLabel: { fontSize: 10, fontWeight: '800', color: '#94a3b8', letterSpacing: 1, marginBottom: 4 },
  statValue: { fontSize: 32, fontWeight: '900' },
  statUnit: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  statSub: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  statDivider: { width: 1, backgroundColor: '#e2e8f0', marginHorizontal: 12 },
  healthDot: { width: 12, height: 12, borderRadius: 6 },
  healthValue: { fontSize: 32, fontWeight: '900', color: '#1e293b' },
  healthTotal: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  healthStatus: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  timelineRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16 },
  timelineItem: { alignItems: 'center', backgroundColor: '#f8fafc', padding: 8, borderRadius: 12, borderWidth: 1, borderColor: '#f1f5f9', flex: 1, marginHorizontal: 4 },
  timelineTime: { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  timelinePct: { fontSize: 11, fontWeight: '800', color: '#1e293b', marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#94a3b8', letterSpacing: 1, marginTop: 24, marginBottom: 12, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '48%', backgroundColor: '#fff', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOpacity: 0.02, shadowRadius: 8, elevation: 1 },
  gridIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  gridLabel: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  gridSub: { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginTop: 2 },
  robotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  robotIconBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  robotTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  robotSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  robotContent: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 16 },
  robotStatsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  robotStatItem: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  robotStatLabel: { fontSize: 10, fontWeight: '700', color: '#94a3b8', marginBottom: 4 },
  robotStatVal: { fontSize: 14, fontWeight: '800', color: '#334155' },
  bottomNavWrapper: { position: 'absolute', bottom: 24, left: 20, right: 20 },
  bottomNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderRadius: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', overflow: 'hidden' },
  navItem: { flex: 1, alignItems: 'center' },
  navIconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  navLabel: { fontSize: 10, fontWeight: '800', position: 'absolute', bottom: -16 },
  /** Shared header for the not-yet-built screens. */
  stubHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  stubBackBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  stubTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  stubBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  stubBodyText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
});
