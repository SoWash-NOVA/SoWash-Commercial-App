// src/brand.ts
//
// The SoWash brand colours, sampled from the logo file itself (assets/sowash-logo.png).
// Used where the brand — not the user-selectable accent — should show: the login
// screen and the gradient headers on every page.

export const BRAND_BLUE = '#33B8F0';
export const BRAND_GREEN = '#7EF505';
export const BRAND_INK = '#0b2a3a';
/** The logo's lime is too light to read as text or icons on white (~1.3:1); these are its darker siblings for that job. */
export const BRAND_GREEN_DEEP = '#3E9F00';
export const BRAND_GREEN_MID = '#5BC400';

/**
 * The page-header gradient, LEFT → RIGHT (2026-10-05): the logo's sky blue flowing into its lime
 * through a soft aqua-mint, so a header reads as the logo's two colours in one sweep. The left end
 * (where titles sit) is the deepest blue so white text reads; the right end stops a little short of
 * the pure logo lime (#7EF505), on which white icons would vanish. Horizontal on purpose: the
 * status-bar strip (src/top-inset-color.tsx) draws the same gradient, seamless at any height.
 */
export const HEADER_GRADIENT = {
  colors: ['#1C9BE0', BRAND_BLUE, '#4CC9A0', '#6BD81A'],
  locations: [0, 0.4, 0.74, 1],
} as const;

/** The green the client ring button and the Team new-chat FAB use (the tab bars use HEADER_GRADIENT). */
export const GREEN_STOPS = {
  mid: '#4CB800',
  end: '#6EDB00',
};
