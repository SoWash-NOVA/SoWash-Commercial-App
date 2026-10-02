// src/utils/color.ts
//
// Tiny hex-colour helpers for the chat redesign: the header and bubble gradients
// are derived from whatever accent the user picked, so they need a darker /
// lighter / blended version of it rather than hard-coded colours.

function parse(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Blend `a` toward `b` by t (0 = a, 1 = b). Returns `a` unchanged if either isn't a hex colour. */
export function mix(a: string, b: string, t: number): string {
  const ca = parse(a);
  const cb = parse(b);
  if (!ca || !cb) return a;
  return `#${toHex(ca[0] + (cb[0] - ca[0]) * t)}${toHex(ca[1] + (cb[1] - ca[1]) * t)}${toHex(ca[2] + (cb[2] - ca[2]) * t)}`;
}

/** Darken (amount < 0) or lighten (amount > 0) by 0–1. */
export function shade(hex: string, amount: number): string {
  return mix(hex, amount < 0 ? '#000000' : '#ffffff', Math.abs(amount));
}
