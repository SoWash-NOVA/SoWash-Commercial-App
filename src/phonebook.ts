// src/phonebook.ts
//
// Staff Phone Book: back up the phone's contacts to the server and restore
// them onto a (new) phone. Backend: sowash-backend/routes/phonebookRoutes.js,
// mounted at /api/phonebook — read its header comment first, the rules below
// are the client half of the same design.
//
//   • BACK UP only ever ADDS/UPDATES on the server. A phone with fewer
//     contacts (a new handset) never removes anything from the backup.
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
};

export type PhonebookSummary = {
  total: number;
  last_synced_at: string | null;
  last_device_count: number | null;
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
export async function ensureContactsPermission(): Promise<void> {
  if (Platform.OS === 'web') throw new PhonebookError('The phone book works on the phone app only.');

  let perm = await Contacts.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Contacts.requestPermissionsAsync();
  if (perm.granted) return;

  if (!perm.canAskAgain) {
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

export function backupContacts(onProgress: (p: Progress) => void): Promise<BackupResult> {
  return exclusive(async () => {
    await ensureContactsPermission();

    const device = await readDeviceContacts(onProgress);
    const usable = device.filter((c) => c.phones.some((p) => phoneKey(p.number)));

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
    if (usable.length === 0) return result;

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
    return result;
  });
}

// ───────────────────────────── restore ─────────────────────────────

const RESTORE_PAGE = 300;

export function restoreContacts(onProgress: (p: Progress) => void): Promise<RestoreResult> {
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
      const page = await fetchContacts({ limit: RESTORE_PAGE, offset, sort: 'id' });
      result.total = page.total;

      for (const c of page.contacts) {
        handled++;
        const keys = c.phones.map((p) => phoneKey(p.number)).filter((k): k is string => !!k);
        if (keys.some((k) => have.has(k))) {
          result.alreadyOnPhone++;
        } else {
          try {
            const first = c.given_name || c.family_name ? c.given_name || '' : c.display_name;
            await Contacts.addContactAsync({
              contactType: Contacts.ContactTypes.Person,
              name: c.display_name,
              firstName: first,
              lastName: c.given_name || c.family_name ? c.family_name || '' : '',
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
    return result;
  });
}
