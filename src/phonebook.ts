// src/phonebook.ts
//
// Staff Phone Book: back up the phone's contacts to the server and restore
// them onto a (new) phone. Backend: sowash-backend/routes/phonebookRoutes.js,
// mounted at /api/phonebook — read its header comment first, the rules below
// are the client half of the same design.
//
//   • BACK UP only ever ADDS/UPDATES on the server. A phone with fewer
//     contacts (a new handset) never removes anything from the backup.
//   • BACK UP runs AUTOMATICALLY while the staff app is in use (autoBackup(),
//     started from app/staff/_layout.tsx) — no tap, no dialog; the company phone
//     and SIM hold official contacts only. Android still shows its own one-time
//     "allow contacts" prompt, which no app can skip. It is cheap when nothing
//     changed (a fingerprint of the address book is kept per user).
//   • RESTORE needs APPROVAL: the superadmin and any one admin must approve a
//     request first (routes/phonebookRoutes.js "restore requests"); the server
//     only hands the contacts out for an approved request.
//   • RESTORE only ever ADDS to the phone. It never edits or deletes a contact
//     that is already there, and it skips any contact whose phone number is
//     already on the handset, so pressing it twice (or after a backup) cannot
//     create duplicates.
//   • The two sides recognise "the same contact" by phone number alone — the
//     last 10 digits — because the device's own contact ids differ on every
//     handset. phoneKey() below MUST stay identical to phoneKey() in
//     routes/phonebookRoutes.js.
//
// Native module: expo-contacts (READ_CONTACTS + WRITE_CONTACTS) — adding it
// needs a new EAS build. It is imported from 'expo-contacts/legacy' (the
// stable getContactsAsync/addContactAsync API in SDK 57).
//
// Staff only: nothing here is reachable from the client UI, and the OS
// permission is only asked when a staff user taps Back up / Restore.

import { Alert, Linking, Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';
import * as SecureStore from 'expo-secure-store';
import { api } from './api/client';

// ───────────────────────────── types ─────────────────────────────

export type PhonebookPhone = { label: string; number: string };
export type PhonebookEmail = { label: string; email: string };

export type PhonebookContact = {
  id: number;
  display_name: string;
  given_name: string | null;
  family_name: string | null;
  company: string | null;
  job_title: string | null;
  phones: PhonebookPhone[];
  emails: PhonebookEmail[];
  updated_at: string;
  /** Only on the admin Team view: whose backup this contact is in. */
  owner_id?: number;
  owner_name?: string;
};

export type PhonebookSummary = {
  total: number;
  last_synced_at: string | null;
  last_device_count: number | null;
  /** May view everyone's contacts (decided by the server). */
  is_admin?: boolean;
  /** superadmin only: may open the Team view (everyone's contacts) */
  can_view_team?: boolean;
  /** May approve / reject restore requests. */
  is_approver?: boolean;
  approver_role?: 'superadmin' | 'admin' | null;
  /** Requests waiting for THIS person's approval (badge). */
  pending_requests?: number;
};

export type RequestApproval = { required: boolean; approved: boolean; by: string | null; at: string | null };

/** One "restore my contacts" request and where it stands. */
export type RestoreRequest = {
  id: number;
  status: 'pending' | 'approved' | 'used' | 'rejected' | 'cancelled' | 'expired';
  note: string | null;
  device: string | null;
  contact_count: number;
  created_at: string;
  expires_at: string;
  requester: { id: number; name: string; email: string | null; role: string | null };
  approvals: { super: RequestApproval; admin: RequestApproval };
  rejected: { by: string | null; reason: string | null; at: string | null } | null;
  /** Seconds left to restore once approved. */
  window_seconds_left: number | null;
  used_at: string | null;
  /** 'approve' when THIS viewer's approval is the missing piece. */
  my_action: 'approve' | null;
  can_reject: boolean;
  can_restore: boolean;
};

/** One staff member in the admin Team view. */
export type TeamUser = {
  id: number;
  name: string;
  email: string | null;
  type: string | null;
  contact_count: number;
  last_synced_at: string | null;
};

export type BackupResult = {
  deviceTotal: number; // contacts on the phone
  sent: number; // of those, with at least one usable number
  inserted: number;
  updated: number;
  unchanged: number;
  skippedDeleted: number;
  noNumber: number;
};

export type RestoreResult = {
  total: number; // contacts in the backup
  added: number;
  alreadyOnPhone: number;
  failed: number;
};

export type Progress = { label: string; done: number; total: number };

/** Why a run could not start; the screen shows the message. */
export class PhonebookError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhonebookError';
  }
}

// ───────────────────────────── numbers ─────────────────────────────

/**
 * Identity of a phone number: its last 10 digits ("+92 300 1234567" and
 * "0300 1234567" are the same number). Text after an extension marker is
 * ignored; under 7 digits (short codes) has no identity.
 * MIRRORS routes/phonebookRoutes.js phoneKey().
 */
export function phoneKey(raw: string | null | undefined): string | null {
  const head = String(raw ?? '').split(/[xX;,#]/)[0];
  const digits = head.replace(/\D/g, '');
  return digits.length < 7 ? null : digits.slice(-10);
}

// ───────────────────────────── server calls ─────────────────────────────

export async function fetchSummary(): Promise<PhonebookSummary> {
  const { data } = await api.get<PhonebookSummary>('phonebook/summary');
  return data;
}

export async function fetchContacts(opts: {
  q?: string;
  limit?: number;
  offset?: number;
  sort?: 'name' | 'id';
}): Promise<{ contacts: PhonebookContact[]; total: number; has_more: boolean }> {
  const { data } = await api.get('phonebook/contacts', { params: opts });
  return data;
}

// ── restore requests ──

/** A short label for the phone, shown to the approvers ("samsung SM-A715F"). */
export function deviceLabel(): string {
  const c = (Platform.constants ?? {}) as { Brand?: string; Model?: string };
  return [c.Brand, c.Model].filter(Boolean).join(' ') || Platform.OS;
}

export async function fetchMyRestoreRequest(): Promise<RestoreRequest | null> {
  const { data } = await api.get<{ request: RestoreRequest | null }>('phonebook/restore-requests/mine');
  return data.request;
}

export async function createRestoreRequest(note?: string): Promise<RestoreRequest> {
  const { data } = await api.post<{ request: RestoreRequest }>('phonebook/restore-requests', {
    note: note?.trim() || undefined,
    device: deviceLabel(),
  });
  return data.request;
}

export async function cancelRestoreRequest(id: number): Promise<void> {
  await api.post(`phonebook/restore-requests/${id}/cancel`);
}

/** Approvers / viewing admins: what is waiting, and what was decided in the last 7 days. */
export async function fetchRestoreRequests(): Promise<{ open: RestoreRequest[]; history: RestoreRequest[] }> {
  const { data } = await api.get('phonebook/restore-requests');
  return data;
}

export async function approveRestoreRequest(id: number): Promise<RestoreRequest> {
  const { data } = await api.post<{ request: RestoreRequest }>(`phonebook/restore-requests/${id}/approve`);
  return data.request;
}

export async function rejectRestoreRequest(id: number, reason?: string): Promise<RestoreRequest> {
  const { data } = await api.post<{ request: RestoreRequest }>(`phonebook/restore-requests/${id}/reject`, {
    reason: reason?.trim() || undefined,
  });
  return data.request;
}

/** Admin only (server-enforced, read-only): every staff member who has a backup. */
export async function fetchTeamUsers(): Promise<TeamUser[]> {
  const { data } = await api.get<{ users: TeamUser[] }>('phonebook/admin/users');
  return data.users;
}

/** Admin only (server-enforced, read-only): all users' contacts, or one user's. */
export async function fetchTeamContacts(opts: {
  userId?: number | null;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ contacts: PhonebookContact[]; total: number; has_more: boolean }> {
  const { userId, ...rest } = opts;
  const { data } = await api.get('phonebook/admin/contacts', {
    params: { ...rest, ...(userId ? { user_id: userId } : {}) },
  });
  return data;
}

export async function deleteContact(id: number): Promise<void> {
  await api.delete(`phonebook/contacts/${id}`);
}

// ───────────────────────────── permission ─────────────────────────────

/**
 * Ask for contacts access (read AND write — the plugin declares both). Returns
 * normally when granted. When Android will no longer show the prompt ("don't
 * ask again") it offers Settings, which is the only place left to fix it — the
 * same lesson as the microphone permission.
 */
export async function ensureContactsPermission(interactive = true): Promise<void> {
  if (Platform.OS === 'web') throw new PhonebookError('The phone book works on the phone app only.');

  let perm = await Contacts.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Contacts.requestPermissionsAsync();
  if (perm.granted) return;

  if (!perm.canAskAgain && interactive) {
    Alert.alert(
      'Contacts access is off',
      'Allow Contacts for SoWash in your phone settings, then come back and try again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => void Linking.openSettings() },
      ],
    );
  }
  throw new PhonebookError('Contacts permission is needed to do this.');
}

/** True when access is ALREADY granted. Never shows a prompt (used for the quiet auto-backup). */
export async function contactsPermissionGranted(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return (await Contacts.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

// ───────────────────────────── reading the phone ─────────────────────────────

type DeviceContact = {
  name: string | null;
  given_name: string | null;
  family_name: string | null;
  company: string | null;
  job_title: string | null;
  phones: PhonebookPhone[];
  emails: PhonebookEmail[];
};

const READ_PAGE = 500;

async function readDeviceContacts(onProgress?: (p: Progress) => void): Promise<DeviceContact[]> {
  const out: DeviceContact[] = [];
  let offset = 0;
  for (;;) {
    const page = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.Name,
        Contacts.Fields.FirstName,
        Contacts.Fields.LastName,
        Contacts.Fields.Company,
        Contacts.Fields.JobTitle,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Emails,
      ],
      pageSize: READ_PAGE,
      pageOffset: offset,
    });
    for (const c of page.data) {
      out.push({
        name: c.name ?? null,
        given_name: c.firstName ?? null,
        family_name: c.lastName ?? null,
        company: c.company ?? null,
        job_title: c.jobTitle ?? null,
        phones: (c.phoneNumbers ?? [])
          .filter((p) => !!p.number)
          .map((p) => ({ label: p.label || 'other', number: p.number as string })),
        emails: (c.emails ?? [])
          .filter((e) => !!e.email)
          .map((e) => ({ label: e.label || 'other', email: e.email as string })),
      });
    }
    offset += page.data.length;
    onProgress?.({ label: 'Reading contacts from this phone…', done: offset, total: offset });
    if (!page.hasNextPage || page.data.length === 0) break;
  }
  return out;
}

// ───────────────────────────── one run at a time ─────────────────────────────

let running = false;

async function exclusive<T>(job: () => Promise<T>): Promise<T> {
  if (running) throw new PhonebookError('Another backup or restore is already running.');
  running = true;
  try {
    return await job();
  } finally {
    running = false;
  }
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ───────────────────────────── back up ─────────────────────────────

const UPLOAD_BATCH = 150; // keep each request small (server accepts 200)

/** FNV-1a over the usable contacts (order-independent): "did the address book change?" */
function fingerprint(list: DeviceContact[]): string {
  const lines = list
    .map((c) =>
      [
        c.name ?? '',
        c.company ?? '',
        c.job_title ?? '',
        c.phones.map((p) => `${p.label}:${p.number}`).sort().join(','),
        c.emails.map((e) => e.email).sort().join(','),
      ].join('|'),
    )
    .sort();
  let h = 0x811c9dc5;
  const text = lines.join('\n');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${list.length}`;
}

const fpKey = (userId: number) => `phonebookFp_${userId}`;
const AUTO_FULL_RESYNC_MS = 24 * 60 * 60 * 1000; // even if nothing changed, re-send once a day

async function readFp(userId: number): Promise<{ fp: string; at: number } | null> {
  try {
    const raw = await SecureStore.getItemAsync(fpKey(userId));
    if (!raw) return null;
    const [fp, at] = raw.split('@');
    return { fp, at: Number(at) || 0 };
  } catch {
    return null;
  }
}

async function writeFp(userId: number, fp: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(fpKey(userId), `${fp}@${Date.now()}`);
  } catch {
    /* losing it only means the next auto-backup uploads once more */
  }
}

/** Read the phone and upload what has a number. Caller holds the exclusive lock and the permission. */
async function backupCore(
  onProgress: (p: Progress) => void,
  skipIfUnchangedFor?: number,
): Promise<{ result: BackupResult; fp: string } | null> {
  const device = await readDeviceContacts(onProgress);
  const usable = device.filter((c) => c.phones.some((p) => phoneKey(p.number)));
  const fp = fingerprint(usable);

  if (skipIfUnchangedFor !== undefined) {
    const prev = await readFp(skipIfUnchangedFor);
    if (prev && prev.fp === fp && Date.now() - prev.at < AUTO_FULL_RESYNC_MS) return null; // nothing new
  }

  const result: BackupResult = {
    deviceTotal: device.length,
    sent: usable.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skippedDeleted: 0,
    noNumber: device.length - usable.length,
  };

  // An empty address book is never reported as a finished backup: it would
  // move "last backed up" without having saved anything.
  if (usable.length === 0) return { result, fp };

  for (let i = 0; i < usable.length; i += UPLOAD_BATCH) {
    const batch = usable.slice(i, i + UPLOAD_BATCH);
    const last = i + UPLOAD_BATCH >= usable.length;
    const { data } = await api.post('phonebook/sync', {
      contacts: batch,
      finished: last,
      device_count: device.length,
    });
    result.inserted += data.inserted ?? 0;
    result.updated += data.updated ?? 0;
    result.unchanged += data.unchanged ?? 0;
    result.skippedDeleted += data.skipped_deleted ?? 0;
    onProgress({
      label: 'Backing up contacts…',
      done: Math.min(i + UPLOAD_BATCH, usable.length),
      total: usable.length,
    });
  }
  if (skipIfUnchangedFor !== undefined) await writeFp(skipIfUnchangedFor, fp);
  return { result, fp };
}

/** The "Back up now" button: always uploads, and shows the result. */
export function backupContacts(onProgress: (p: Progress) => void, userId?: number): Promise<BackupResult> {
  return exclusive(async () => {
    await ensureContactsPermission();
    const out = (await backupCore(onProgress)) as { result: BackupResult; fp: string };
    // remember it so the automatic backup does not repeat the same upload
    if (userId !== undefined && out.result.sent > 0) await writeFp(userId, out.fp);
    return out.result;
  });
}

// Automatic backup. Called when the staff app opens and when it returns to the
// foreground. Never shows a dialog and never throws: if something is not
// possible (permission refused, offline, a restore running) it simply does not
// run and tries again later.
const AUTO_MIN_GAP_MS = 20 * 60 * 1000;
let lastAutoAt = 0;
let askedThisSession = false;

export async function autoBackup(userId: number): Promise<void> {
  if (Platform.OS === 'web') return;
  if (Date.now() - lastAutoAt < AUTO_MIN_GAP_MS) return;
  lastAutoAt = Date.now();
  try {
    let perm = await Contacts.getPermissionsAsync();
    if (!perm.granted) {
      // Ask the OS at most once per app launch, and never again once Android says "don't ask again".
      if (!perm.canAskAgain || askedThisSession) return;
      askedThisSession = true;
      perm = await Contacts.requestPermissionsAsync();
      if (!perm.granted) return;
    }
    await exclusive(() => backupCore(() => {}, userId));
  } catch (err) {
    if (__DEV__) console.warn('[phonebook] auto backup skipped:', err);
  }
}

// ───────────────────────────── restore ─────────────────────────────

const RESTORE_PAGE = 300;

/** Needs an APPROVED request: the server refuses the contacts otherwise. */
export function restoreContacts(requestId: number, onProgress: (p: Progress) => void): Promise<RestoreResult> {
  return exclusive(async () => {
    await ensureContactsPermission();

    // Everything already on the phone, by number — what we must not add again.
    const device = await readDeviceContacts(onProgress);
    const have = new Set<string>();
    for (const c of device) for (const p of c.phones) {
      const k = phoneKey(p.number);
      if (k) have.add(k);
    }

    const result: RestoreResult = { total: 0, added: 0, alreadyOnPhone: 0, failed: 0 };
    let offset = 0;
    let handled = 0;

    for (;;) {
      const { data: page } = await api.get<{ contacts: PhonebookContact[]; total: number; has_more: boolean }>(
        `phonebook/restore-requests/${requestId}/contacts`,
        { params: { limit: RESTORE_PAGE, offset } },
      );
      result.total = page.total;

      for (const c of page.contacts) {
        handled++;
        const keys = c.phones.map((p) => phoneKey(p.number)).filter((k): k is string => !!k);
        if (keys.some((k) => have.has(k))) {
          result.alreadyOnPhone++;
        } else {
          try {
            const hasParts = !!(c.given_name || c.family_name);
            await Contacts.addContactAsync({
              contactType: Contacts.ContactTypes.Person,
              name: c.display_name,
              firstName: hasParts ? c.given_name || '' : c.display_name,
              lastName: hasParts ? c.family_name || '' : '',
              company: c.company || undefined,
              jobTitle: c.job_title || undefined,
              phoneNumbers: c.phones.map((p) => ({ label: p.label, number: p.number })),
              emails: c.emails.map((e) => ({ label: e.label, email: e.email })),
            });
            keys.forEach((k) => have.add(k));
            result.added++;
          } catch {
            result.failed++;
          }
        }
        if (handled % 8 === 0) {
          onProgress({ label: 'Restoring contacts to this phone…', done: handled, total: page.total });
          await tick(); // let the progress bar paint
        }
      }

      offset += page.contacts.length;
      if (!page.has_more || page.contacts.length === 0) break;
    }

    onProgress({ label: 'Restoring contacts to this phone…', done: result.total, total: result.total });
    // Single use: close the approval once everything went in. If some failed, leave it open so the
    // user can retry inside the window.
    if (result.failed === 0) {
      try {
        await api.post(`phonebook/restore-requests/${requestId}/complete`);
      } catch {
        /* the window simply runs out */
      }
    }
    return result;
  });
}

// ── share a contact into Team chat ──

/** The chat text for one contact. Plain text on purpose: readable in every build, and copy-able. */
export function contactShareText(c: PhonebookContact): string {
  const lines = ['Contact', c.display_name];
  const org = [c.company, c.job_title].filter(Boolean).join(' · ');
  if (org) lines.push(org);
  for (const p of c.phones) lines.push(p.label ? `${p.number} (${p.label})` : p.number);
  for (const e of c.emails) lines.push(e.email);
  return lines.join('\n');
}

/** Post the contact as a normal text message into an existing Team DM / group. Throws on failure. */
export async function shareContactToConversation(conversationId: number, c: PhonebookContact): Promise<void> {
  const form = new FormData();
  form.append('body', contactShareText(c));
  await api.post(`staff-chat/conversations/${conversationId}/messages`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

// ── supervisors (team leads from C&I Team Management) ──

export type Supervisor = {
  id: number;
  name: string;
  phone: string | null;
  team_type: string | null;
  member_count: number;
};

export async function fetchSupervisors(): Promise<Supervisor[]> {
  const { data } = await api.get('phonebook/supervisors');
  return data.supervisors ?? [];
}

/** A supervisor as a shareable contact (negative id: it is not one of the user's backed-up contacts). */
export function supervisorAsContact(sv: Supervisor): PhonebookContact {
  return {
    id: -sv.id,
    display_name: `${sv.name} (Supervisor)`,
    given_name: null,
    family_name: null,
    company: 'SoWash',
    job_title: 'Supervisor',
    phones: sv.phone ? [{ label: 'mobile', number: sv.phone }] : [],
    emails: [],
    updated_at: '',
  };
}
