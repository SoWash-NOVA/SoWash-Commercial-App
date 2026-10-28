// app/phonebook.tsx — Staff Phone Book.
//
// The company phone's contacts are backed up to the server AUTOMATICALLY (see
// autoBackup() in src/phonebook.ts, started from app/staff/_layout.tsx), and can
// be restored onto a new phone — but only after an APPROVAL: the superadmin and
// any one admin must both approve the request first. A root-level stack page (not
// a tab), reached from the staff Account tab; app/_layout.tsx lists it in
// STAFF_STACK_SEGMENTS.
//
// Three views (the last two only for people the server marks is_admin):
//   My phone book  backup status + "Back up now", the restore request card
//                  (request -> waiting -> approved -> restore now), my contacts.
//   Team           read-only: everyone's backed-up contacts, filter by person.
//   Requests       open restore requests with full detail and Approve / Reject
//                  (approvers only), plus the last 7 days of decisions.
//
// What the server decides, the app only displays: is_admin / is_approver come
// from /summary, and every approve / reject / restore is re-checked server-side.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  CloudDownload,
  CloudUpload,
  Phone,
  Search,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react-native';
import { palette } from '../src/theme';
import { useAccent } from '../src/theme-context';
import PageHeader from '../src/components/PageHeader';
import ShareContactSheet from '../src/components/ShareContactSheet';
import { errorMessage } from '../src/api/client';
import { formatDateTime } from '../src/hooks';
import {
  BackupResult,
  PhonebookContact,
  PhonebookError,
  PhonebookSummary,
  Progress,
  RestoreRequest,
  RestoreResult,
  Supervisor,
  TeamUser,
  approveRestoreRequest,
  CONSENT_REQUIRED,
  backupContacts,
  cancelRestoreRequest,
  createRestoreRequest,
  deleteContact,
  fetchContacts,
  fetchMyRestoreRequest,
  fetchRestoreRequests,
  fetchSummary,
  fetchSupervisors,
  fetchTeamContacts,
  fetchTeamUsers,
  rejectRestoreRequest,
  restoreContacts,
  supervisorAsContact,
} from '../src/phonebook';
import { useAuth } from '../src/auth/AuthContext';
import { Consent, ContactsDisclosureModal, getConsent, setConsent } from '../src/phonebookConsent';

type Scope = 'mine' | 'supervisors' | 'team' | 'requests';

const PAGE = 50;
const TINTS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444', '#14b8a6'];
const GREEN = '#16a34a';

const initial = (name: string) => (name.trim()[0] || '?').toUpperCase();
function colorFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function leftLabel(seconds: number): string {
  if (seconds <= 0) return 'expired';
  const m = Math.ceil(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min left` : `${m} min left`;
}

const roleLabel = (r: string | null | undefined) => String(r || 'staff').replace(/_/g, ' ');

function backupMessage(r: BackupResult): string {
  if (r.sent === 0) {
    return r.deviceTotal === 0
      ? 'There are no contacts on this phone. Your existing backup was not changed.'
      : 'None of the contacts on this phone have a phone number. Your existing backup was not changed.';
  }
  const parts = [`${r.inserted} new`, `${r.updated} updated`, `${r.unchanged} already backed up`];
  let msg = `Backed up ${r.sent} contact${r.sent === 1 ? '' : 's'} (${parts.join(', ')}).`;
  if (r.noNumber) msg += ` ${r.noNumber} without a phone number ${r.noNumber === 1 ? 'was' : 'were'} skipped.`;
  if (r.skippedDeleted) msg += ` ${r.skippedDeleted} you removed earlier stayed removed.`;
  return msg;
}

function restoreMessage(r: RestoreResult): string {
  if (r.total === 0) return 'Your backup is empty — nothing to restore.';
  let msg = `Added ${r.added} contact${r.added === 1 ? '' : 's'} to this phone.`;
  if (r.alreadyOnPhone) msg += ` ${r.alreadyOnPhone} ${r.alreadyOnPhone === 1 ? 'was' : 'were'} already on the phone.`;
  if (r.failed) msg += ` ${r.failed} could not be added — you can try again while the approval is valid.`;
  return msg;
}

// ───────────────────────────── approval steps ─────────────────────────────

function Steps({ req }: { req: RestoreRequest }) {
  const rows: { label: string; approved: boolean; by: string | null }[] = [];
  if (req.approvals.super.required) {
    rows.push({ label: 'Superadmin', approved: req.approvals.super.approved, by: req.approvals.super.by });
  }
  rows.push({ label: 'Any one admin', approved: req.approvals.admin.approved, by: req.approvals.admin.by });
  return (
    <View style={{ gap: 6 }}>
      {rows.map((r) => (
        <View key={r.label} style={s.stepRow}>
          {r.approved ? <CircleCheck size={16} color={GREEN} /> : <CircleDashed size={16} color={palette.mutedLight} />}
          <Text style={[s.stepText, r.approved ? { color: GREEN } : null]}>
            {r.label}
            {r.approved ? ` — approved by ${r.by ?? 'admin'}` : ' — waiting'}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ───────────────────────────── one request (admin view) ─────────────────────────────

function RequestCard({
  req,
  accent,
  onApprove,
  onReject,
}: {
  req: RestoreRequest;
  accent: string;
  onApprove: (r: RestoreRequest) => void;
  onReject: (r: RestoreRequest, reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const pending = req.status === 'pending';

  const statusText: Record<RestoreRequest['status'], string> = {
    pending: 'Waiting for approval',
    approved: 'Approved — not restored yet',
    used: 'Restored',
    rejected: req.rejected ? `Rejected by ${req.rejected.by ?? 'admin'}` : 'Rejected',
    cancelled: 'Cancelled by the requester',
    expired: 'Expired',
  };
  const statusColor =
    req.status === 'rejected' ? palette.danger : req.status === 'used' || req.status === 'approved' ? GREEN : palette.muted;

  return (
    <View style={s.reqCard}>
      <View style={s.reqTop}>
        <View style={[s.avatar, { backgroundColor: colorFor(req.requester.name) }]}>
          <Text style={s.avatarText}>{initial(req.requester.name)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={1}>
            {req.requester.name}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            {roleLabel(req.requester.role)} · {req.requester.email ?? ''}
          </Text>
        </View>
        <Text style={s.when}>{timeAgo(req.created_at)}</Text>
      </View>

      <Text style={s.reqLine}>
        Wants to restore <Text style={s.bold}>{req.contact_count} contacts</Text>
        {req.device ? ` on ${req.device}` : ''}
      </Text>
      {req.note ? <Text style={s.reqNote}>“{req.note}”</Text> : null}
      <Text style={s.meta}>Requested {formatDateTime(req.created_at)}</Text>

      <View style={s.divider} />
      <Steps req={req} />

      {!pending ? <Text style={[s.statusLine, { color: statusColor }]}>{statusText[req.status]}</Text> : null}
      {req.rejected?.reason ? <Text style={s.meta}>Reason: {req.rejected.reason}</Text> : null}

      {pending && (req.my_action || req.can_reject) ? (
        rejecting ? (
          <View style={{ marginTop: 10, gap: 8 }}>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Reason (optional)"
              placeholderTextColor={palette.mutedLight}
              style={s.reasonInput}
              maxLength={300}
            />
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.btn, s.btnOutline, { borderColor: palette.danger }]} onPress={() => setRejecting(false)}>
                <Text style={[s.btnText, { color: palette.muted }]}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { backgroundColor: palette.danger }]} onPress={() => onReject(req, reason)}>
                <Text style={s.btnText}>Confirm reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[s.btnRow, { marginTop: 12 }]}>
            {req.can_reject ? (
              <TouchableOpacity style={[s.btn, s.btnOutline, { borderColor: palette.danger }]} onPress={() => setRejecting(true)}>
                <CircleX size={16} color={palette.danger} />
                <Text style={[s.btnText, { color: palette.danger }]}>Reject</Text>
              </TouchableOpacity>
            ) : null}
            {req.my_action === 'approve' ? (
              <TouchableOpacity style={[s.btn, { backgroundColor: GREEN }]} onPress={() => onApprove(req)}>
                <CircleCheck size={16} color="#fff" />
                <Text style={s.btnText}>Approve</Text>
              </TouchableOpacity>
            ) : (
              <View style={[s.btn, { backgroundColor: palette.borderSubtle }]}>
                <Text style={[s.btnText, { color: palette.muted }]}>You already approved</Text>
              </View>
            )}
          </View>
        )
      ) : null}
      {pending && !req.my_action && !req.can_reject ? (
        <Text style={[s.meta, { marginTop: 8 }]}>View only — you cannot approve requests.</Text>
      ) : null}
    </View>
  );
}

// ───────────────────────────── the screen ─────────────────────────────

export default function PhonebookScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const { user } = useAuth();

  const [summary, setSummary] = useState<PhonebookSummary | null>(null);
  const [contacts, setContacts] = useState<PhonebookContact[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shareTarget, setShareTarget] = useState<PhonebookContact[]>([]);
  // multi-select: ids picked for sharing (empty = normal mode)
  const [selected, setSelected] = useState<number[]>([]);
  const selecting = selected.length > 0;
  // picked contacts are remembered whole, so a new search while selecting does not lose them
  const pickedRef = useRef(new Map<number, PhonebookContact>());
  const [scope, setScope] = useState<Scope>('mine');
  const [supervisors, setSupervisors] = useState<Supervisor[] | null>(null);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [teamUserId, setTeamUserId] = useState<number | null>(null);
  const [requests, setRequests] = useState<{ open: RestoreRequest[]; history: RestoreRequest[] } | null>(null);
  const isAdmin = !!summary?.is_admin;
  const canViewTeam = !!summary?.can_view_team;
  const team = scope === 'team';

  // my restore request
  const [myReq, setMyReq] = useState<RestoreRequest | null>(null);
  const [myReqFetchedAt, setMyReqFetchedAt] = useState(0);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const [, setTick] = useState(0); // re-render for the countdown

  const [busy, setBusy] = useState<null | 'backup' | 'restore'>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  // Google Play Prominent Disclosure: nothing is read or uploaded until the user has agreed (src/phonebookConsent.tsx)
  const [consent, setConsentState] = useState<Consent>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  useEffect(() => {
    if (user?.id) void getConsent(Number(user.id)).then(setConsentState);
  }, [user?.id]);

  const mounted = useRef(true);
  const requestId = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // ── list loading (my / team) ──
  const load = useCallback(
    async (q: string, offset: number, mode: 'replace' | 'append', sc: Scope, uid: number | null) => {
      if (sc === 'requests') return;
      const id = ++requestId.current;
      try {
        const page =
          sc === 'team'
            ? await fetchTeamContacts({ userId: uid, q, limit: PAGE, offset })
            : await fetchContacts({ q, limit: PAGE, offset, sort: 'name' });
        if (!mounted.current || id !== requestId.current) return;
        setContacts((prev) => (mode === 'append' ? [...prev, ...page.contacts] : page.contacts));
        setTotal(page.total);
        setHasMore(page.has_more);
        setError(null);
      } catch (err) {
        if (!mounted.current || id !== requestId.current) return;
        setError(errorMessage(err, 'Could not load your phone book.'));
      } finally {
        if (mounted.current && id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  const loadSummary = useCallback(async () => {
    try {
      const sm = await fetchSummary();
      if (mounted.current) setSummary(sm);
      return sm;
    } catch {
      return null;
    }
  }, []);

  const loadMyRequest = useCallback(async () => {
    try {
      const r = await fetchMyRestoreRequest();
      if (!mounted.current) return;
      setMyReq(r);
      setMyReqFetchedAt(Date.now());
    } catch {
      /* keep what we have */
    }
  }, []);

  const loadRequests = useCallback(async () => {
    try {
      const r = await fetchRestoreRequests();
      if (mounted.current) {
        setRequests(r);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(errorMessage(err, 'Could not load restore requests.'));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadSupervisors = useCallback(async () => {
    try {
      const list = await fetchSupervisors();
      if (mounted.current) {
        setSupervisors(list);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(errorMessage(err, 'Could not load the supervisors.'));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadTeamUsers = useCallback(async () => {
    try {
      const u = await fetchTeamUsers();
      if (mounted.current) setTeamUsers(u);
    } catch {
      /* the list's own error state covers a dead connection */
    }
  }, []);

  // search is debounced so typing does not fire a request per keystroke
  useEffect(() => {
    if (scope === 'requests' || scope === 'supervisors') return;
    const t = setTimeout(() => void load(query.trim(), 0, 'replace', scope, teamUserId), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, scope, teamUserId, load]);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      loadSummary(),
      scope === 'requests'
        ? loadRequests()
        : scope === 'supervisors'
          ? loadSupervisors()
          : load(query.trim(), 0, 'replace', scope, teamUserId),
      scope === 'team' ? loadTeamUsers() : Promise.resolve(),
      loadMyRequest(),
    ]);
  }, [loadSummary, loadRequests, loadSupervisors, load, loadTeamUsers, loadMyRequest, query, scope, teamUserId]);

  const switchScope = (next: Scope) => {
    if (next === scope) return;
    setContacts([]);
    setHasMore(false);
    setError(null);
    setLoading(true);
    setTeamUserId(null);
    setQuery('');
    setScope(next);
    if (next === 'team') void loadTeamUsers();
    if (next === 'requests') void loadRequests();
    if (next === 'supervisors') void loadSupervisors();
  };

  // first load
  useEffect(() => {
    void loadSummary();
    void loadMyRequest();
    // once per open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep the request status fresh while it can change (someone may approve at any moment)
  const myActive = myReq && (myReq.status === 'pending' || myReq.status === 'approved');
  useEffect(() => {
    if (scope !== 'mine' || !myActive) return;
    const poll = setInterval(() => void loadMyRequest(), 6000);
    const tick = setInterval(() => setTick((n) => n + 1), 30000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void loadMyRequest());
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      sub.remove();
    };
  }, [scope, myActive, loadMyRequest]);

  // approvers: keep the open list fresh while looking at it
  useEffect(() => {
    if (scope !== 'requests') return;
    const poll = setInterval(() => {
      void loadRequests();
      void loadSummary();
    }, 8000);
    return () => clearInterval(poll);
  }, [scope, loadRequests, loadSummary]);

  // ── back up ──
  const runBackup = useCallback(async (justAgreed = false) => {
    if (!justAgreed && consent !== 'granted') {
      setConsentOpen(true); // show the disclosure first; "Agree" then starts the backup
      return;
    }
    setBusy('backup');
    setProgress(null);
    setNotice(null);
    try {
      const r = await backupContacts((p) => mounted.current && setProgress(p), user?.id ? Number(user.id) : undefined);
      if (!mounted.current) return;
      setNotice({ kind: 'ok', text: backupMessage(r) });
      await reloadAll();
    } catch (err) {
      if (!mounted.current) return;
      if (err instanceof PhonebookError && err.message === CONSENT_REQUIRED) {
        setConsentOpen(true);
        return;
      }
      setNotice({
        kind: 'error',
        text: err instanceof PhonebookError ? err.message : errorMessage(err, 'Could not back up contacts.'),
      });
    } finally {
      if (mounted.current) {
        setBusy(null);
        setProgress(null);
      }
    }
  }, [reloadAll, user?.id, consent]);

  const answerConsent = async (choice: 'granted' | 'declined') => {
    // saved BEFORE the backup starts: backupContacts() re-reads the stored choice and refuses without it
    if (user?.id) await setConsent(Number(user.id), choice);
    setConsentState(choice);
    setConsentOpen(false);
    if (choice === 'granted') void runBackup(true);
  };
  const stopBackup = () =>
    Alert.alert(
      'Stop backing up your contacts?',
      "SoWash will stop reading and uploading your phone's contacts. What is already saved stays in your backup until an administrator removes it.",
      [
        { text: 'Keep backing up', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () => {
            if (user?.id) void setConsent(Number(user.id), 'declined');
            setConsentState('declined');
          },
        },
      ],
    );

  // ── restore request ──
  const sendRequest = async () => {
    if ((summary?.total ?? total) === 0) {
      setNotice({ kind: 'error', text: 'Your backup is empty — there is nothing to restore yet.' });
      return;
    }
    setSending(true);
    setNotice(null);
    try {
      const r = await createRestoreRequest(reason);
      if (!mounted.current) return;
      setMyReq(r);
      setMyReqFetchedAt(Date.now());
      setReason('');
    } catch (err) {
      if (mounted.current) setNotice({ kind: 'error', text: errorMessage(err, 'Could not send the request.') });
    } finally {
      if (mounted.current) setSending(false);
    }
  };

  const cancelRequest = () => {
    if (!myReq) return;
    Alert.alert('Cancel this request?', 'The approvers will no longer see it.', [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelRestoreRequest(myReq.id);
            if (mounted.current) setMyReq(null);
          } catch (err) {
            Alert.alert('Could not cancel', errorMessage(err));
          }
        },
      },
    ]);
  };

  const runRestore = useCallback(async () => {
    if (!myReq) return;
    setBusy('restore');
    setProgress(null);
    setNotice(null);
    try {
      const r = await restoreContacts(myReq.id, (p) => mounted.current && setProgress(p));
      if (mounted.current) setNotice({ kind: 'ok', text: restoreMessage(r) });
    } catch (err) {
      if (mounted.current) {
        setNotice({
          kind: 'error',
          text: err instanceof PhonebookError ? err.message : errorMessage(err, 'Could not restore contacts.'),
        });
      }
    } finally {
      if (mounted.current) {
        setBusy(null);
        setProgress(null);
        void loadMyRequest();
      }
    }
  }, [myReq, loadMyRequest]);

  const confirmRestore = () => {
    const n = myReq?.contact_count ?? 0;
    Alert.alert(
      'Restore contacts to this phone?',
      `${n} contact${n === 1 ? '' : 's'} from your backup will be added to this phone. Contacts already here are skipped — nothing is changed or deleted. This approval can be used once.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restore now', onPress: () => void runRestore() },
      ],
    );
  };

  // ── approvers ──
  const doApprove = (r: RestoreRequest) => {
    Alert.alert(
      'Approve this restore?',
      `${r.requester.name} (${roleLabel(r.requester.role)}) will be able to copy ${r.contact_count} backed-up contacts onto ${r.device ?? 'a phone'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            try {
              await approveRestoreRequest(r.id);
            } catch (err) {
              Alert.alert('Could not approve', errorMessage(err));
            }
            void loadRequests();
            void loadSummary();
          },
        },
      ],
    );
  };

  const doReject = async (r: RestoreRequest, why: string) => {
    try {
      await rejectRestoreRequest(r.id, why);
    } catch (err) {
      Alert.alert('Could not reject', errorMessage(err));
    }
    void loadRequests();
    void loadSummary();
  };

  // ── per-contact actions ──
  const toggleSelect = (c: PhonebookContact) => {
    pickedRef.current.set(c.id, c);
    setSelected((prev) => (prev.includes(c.id) ? prev.filter((x) => x !== c.id) : prev.length >= 20 ? prev : [...prev, c.id]));
  };

  const contactMenu = (c: PhonebookContact) => {
    Alert.alert(c.display_name, undefined, [
      { text: 'Select to share', onPress: () => toggleSelect(c) },
      { text: 'Remove from backup', style: 'destructive', onPress: () => confirmRemove(c) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmRemove = (c: PhonebookContact) => {
    Alert.alert(
      'Remove from backup?',
      `${c.display_name} will be removed from your backup and will not be added back by later backups. It stays on this phone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteContact(c.id);
              setContacts((prev) => prev.filter((x) => x.id !== c.id));
              setTotal((t) => Math.max(0, t - 1));
              void loadSummary();
            } catch (err) {
              Alert.alert('Could not remove', errorMessage(err));
            }
          },
        },
      ],
    );
  };

  const call = (number: string) => {
    void Linking.openURL(`tel:${number.replace(/[^\d+*#]/g, '')}`).catch(() => {});
  };

  const pct = progress && progress.total > 0 ? Math.min(1, progress.done / progress.total) : 0;
  const subtitle = useMemo(() => {
    const n = summary?.total ?? total;
    if (scope === 'supervisors') return `Supervisors${supervisors ? ` · ${supervisors.length}` : ''}`;
    if (scope === 'requests') return `Restore requests${summary?.pending_requests ? ` · ${summary.pending_requests} for you` : ''}`;
    return team ? `Team · ${total} contact${total === 1 ? '' : 's'}` : `${n} contact${n === 1 ? '' : 's'} backed up`;
  }, [summary, total, team, scope, supervisors]);

  const secondsLeft = myReq?.window_seconds_left != null
    ? Math.max(0, myReq.window_seconds_left - Math.round((Date.now() - myReqFetchedAt) / 1000))
    : 0;

  // ───────────── header parts ─────────────

  const segments = (
    // every staff member sees Mine + Supervisors; Team is the superadmin's, Requests the approvers'
    // (the server enforces all of it)

    <View style={s.segment}>
      {(['mine', 'supervisors', 'team', 'requests'] as const)
        .filter((k) => (k !== 'team' || canViewTeam) && (k !== 'requests' || isAdmin))
        .map((k) => {
        const badge = k === 'requests' ? summary?.pending_requests ?? 0 : 0;
        return (
          <TouchableOpacity
            key={k}
            style={[s.segBtn, scope === k ? { backgroundColor: accent } : null]}
            activeOpacity={0.85}
            onPress={() => switchScope(k)}
          >
            {k === 'team' ? <Users size={14} color={scope === k ? '#fff' : palette.muted} /> : null}
            {k === 'requests' ? <ShieldCheck size={14} color={scope === k ? '#fff' : palette.muted} /> : null}
            <Text style={[s.segText, scope === k ? { color: '#fff' } : null]} numberOfLines={1}>
              {k === 'mine' ? 'Mine' : k === 'supervisors' ? 'Supervisors' : k === 'team' ? 'Team' : 'Requests'}
            </Text>
            {badge > 0 ? (
              <View style={s.segBadge}>
                <Text style={s.segBadgeText}>{badge}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const restoreCard = (() => {
    if (myReq?.status === 'approved') {
      return (
        <View style={[s.inner, { borderColor: GREEN }]}>
          <View style={s.innerHead}>
            <CircleCheck size={18} color={GREEN} />
            <Text style={[s.innerTitle, { color: GREEN }]}>Restore approved</Text>
          </View>
          <Text style={s.innerBody}>
            Both approvals are in. Tap Restore now to add {myReq.contact_count} contacts to this phone.{' '}
            <Text style={s.bold}>{leftLabel(secondsLeft)}.</Text>
          </Text>
          <Steps req={myReq} />
          <View style={[s.btnRow, { marginTop: 12 }]}>
            <TouchableOpacity style={[s.btn, s.btnOutline, { borderColor: palette.border }]} disabled={!!busy} onPress={cancelRequest}>
              <Text style={[s.btnText, { color: palette.muted }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.btn, { backgroundColor: GREEN }, busy || secondsLeft <= 0 ? s.btnOff : null]}
              disabled={!!busy || secondsLeft <= 0}
              onPress={confirmRestore}
            >
              {busy === 'restore' ? <ActivityIndicator size="small" color="#fff" /> : <CloudDownload size={17} color="#fff" />}
              <Text style={s.btnText}>Restore now</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    if (myReq?.status === 'pending') {
      return (
        <View style={s.inner}>
          <View style={s.innerHead}>
            <Clock size={18} color={accent} />
            <Text style={s.innerTitle}>Waiting for approval</Text>
          </View>
          <Text style={s.innerBody}>
            Sent {timeAgo(myReq.created_at)}. The superadmin and one admin must approve. You will get a notification
            the moment it is approved.
          </Text>
          <Steps req={myReq} />
          <TouchableOpacity style={{ marginTop: 10 }} onPress={cancelRequest}>
            <Text style={[s.link, { color: palette.danger }]}>Cancel request</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={s.inner}>
        {myReq?.status === 'rejected' ? (
          <View style={[s.notice, s.noticeError, { marginBottom: 10 }]}>
            <Text style={[s.noticeText, { color: palette.danger }]}>
              Rejected{myReq.rejected?.by ? ` by ${myReq.rejected.by}` : ''}
              {myReq.rejected?.reason ? `: ${myReq.rejected.reason}` : '.'}
            </Text>
          </View>
        ) : null}
        <View style={s.innerHead}>
          <CloudDownload size={18} color={accent} />
          <Text style={s.innerTitle}>Restore to a new phone</Text>
        </View>
        <Text style={s.innerBody}>
          Copying your backup onto a phone needs approval from the superadmin and one admin.
        </Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Why do you need it? (e.g. new phone) — optional"
          placeholderTextColor={palette.mutedLight}
          style={s.reasonInput}
          maxLength={300}
        />
        <TouchableOpacity
          style={[s.btn, { backgroundColor: accent, marginTop: 10 }, sending || busy ? s.btnOff : null]}
          disabled={sending || !!busy}
          onPress={sendRequest}
        >
          {sending ? <ActivityIndicator size="small" color="#fff" /> : <ShieldCheck size={17} color="#fff" />}
          <Text style={s.btnText}>{myReq?.status === 'rejected' ? 'Request again' : 'Request restore'}</Text>
        </TouchableOpacity>
      </View>
    );
  })();

  const mineCard = (
    <View>
      <View style={s.card}>
        <View style={s.statusRow}>
          <View style={[s.statusIcon, { backgroundColor: `${accent}14` }]}>
            <ShieldCheck size={18} color={accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.statusTitle}>
              {summary?.last_synced_at ? `Last backed up ${formatDateTime(summary.last_synced_at)}` : 'Not backed up yet'}
            </Text>
            <Text style={s.statusSub}>
              {consent === 'granted'
                ? 'Backed up automatically whenever you open the app.'
                : 'Automatic backup is off. Tap “Back up now” to review what is collected and turn it on.'}
              {summary?.last_device_count != null ? ` ${summary.last_device_count} contacts were on the phone.` : ''}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[s.btn, s.btnOutline, { borderColor: accent, marginTop: 12 }, busy ? s.btnOff : null]}
          activeOpacity={0.85}
          disabled={!!busy}
          onPress={() => void runBackup()}
        >
          {busy === 'backup' ? <ActivityIndicator size="small" color={accent} /> : <CloudUpload size={17} color={accent} />}
          <Text style={[s.btnText, { color: accent }]}>Back up now</Text>
        </TouchableOpacity>
        {consent === 'granted' ? (
          <TouchableOpacity onPress={stopBackup} style={{ alignSelf: 'center', marginTop: 10 }} hitSlop={8}>
            <Text style={[s.statusSub, { textDecorationLine: 'underline' }]}>Stop backing up my contacts</Text>
          </TouchableOpacity>
        ) : null}

        {busy ? (
          <View style={{ marginTop: 12 }}>
            <Text style={s.progressLabel}>{progress?.label || 'Starting…'}</Text>
            <View style={s.track}>
              <View style={[s.fill, { width: `${Math.round(pct * 100)}%`, backgroundColor: accent }]} />
            </View>
          </View>
        ) : null}

        {notice ? (
          <View style={[s.notice, notice.kind === 'error' ? s.noticeError : s.noticeOk]}>
            <Text style={[s.noticeText, notice.kind === 'error' ? { color: palette.danger } : { color: palette.inkSoft }]}>
              {notice.text}
            </Text>
          </View>
        ) : null}

        <Text style={s.fineprint}>
          Only contacts with a phone number are saved. A contact missing from this phone is never deleted from your
          backup, and one you remove here stays removed. Your backup is visible to you and to SoWash administrators.
        </Text>
      </View>

      <View style={[s.card, { marginTop: 10 }]}>{restoreCard}</View>
    </View>
  );

  const teamHeader = (
    <View>
      <Text style={s.teamNote}>
        Read-only. These are the contacts staff have backed up. You can search and call, not change them.
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        <TouchableOpacity
          style={[s.chip, teamUserId === null ? { backgroundColor: accent, borderColor: accent } : null]}
          onPress={() => setTeamUserId(null)}
        >
          <Text style={[s.chipText, teamUserId === null ? { color: '#fff' } : null]}>Everyone</Text>
        </TouchableOpacity>
        {teamUsers.map((u) => (
          <TouchableOpacity
            key={u.id}
            style={[s.chip, teamUserId === u.id ? { backgroundColor: accent, borderColor: accent } : null]}
            onPress={() => setTeamUserId(u.id)}
          >
            <Text style={[s.chipText, teamUserId === u.id ? { color: '#fff' } : null]} numberOfLines={1}>
              {u.name} · {u.contact_count}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const searchBox = (
    <View style={s.searchWrap}>
      <Search size={16} color={palette.mutedLight} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name, company or number…"
        placeholderTextColor={palette.mutedLight}
        style={s.searchInput}
        autoCorrect={false}
      />
    </View>
  );

  const header = (
    <View>
      {segments}
      {scope === 'mine' ? mineCard : null}
      {scope === 'team' ? teamHeader : null}
      {scope !== 'requests' ? searchBox : null}
    </View>
  );

  // ───────────── requests list ─────────────

  type Row = { key: string; title?: string; req?: RestoreRequest };
  const requestRows: Row[] = useMemo(() => {
    if (!requests) return [];
    const rows: Row[] = [{ key: 'h-open', title: `Waiting for approval (${requests.open.length})` }];
    rows.push(...requests.open.map((r) => ({ key: `r${r.id}`, req: r })));
    if (requests.open.length === 0) rows.push({ key: 'none', title: 'No requests are waiting.' });
    if (requests.history.length) {
      rows.push({ key: 'h-hist', title: 'Last 7 days' });
      rows.push(...requests.history.map((r) => ({ key: `r${r.id}`, req: r })));
    }
    return rows;
  }, [requests]);

  const supervisorRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = supervisors ?? [];
    if (!needle) return list;
    const digits = needle.replace(/\D/g, '');
    return list.filter(
      (sv) => sv.name.toLowerCase().includes(needle) || (digits.length > 2 && (sv.phone ?? '').replace(/\D/g, '').includes(digits)),
    );
  }, [supervisors, query]);

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      tintColor={accent}
      onRefresh={() => {
        setRefreshing(true);
        void reloadAll();
      }}
    />
  );

  return (
    <View style={s.screen}>
      <ContactsDisclosureModal visible={consentOpen} onAgree={() => void answerConsent('granted')} onDecline={() => void answerConsent('declined')} />
      <PageHeader title="Phone Book" subtitle={subtitle} onBack={() => router.back()} />
      <ShareContactSheet
        contacts={shareTarget}
        accent={accent}
        onClose={() => setShareTarget([])}
        onSent={() => setSelected([])}
      />

      {loading && contacts.length === 0 && !summary ? (
        <View style={s.centre}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : scope === 'supervisors' ? (
        <FlatList
          data={supervisorRows}
          keyExtractor={(sv) => String(sv.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
          ListHeaderComponent={
            <View>
              {segments}
              {searchBox}
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.row}>
              <View style={[s.avatar, { backgroundColor: colorFor(item.name) }]}>
                <Text style={s.avatarText}>{initial(item.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={s.meta} numberOfLines={1}>
                  Supervisor{item.team_type ? ` · ${item.team_type}` : ''}
                  {item.member_count ? ` · ${item.member_count + 1} in team` : ''}
                </Text>
                {item.phone ? (
                  <Text style={s.number} numberOfLines={1}>
                    {item.phone}
                  </Text>
                ) : (
                  <Text style={s.meta}>No number on file</Text>
                )}
              </View>
              {item.phone ? (
                <>
                  <TouchableOpacity
                    style={[s.callBtn, { backgroundColor: `${accent}14` }]}
                    onPress={() => setShareTarget([supervisorAsContact(item)])}
                    hitSlop={8}
                    accessibilityLabel={`Send ${item.name} to a chat`}
                  >
                    <Send size={17} color={accent} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.callBtn, { backgroundColor: `${accent}14` }]}
                    onPress={() => call(item.phone as string)}
                    hitSlop={8}
                    accessibilityLabel={`Call ${item.name}`}
                  >
                    <Phone size={17} color={accent} />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            error ? (
              <View style={s.empty}>
                <CircleAlert size={22} color={palette.danger} />
                <Text style={s.emptyBody}>{error}</Text>
              </View>
            ) : supervisors ? (
              <View style={s.empty}>
                <Phone size={22} color={palette.mutedLight} />
                <Text style={s.emptyTitle}>{query ? 'No matches' : 'No supervisors yet'}</Text>
              </View>
            ) : (
              <ActivityIndicator style={{ marginTop: 30 }} color={accent} />
            )
          }
        />
      ) : scope === 'requests' ? (
        <FlatList
          data={requestRows}
          keyExtractor={(r) => r.key}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={segments}
          refreshControl={refreshControl}
          renderItem={({ item }) =>
            item.req ? (
              <RequestCard req={item.req} accent={accent} onApprove={doApprove} onReject={doReject} />
            ) : (
              <Text style={s.sectionTitle}>{item.title}</Text>
            )
          }
          ListEmptyComponent={
            error ? (
              <View style={s.empty}>
                <CircleAlert size={22} color={palette.danger} />
                <Text style={s.emptyBody}>{error}</Text>
              </View>
            ) : (
              <ActivityIndicator style={{ marginTop: 30 }} color={accent} />
            )
          }
        />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={[s.list, selecting ? { paddingBottom: 110 } : null]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          extraData={selected}
          ListHeaderComponent={header}
          refreshControl={refreshControl}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!hasMore || loadingMore || loading) return;
            setLoadingMore(true);
            void load(query.trim(), contacts.length, 'append', scope, teamUserId);
          }}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 14 }} color={accent} /> : null}
          initialNumToRender={14}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => {
            const first = item.phones[0]?.number;
            const sub = [item.company, item.job_title].filter(Boolean).join(' · ');
            return (
              <TouchableOpacity
                style={[s.row, selected.includes(item.id) ? { borderColor: accent, borderWidth: 2 } : null]}
                activeOpacity={0.85}
                onPress={selecting && !team ? () => toggleSelect(item) : undefined}
                onLongPress={team ? undefined : () => (selecting ? toggleSelect(item) : contactMenu(item))}
                delayLongPress={350}
              >
                <View style={[s.avatar, { backgroundColor: colorFor(item.display_name) }]}>
                  <Text style={s.avatarText}>{initial(item.display_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                  {sub ? (
                    <Text style={s.meta} numberOfLines={1}>
                      {sub}
                    </Text>
                  ) : null}
                  {item.phones.slice(0, 2).map((p, i) => (
                    <Text key={`${p.number}-${i}`} style={s.number} numberOfLines={1}>
                      {p.number}
                      <Text style={s.label}>{`  ${p.label}`}</Text>
                    </Text>
                  ))}
                  {item.phones.length > 2 ? <Text style={s.meta}>+{item.phones.length - 2} more</Text> : null}
                  {team && item.owner_name ? (
                    <Text style={[s.owner, { color: accent }]} numberOfLines={1}>
                      Saved by {item.owner_name}
                    </Text>
                  ) : null}
                </View>
                {!team && !selecting ? (
                  <TouchableOpacity
                    style={[s.callBtn, { backgroundColor: `${accent}14` }]}
                    onPress={() => setShareTarget([item])}
                    hitSlop={8}
                    accessibilityLabel={`Send ${item.display_name} to a chat`}
                  >
                    <Send size={17} color={accent} />
                  </TouchableOpacity>
                ) : null}
                {selecting && !team ? (
                  <View
                    style={[
                      s.check,
                      selected.includes(item.id) ? { backgroundColor: accent, borderColor: accent } : null,
                    ]}
                  >
                    {selected.includes(item.id) ? <CircleCheck size={16} color="#fff" /> : null}
                  </View>
                ) : first ? (
                  <TouchableOpacity
                    style={[s.callBtn, { backgroundColor: `${accent}14` }]}
                    onPress={() => call(first)}
                    hitSlop={8}
                    accessibilityLabel={`Call ${item.display_name}`}
                  >
                    <Phone size={17} color={accent} />
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            loading ? (
              <View style={s.empty}>
                <ActivityIndicator color={accent} />
              </View>
            ) : error ? (
              <View style={s.empty}>
                <CircleAlert size={22} color={palette.danger} />
                <Text style={s.emptyTitle}>Could not load your phone book</Text>
                <Text style={s.emptyBody}>{error}</Text>
              </View>
            ) : (
              <View style={s.empty}>
                <Phone size={22} color={palette.mutedLight} />
                <Text style={s.emptyTitle}>{query ? 'No matches' : 'Nothing backed up yet'}</Text>
                <Text style={s.emptyBody}>
                  {query
                    ? 'Try a different search.'
                    : team
                      ? 'No staff member has backed up contacts yet.'
                      : 'Your contacts are saved automatically when you open the app. Tap “Back up now” to do it right away.'}
                </Text>
              </View>
            )
          }
        />
      )}

      {selecting && scope === 'mine' ? (
        <View style={s.selBar}>
          <Text style={s.selText}>{selected.length} selected</Text>
          <TouchableOpacity style={s.selCancel} onPress={() => setSelected([])}>
            <Text style={s.selCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.selSend, { backgroundColor: accent }]}
            onPress={() => setShareTarget(selected.map((id) => pickedRef.current.get(id)).filter((c): c is PhonebookContact => !!c))}
          >
            <Send size={16} color="#fff" />
            <Text style={s.selSendText}>Send to chat</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40, gap: 8 },
  bold: { fontWeight: '800', color: palette.ink },

  card: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
    padding: 14,
    marginBottom: 6,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 14, fontWeight: '800', color: palette.ink },
  statusSub: { fontSize: 12, fontWeight: '600', color: palette.muted, marginTop: 2, lineHeight: 17 },

  inner: { borderRadius: 14 },
  innerHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  innerTitle: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  innerBody: { fontSize: 12.5, fontWeight: '600', color: palette.muted, lineHeight: 18, marginBottom: 10 },
  link: { fontSize: 13, fontWeight: '800' },

  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepText: { fontSize: 12.5, fontWeight: '700', color: palette.muted, flex: 1 },

  btnRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 14,
    paddingVertical: 12,
  },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5 },
  btnOff: { opacity: 0.55 },
  btnText: { fontSize: 13.5, fontWeight: '800', color: '#fff' },

  reasonInput: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: palette.ink,
    backgroundColor: palette.bg,
  },

  progressLabel: { fontSize: 12, fontWeight: '700', color: palette.muted, marginBottom: 6 },
  track: { height: 7, borderRadius: 4, backgroundColor: palette.borderSubtle, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },

  notice: { marginTop: 12, borderRadius: 12, padding: 11, borderWidth: 1 },
  noticeOk: { backgroundColor: palette.bg, borderColor: palette.border },
  noticeError: { backgroundColor: palette.bg, borderColor: palette.danger },
  noticeText: { fontSize: 12.5, fontWeight: '600', lineHeight: 18 },

  fineprint: { fontSize: 11.5, color: palette.mutedLight, lineHeight: 16, marginTop: 12 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 14, color: palette.ink, padding: 0 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
  },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  name: { fontSize: 14.5, fontWeight: '800', color: palette.ink },
  meta: { fontSize: 11.5, fontWeight: '600', color: palette.mutedLight, marginTop: 2 },
  number: { fontSize: 12.5, fontWeight: '700', color: palette.inkSoft, marginTop: 3 },
  label: { fontSize: 11, fontWeight: '600', color: palette.mutedLight },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 10,
    elevation: 8,
  },
  selText: { flex: 1, fontSize: 14, fontWeight: '800', color: palette.ink, paddingLeft: 6 },
  selCancel: { paddingHorizontal: 12, paddingVertical: 10 },
  selCancelText: { fontSize: 14, fontWeight: '700', color: palette.muted },
  selSend: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 },
  selSendText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  callBtn: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  segment: {
    flexDirection: 'row',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 3,
    marginBottom: 10,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 11,
    paddingVertical: 9,
  },
  segText: { fontSize: 12.5, fontWeight: '800', color: palette.muted },
  segBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segBadgeText: { color: '#fff', fontSize: 10.5, fontWeight: '900' },

  teamNote: { fontSize: 12, fontWeight: '600', color: palette.muted, lineHeight: 17, marginBottom: 10 },
  chips: { gap: 8, paddingBottom: 10 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 220,
  },
  chipText: { fontSize: 12.5, fontWeight: '800', color: palette.inkSoft },
  owner: { fontSize: 11, fontWeight: '800', marginTop: 4 },

  sectionTitle: { fontSize: 12.5, fontWeight: '800', color: palette.muted, marginTop: 8, marginBottom: 2, paddingHorizontal: 2 },
  reqCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.borderSubtle,
    padding: 14,
    gap: 4,
  },
  reqTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  when: { fontSize: 11.5, fontWeight: '700', color: palette.mutedLight },
  reqLine: { fontSize: 13, fontWeight: '600', color: palette.inkSoft, lineHeight: 19 },
  reqNote: { fontSize: 12.5, fontStyle: 'italic', color: palette.muted, lineHeight: 18 },
  divider: { height: 1, backgroundColor: palette.borderSubtle, marginVertical: 8 },
  statusLine: { fontSize: 12.5, fontWeight: '800', marginTop: 8 },

  empty: { alignItems: 'center', gap: 6, marginTop: 40, paddingHorizontal: 28 },
  emptyTitle: { fontSize: 15.5, fontWeight: '800', color: palette.ink, marginTop: 6 },
  emptyBody: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 19 },
});
