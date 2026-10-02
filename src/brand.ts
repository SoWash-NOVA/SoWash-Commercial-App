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
 * The page-header gradient, top → bottom. GREEN leads (the logo's lime is the brand's main colour):
 * a deep forest green at the top — which is what the status-bar strip shows — brightening to a
 * vivid green at the bottom. White text sits on it, so even the brightest stop stays dark enough
 * to read (~2.6:1 — fine for the large bold titles; pure #7EF505 would be ~1.3:1). The full lime
 * and the sky blue come in as GLOWS (the header orbs), which is what makes it vivid.
 */
export const HEADER_STOPS = {
  top: '#0A5A0E',
  mid: '#1F8C0B',
  end: '#3DB800',
};
