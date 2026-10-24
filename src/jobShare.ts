// src/jobShare.ts
//
// Office staff: send a visit (as a text summary) or one of its photos (TBT, before, after) into a Team DM / group.
// The picking UI is ChatTargetSheet. Staff only — client accounts have no Team chats.

import { Directory, File, Paths } from 'expo-file-system';
import { api } from './api/client';
import { formatDateOnly, statusMeta } from './hooks';
import type { StaffJob } from './api/types';

/** The visit as plain chat text; empty facts are left out. */
export function jobShareText(job: StaffJob): string {
  const panels = job.total_panels_cleaned != null && String(job.total_panels_cleaned).trim() !== '' ? String(job.total_panels_cleaned) : '';
  const lines: Array<[string, string]> = [
    ['Client', job.client_name || ''],
    ['Date', job.scheduled_date ? formatDateOnly(job.scheduled_date) : ''],
    ['Status', statusMeta(job.status).label],
    ['Service #', job.service_number != null ? String(job.service_number) : ''],
    ['Crew lead', job.team_lead_name || ''],
    ['Panels cleaned', panels],
    ['Address', [job.address, job.city].filter(Boolean).join(', ')],
  ];
  return [`Visit: ${job.site_name || 'Site'}`, ...lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)].join('\n');
}

/** Post the visit summary as a normal text message. Throws on failure. */
export async function shareJobToConversation(conversationId: number, job: StaffJob): Promise<void> {
  const form = new FormData();
  form.append('body', jobShareText(job));
  await api.post(`staff-chat/conversations/${conversationId}/messages`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/** Download a photo into the cache, then post it as a photo message (same field the chat composer uses). Throws on failure. */
export async function sharePhotoToConversation(conversationId: number, url: string, caption?: string): Promise<void> {
  const dir = new Directory(Paths.cache, 'job-share');
  dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, `photo-${Date.now()}.jpg`);
  await File.downloadFileAsync(url, target, { idempotent: true });
  try {
    const form = new FormData();
    if (caption) form.append('body', caption);
    form.append('photo', { uri: target.uri, name: target.name || 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
    await api.post(`staff-chat/conversations/${conversationId}/messages`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  } finally {
    try {
      if (target.exists) target.delete();
    } catch {
      /* ignore */
    }
  }
}
