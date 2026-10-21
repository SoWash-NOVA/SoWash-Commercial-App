// src/staffFiles.ts — the staff chat FILE LIBRARY (office staff only).
//
// Documents sent in Team DMs / groups are kept in one library so a file can be shared again WITHOUT uploading it
// again: sharing from the library sends a message that points at the already-stored file. The server stores
// identical bytes once, however many people upload them (services/staffFiles.js). Client accounts never use this.

import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { api, SERVER_BASE } from './api/client';
import type { TeamMessage } from './api/types';

export type StaffFile = {
  id: number;
  name: string;
  size: number;
  created_at: string;
  owner_id: number;
  owner_name: string | null;
  /** Uploaded by me (only these can be removed from the library). */
  mine: boolean;
};

export type PickedDocument = { uri: string; name: string; mimeType: string; size: number | null };

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Mirrors ALLOWED_EXT in the backend's services/staffFiles.js — keep in step.
const ALLOWED = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'rtf', 'odt', 'ods', 'zip', 'dwg', 'dxf'];

export class FileError extends Error {}

export function fileExt(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

/** Display name: files stored before the server decoded "%20" still carry it. */
export function displayName(name: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(name || '')) return name;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Open the system file chooser. Null = cancelled. Throws FileError for a type / size the server would refuse. */
export async function pickDocument(): Promise<PickedDocument | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const name = a.name || 'file';
  if (!ALLOWED.includes(fileExt(name))) {
    throw new FileError('That file type is not allowed. Use PDF, Word, Excel, PowerPoint, CSV, text or ZIP.');
  }
  if (a.size != null && a.size > MAX_FILE_BYTES) {
    throw new FileError(`That file is too large (${formatBytes(a.size)}). The limit is 25 MB.`);
  }
  return { uri: a.uri, name, mimeType: a.mimeType || 'application/octet-stream', size: a.size ?? null };
}

/** Put a picked document into my library. If the same content is already stored nothing new is kept server-side. */
export async function uploadFile(doc: PickedDocument): Promise<{ file: StaffFile; deduped: boolean }> {
  const form = new FormData();
  form.append('file', { uri: doc.uri, name: doc.name, type: doc.mimeType } as unknown as Blob);
  const { data } = await api.post('staff-chat/files', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 180000,
  });
  return { file: data.file as StaffFile, deduped: !!data.deduped };
}

export async function fetchFiles(opts: { q?: string; offset?: number; limit?: number } = {}): Promise<{ files: StaffFile[]; has_more: boolean }> {
  const { data } = await api.get('staff-chat/files', { params: { q: opts.q || undefined, offset: opts.offset ?? 0, limit: opts.limit ?? 30 } });
  return { files: data.files ?? [], has_more: !!data.has_more };
}

export async function removeFile(id: number): Promise<void> {
  await api.delete(`staff-chat/files/${id}`);
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  rtf: 'application/rtf',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
};

/**
 * Open a file inside the phone's own viewers: download it once into the app cache (a second open is instant),
 * then hand it to the system "Open with" sheet. No browser involved; the server link is only used for the download.
 */
export async function openFile(id: number, name?: string): Promise<void> {
  const clean = (displayName(name || '') || `file-${id}`).replace(/[\/:*?"<>|]/g, '_');
  const dir = new Directory(Paths.cache, 'staff-files', String(id));
  const target = new File(dir, clean);
  if (!target.exists) {
    const { data } = await api.get(`staff-chat/files/${id}/link`);
    dir.create({ intermediates: true, idempotent: true });
    try {
      await File.downloadFileAsync(`${SERVER_BASE}${data.path}`, target, { idempotent: true });
    } catch (err) {
      try {
        if (target.exists) target.delete();
      } catch {
        /* ignore */
      }
      throw err;
    }
  }
  if (!(await Sharing.isAvailableAsync())) throw new FileError('This phone cannot open files from the app.');
  await Sharing.shareAsync(target.uri, { mimeType: MIME[fileExt(clean)] || '*/*', dialogTitle: clean });
}

/** Send a library file into a conversation — no upload, the message points at the stored file. */
export async function sendFileToConversation(conversationId: number, fileId: number, caption?: string): Promise<TeamMessage> {
  const { data } = await api.post(`staff-chat/conversations/${conversationId}/messages`, {
    file_id: fileId,
    body: caption || undefined,
  });
  return data.message as TeamMessage;
}
