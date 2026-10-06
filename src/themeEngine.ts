// src/themeEngine.ts
//
// Light / dark theme for the whole app without rewriting every screen.
//
// Every screen styles itself with module-level `StyleSheet.create({...})` blocks full
// of light colours (and `palette.*` values captured at import time). Rather than turn
// ~40 files into per-render style factories, this module PATCHES `StyleSheet.create`
// before any screen module loads (it is the first import of /index.js, the app entry):
// each stylesheet gets a lazily-built DARK twin, and the object handed back is a Proxy
// that returns the light or the dark entry depending on the current mode. Nothing is
// mutated (RN freezes style objects in dev), and because the two variants are separate
// objects, react-native-web's per-object style cache stays correct too.
//
// The dark twin is computed per style PROPERTY, not per colour, because the same value
// means different things in different places: `backgroundColor: '#fff'` is a card
// (→ dark surface) while `color: '#fff'` is white text on a coloured button (→ stays
// white). Backgrounds/borders that are LIGHT get darkened (neutrals to the slate
// surface family, tints to a dark version of the same hue); text colours that are DARK
// get lightened. Mid tones (brand blue, status colours, gradients' stops) are left
// alone. Translucent whites below 85% alpha are glass over the coloured headers and are
// left alone too. The palette's own values map EXACTLY to the hand-picked dark palette
// (see DARK_EXACT), so `palette.ink` read at render and a captured `'#1e293b'` agree.
//
// Inline colours in JSX (not in a stylesheet) don't pass through here — wrap those with
// `tc()` (a background/border colour) or `ttc()` (a text/icon colour).
//
// A mode change is applied by remounting the app tree below AuthProvider (see
// src/theme-mode.tsx) so every component re-reads its styles.
//
// ⚠ This file must not import anything that itself calls StyleSheet.create (theme.ts,
// components…) — those modules would evaluate before the patch below is installed.

import { StyleSheet } from 'react-native';

export type ThemeMode = 'light' | 'dark';

let mode: ThemeMode = 'light';

export function getThemeMode(): ThemeMode {
  return mode;
}
export function isDark(): boolean {
  return mode === 'dark';
}
/** Low-level switch. Use `useThemeMode().setMode` from src/theme-mode.tsx — it also persists and remounts. */
export function setEngineMode(m: ThemeMode) {
  mode = m;
}

/* ------------------------------------------------------------------ *
 * The dark palette (hand-picked) and exact light→dark pairs.
 * ------------------------------------------------------------------ */
export const DARK = {
  bg: '#0E1520',
  surface: '#172131',
  surfaceAlt: '#1D2838',
  border: '#2A3649',
  ink: '#E6EDF5',
  inkSoft: '#C3CEDB',
  muted: '#9AA8BA',
  mutedLight: '#7C8BA1',
};

/** Background/border role: exact pairs for the light neutrals used across the app. */
const BG_EXACT: Record<string, string> = {
  ffffff: DARK.surface,
  f4f7fc: DARK.bg,
  f4f7fa: DARK.bg,
  f5fafd: DARK.bg,
  f6f8ff: DARK.bg,
  f8fafc: DARK.surfaceAlt,
  f1f5f9: DARK.surfaceAlt,
  eef3f7: DARK.surfaceAlt,
  eef2f7: DARK.surfaceAlt,
  edf3f7: DARK.surfaceAlt,
  f4f8fb: DARK.surfaceAlt,
  edf2f6: DARK.border,
  e2e8f0: DARK.border,
  dfe8ee: DARK.border,
  d5e3ec: DARK.border,
};

/** Text role: exact pairs for the palette's ink family. */
const TEXT_EXACT: Record<string, string> = {
  '1e293b': DARK.ink,
  '0b2a3a': DARK.ink,
  '0f172a': DARK.ink,
  '334155': DARK.inkSoft,
  '64748b': DARK.muted,
  '94a3b8': DARK.mutedLight,
};

/* ------------------------------------------------------------------ *
 * Colour maths.
 * ------------------------------------------------------------------ */
type RGBA = { r: number; g: number; b: number; a: number };

function parse(c: string): RGBA | null {
  const s = c.trim().toLowerCase();
  if (s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((x) => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  return null;
}

function hex6({ r, g, b }: RGBA) {
  return [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

function toHsl({ r, g, b }: RGBA) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function fromHsl(h: number, s: number, l: number, a: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const rgb = { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a };
  const hx = hex6(rgb);
  return a >= 0.999 ? `#${hx}` : `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${+a.toFixed(3)})`;
}

const cache = new Map<string, string>();

/** A background / border / fill colour → its dark-theme counterpart. */
export function darkBg(c: string): string {
  const key = 'b' + c;
  const hit = cache.get(key);
  if (hit) return hit;
  let out = c;
  const p = isKept(c) ? null : parse(c);
  if (p) {
    const exact = BG_EXACT[hex6(p)];
    // translucent whites are glass over the coloured headers — leave them
    if (p.a < 0.85 && p.r > 240 && p.g > 240 && p.b > 240) out = c;
    else if (exact && p.a >= 0.999) out = exact;
    else {
      const { h, s, l } = toHsl(p);
      if (l >= 0.8) {
        out =
          s < 0.12
            ? fromHsl(216, 0.28, 0.1 + (1 - l) * 0.9, p.a) // neutral → slate surface family
            : fromHsl(h, Math.min(s, 0.6) * 0.75, 0.15 + (1 - l) * 0.55, p.a); // tint → dark same-hue tint
      }
    }
  }
  cache.set(key, out);
  return out;
}

/** A text / icon colour → its dark-theme counterpart. */
export function darkText(c: string): string {
  const key = 't' + c;
  const hit = cache.get(key);
  if (hit) return hit;
  let out = c;
  const p = isKept(c) ? null : parse(c);
  if (p) {
    const exact = TEXT_EXACT[hex6(p)];
    if (exact && p.a >= 0.999) out = exact;
    else {
      const { h, s, l } = toHsl(p);
      if (l <= 0.4) out = fromHsl(h, s, Math.min(0.9, 0.93 - l * 0.7), p.a);
    }
  }
  cache.set(key, out);
  return out;
}

/**
 * Mark a colour as FIXED — never remapped for dark (white chips on the coloured headers,
 * dark text on the yellow search highlight…). Works in stylesheets and inline: it returns
 * the same colour as an 8-digit hex with an opaque 'ff' alpha, which the engine skips.
 */
export function keep(c: string): string {
  const p = parse(c);
  return p ? `#${hex6(p)}ff` : c;
}
function isKept(c: string) {
  return /^#[0-9a-fA-F]{6}ff$/.test(c.trim());
}

/** Inline background/border colour, theme-aware. */
export function tc(c: string): string {
  return mode === 'dark' ? darkBg(c) : c;
}
/** A purely decorative light wash (background blobs): drawn in light, dropped in dark. */
export function soft(c: string): string {
  return mode === 'dark' ? 'transparent' : c;
}

/** Inline text/icon colour, theme-aware. */
export function ttc(c: string): string {
  return mode === 'dark' ? darkText(c) : c;
}

/* ------------------------------------------------------------------ *
 * The StyleSheet.create patch.
 * ------------------------------------------------------------------ */
const BG_KEYS = new Set([
  'backgroundColor',
  'borderColor',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderRightColor',
  'borderStartColor',
  'borderEndColor',
  'borderBlockColor',
  'borderBlockStartColor',
  'borderBlockEndColor',
  'outlineColor',
  'overlayColor',
]);
const TEXT_KEYS = new Set(['color', 'tintColor', 'textDecorationColor']);

function darkStyle(style: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(style)) {
    const v = style[k];
    if (typeof v === 'string' && BG_KEYS.has(k)) out[k] = darkBg(v);
    else if (typeof v === 'string' && TEXT_KEYS.has(k)) out[k] = darkText(v);
    else out[k] = v;
  }
  return out;
}

type AnyStyles = Record<string, unknown>;
const sheet = StyleSheet as unknown as { create: (o: AnyStyles) => AnyStyles; __themePatched?: boolean };

if (!sheet.__themePatched) {
  const original = sheet.create.bind(StyleSheet);
  sheet.__themePatched = true;
  sheet.create = (obj: AnyStyles) => {
    const light = original(obj);
    let dark: AnyStyles | null = null;
    const buildDark = () => {
      const d: AnyStyles = {};
      for (const key of Object.keys(obj)) {
        const v = obj[key];
        d[key] = v && typeof v === 'object' && !Array.isArray(v) ? darkStyle(v as Record<string, unknown>) : v;
      }
      return original(d);
    };
    return new Proxy(light, {
      get(target, prop, receiver) {
        if (mode === 'dark' && typeof prop === 'string' && Object.prototype.hasOwnProperty.call(target, prop)) {
          if (!dark) dark = buildDark();
          return dark[prop];
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  };
}
