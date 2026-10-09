// src/chatAdmins.ts
//
// Who is an ADMIN of the staff Support chat: only these accounts can assign / reassign / unassign a client
// conversation and can close ANY conversation. Everyone else can reply, and can close a conversation only when it
// is assigned to them. This list only decides what the app SHOWS (the Assign chip, the Close chip, the yellow
// admin view) — the server (routes/commercialChatRoutes.js, CHAT_ADMIN_EMAILS) is what actually enforces it, so
// keep the two lists the same.

export const CHAT_ADMIN_EMAILS = ['ciadmin@sowash.pk', 'superadmin@sowash.pk'];

export function isChatAdmin(email: string | null | undefined): boolean {
  return CHAT_ADMIN_EMAILS.includes(String(email ?? '').trim().toLowerCase());
}
