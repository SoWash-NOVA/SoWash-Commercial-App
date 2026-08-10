// src/contact.ts
//
// Contact addresses used in more than one place. Kept out of app/ so screens
// never import from another route module — doing that pulls a whole screen's
// component tree into an unrelated bundle just to read a string.
//
// ⚠ privacy@sowashusa.com is an assumption, inferred from the company domain:
// there was no contact address anywhere in the codebase to copy. It appears in
// app/privacy.tsx, app/(tabs)/profile.tsx (the closure request) and
// docs/privacy-policy.html — change it here and in the HTML, which is served
// standalone and cannot import this.

export const PRIVACY_EMAIL = 'privacy@sowashusa.com';
