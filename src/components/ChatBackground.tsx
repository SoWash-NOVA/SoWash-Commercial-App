// src/components/ChatBackground.tsx
//
// The wallpaper behind every chat thread: a soft accent-to-indigo gradient with a
// faint tiled doodle pattern on top. Drawn in react-native-svg (already a
// dependency) instead of shipping an image, so it follows the accent the user
// picked, stays crisp on every screen density, and adds nothing to the bundle.
//
// The doodles deliberately cover the WHOLE company, not one service: AI (sparkle,
// neural network, chip, robot), robotics and drones, solar and cleaning (sun,
// panel, droplet), plus the things every client conversation is really about —
// locations, safety, reports, connectivity, energy, sustainability.
//
// Every motif is drawn around (0,0) in a roughly 40x40 box and placed with a
// translate/rotate/scale, so changing the composition means editing one list.
// ~11% stroke opacity keeps message bubbles the focus.

import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Pattern, Rect, Stop } from 'react-native-svg';
import { useAccent } from '../theme-context';

const TILE = 240;

/** The motifs, each centred on (0,0). */
const MOTIFS: Record<string, React.ReactNode> = {
  // ── AI & robotics ──
  sparkle: (
    <>
      <Path d="M0 -18c1.5 9 9 16.5 18 18 -9 1.5 -16.5 9 -18 18 -1.5 -9 -9 -16.5 -18 -18 9 -1.5 16.5 -9 18 -18z" />
      <Path d="M17 -21v8 M13 -17h8" />
    </>
  ),
  robot: (
    <>
      <Path d="M-13 -9h26a4 4 0 0 1 4 4v14a4 4 0 0 1 -4 4h-26a4 4 0 0 1 -4 -4v-14a4 4 0 0 1 4 -4z" />
      <Circle cx={-6} cy={1} r={2.2} />
      <Circle cx={6} cy={1} r={2.2} />
      <Path d="M0 -9v-6 M-17 0h-3 M17 0h3 M-5 8h10" />
      <Circle cx={0} cy={-17} r={2} />
    </>
  ),
  neural: (
    <>
      <Circle cx={-14} cy={-10} r={2.5} />
      <Circle cx={-14} cy={10} r={2.5} />
      <Circle cx={0} cy={-14} r={2.5} />
      <Circle cx={0} cy={0} r={2.5} />
      <Circle cx={0} cy={14} r={2.5} />
      <Circle cx={14} cy={-6} r={2.5} />
      <Circle cx={14} cy={8} r={2.5} />
      <Path d="M-14 -10L0 -14 M-14 -10L0 0 M-14 10L0 0 M-14 10L0 14 M0 -14L14 -6 M0 0L14 -6 M0 0L14 8 M0 14L14 8" />
    </>
  ),
  chip: (
    <>
      <Path d="M-10 -10h20v20h-20z M-5 -5h10v10h-10z" />
      <Path d="M-5 -10v-5 M0 -10v-5 M5 -10v-5 M-5 10v5 M0 10v5 M5 10v5 M-10 -5h-5 M-10 0h-5 M-10 5h-5 M10 -5h5 M10 0h5 M10 5h5" />
    </>
  ),
  drone: (
    <>
      <Circle cx={0} cy={0} r={3.5} />
      <Path d="M-3 -3L-12 -12 M3 -3L12 -12 M-3 3L-12 12 M3 3L12 12" />
      <Circle cx={-13} cy={-13} r={4.5} />
      <Circle cx={13} cy={-13} r={4.5} />
      <Circle cx={-13} cy={13} r={4.5} />
      <Circle cx={13} cy={13} r={4.5} />
    </>
  ),
  gear: (
    <>
      <Circle cx={0} cy={0} r={4} />
      <Circle cx={0} cy={0} r={10} />
      <Path d="M0 -14v4 M0 10v4 M-14 0h4 M10 0h4 M-10 -10l3 3 M7 7l3 3 M10 -10l-3 3 M-7 7l-3 3" />
    </>
  ),
  // ── solar & cleaning ──
  sun: (
    <>
      <Circle cx={0} cy={0} r={6} />
      <Path d="M0 -17v5 M0 12v5 M-17 0h5 M12 0h5 M-12 -12l3.5 3.5 M8.5 8.5l3.5 3.5 M12 -12l-3.5 3.5 M-8.5 8.5l-3.5 3.5" />
    </>
  ),
  droplet: <Path d="M0 -17c0 0 -11 12 -11 20a11 11 0 0 0 22 0c0 -8 -11 -20 -11 -20z" />,
  panel: (
    <>
      <Path d="M-17 -10h34a3 3 0 0 1 3 3v14a3 3 0 0 1 -3 3h-34a3 3 0 0 1 -3 -3v-14a3 3 0 0 1 3 -3z" />
      <Path d="M-6 -10v20 M6 -10v20 M-20 0h40 M0 10v6 M-7 16h14" />
    </>
  ),
  // ── what the conversations are about ──
  chat: (
    <>
      <Path d="M-16 -12h32a5 5 0 0 1 5 5v12a5 5 0 0 1 -5 5h-14l-8 7v-7h-10a5 5 0 0 1 -5 -5v-12a5 5 0 0 1 5 -5z" />
      <Circle cx={-7} cy={-1} r={1} />
      <Circle cx={0} cy={-1} r={1} />
      <Circle cx={7} cy={-1} r={1} />
    </>
  ),
  pin: (
    <>
      <Path d="M0 16c0 0 -12 -11 -12 -20a12 12 0 0 1 24 0c0 9 -12 20 -12 20z" />
      <Circle cx={0} cy={-4} r={4} />
    </>
  ),
  shield: (
    <>
      <Path d="M0 -16l14 5v9c0 8 -6 13 -14 16 -8 -3 -14 -8 -14 -16v-9z" />
      <Path d="M-6 0l4 4 8 -8" />
    </>
  ),
  badge: (
    <>
      <Circle cx={0} cy={0} r={13} />
      <Path d="M-6 0l4 4 8 -8" />
    </>
  ),
  report: (
    <>
      <Path d="M-11 -15h16l8 8v22h-24z" />
      <Path d="M5 -15v8h8 M-6 -1h12 M-6 5h12 M-6 11h7" />
    </>
  ),
  wifi: (
    <>
      <Path d="M-14 -4a20 20 0 0 1 28 0 M-9 1a13 13 0 0 1 18 0 M-4 6a6 6 0 0 1 8 0" />
      <Circle cx={0} cy={11} r={1.5} />
    </>
  ),
  bolt: <Path d="M3 -17l-12 19h9l-3 15 12 -20h-9z" />,
  leaf: (
    <>
      <Path d="M-14 12c0 -16 10 -26 28 -26 0 18 -10 28 -28 26z" />
      <Path d="M-14 12L4 -6" />
    </>
  ),
  plus: <Path d="M0 -4v8 M-4 0h8" />,
  dot: <Circle cx={0} cy={0} r={1.6} />,
};

/** Where each motif sits inside the 240px tile: [motif, x, y, rotation°, scale]. */
const LAYOUT: Array<[keyof typeof MOTIFS, number, number, number, number]> = [
  ['sparkle', 32, 32, 0, 1],
  ['robot', 102, 30, -8, 0.9],
  ['sun', 172, 34, 0, 0.9],
  ['chip', 218, 78, 12, 0.85],
  ['droplet', 56, 92, 10, 1],
  ['neural', 128, 94, 0, 1.05],
  ['shield', 196, 128, 8, 0.9],
  ['drone', 26, 152, 0, 0.9],
  ['chat', 94, 150, 0, 1],
  ['pin', 158, 168, -10, 0.9],
  ['panel', 46, 208, 0, 0.9],
  ['leaf', 112, 210, 15, 0.9],
  ['wifi', 168, 214, 0, 0.9],
  ['bolt', 214, 196, 8, 0.85],
  ['gear', 204, 28, 0, 0.7],
  ['report', 20, 94, -10, 0.7],
  ['badge', 114, 130, 0, 0.55],
  // small fillers so the tile never looks gappy
  ['plus', 66, 60, 0, 1],
  ['plus', 150, 62, 0, 1],
  ['plus', 180, 96, 0, 1],
  ['plus', 76, 178, 0, 1],
  ['plus', 132, 184, 0, 1],
  ['plus', 12, 188, 0, 1],
  ['dot', 40, 66, 0, 1],
  ['dot', 128, 62, 0, 1],
  ['dot', 100, 96, 0, 1],
  ['dot', 188, 160, 0, 1],
  ['dot', 74, 236, 0, 1],
  ['dot', 140, 128, 0, 1],
  ['dot', 14, 130, 0, 1],
];

/**
 * `tone="onDark"` draws white doodles with no wash — for sitting on top of a coloured
 * surface (the login hero). The default is the chat wallpaper: accent wash + accent doodles.
 */
export default function ChatBackground({
  tone = 'accent',
  color,
}: {
  tone?: 'accent' | 'onDark' | 'plain';
  /** Doodle colour for `tone="plain"` (no wash) — used where the surface has its own brand colours. */
  color?: string;
}) {
  const { accent } = useAccent();
  const onDark = tone === 'onDark';
  const plain = tone === 'plain';

  return (
    <View pointerEvents="none" style={styles.fill}>
      <Svg width="100%" height="100%">
        <Defs>
          {/* accent → indigo: a faint "tech" cast over the user's own colour */}
          <LinearGradient id="chatWash" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={accent} stopOpacity={0.14} />
            <Stop offset="1" stopColor="#6366f1" stopOpacity={0.1} />
          </LinearGradient>
          <Pattern id="chatDoodles" patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
            <G
              fill="none"
              stroke={onDark ? '#ffffff' : plain ? color ?? accent : accent}
              strokeOpacity={onDark ? 0.16 : plain ? 0.1 : 0.12}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {LAYOUT.map(([name, x, y, rot, scale], i) => (
                <G key={`${name}-${i}`} transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`}>
                  {MOTIFS[name]}
                </G>
              ))}
            </G>
          </Pattern>
        </Defs>
        {onDark || plain ? null : <Rect width="100%" height="100%" fill="url(#chatWash)" />}
        <Rect width="100%" height="100%" fill="url(#chatDoodles)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
