// SldPinDirection.tsx
//
// The "which way to point the camera" marker for an SLD pin - the same drawing as the web console's SLD editor
// (sowash-frontend src/pages/CI/SLDEditor.js, PinDirection): an amber view cone from the pin, an arrow, and a
// camera badge where it points. `deg` is degrees on the diagram, 0 = towards the top, clockwise; null/undefined
// = no direction (renders nothing). Draw it UNDER the pin dot and centre it on the pin; it ignores touches.

import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Stop } from 'react-native-svg';

const AMBER = '#F59E0B';
const CAM_PATH = 'M3.5 4.5h1.6l.9-1.5h4l.9 1.5h1.6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z';

/** Direction in degrees from an API value (number, numeric string or null). */
export function parseDirection(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? ((n % 360) + 360) % 360 : null;
}

export const DIRECTION_NAMES: Record<number, string> = {
  0: 'Up', 45: 'Up-right', 90: 'Right', 135: 'Down-right', 180: 'Down', 225: 'Down-left', 270: 'Left', 315: 'Up-left',
};

export default function SldPinDirection({
  deg,
  size = 120,
  uid = 'a',
}: {
  deg: number | null | undefined;
  /** Side of the square the cone is drawn in (centred on the pin). */
  size?: number;
  /** Unique suffix for the gradient id when several are on screen. */
  uid?: string | number;
}) {
  const d = parseDirection(deg);
  if (d === null) return null;
  const gid = `sldCone${uid}`;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        transform: [{ rotate: `${d}deg` }],
      }}
    >
      <Svg width={size} height={size} viewBox="-75 -75 150 150">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="-1" gradientUnits="objectBoundingBox">
            <Stop offset="0" stopColor={AMBER} stopOpacity="0.55" />
            <Stop offset="1" stopColor={AMBER} stopOpacity="0.08" />
          </LinearGradient>
        </Defs>
        <Path
          d="M0 0 L-24 -58 A63 63 0 0 1 24 -58 Z"
          fill={`url(#${gid})`}
          stroke={AMBER}
          strokeOpacity={0.7}
          strokeWidth={1.2}
          strokeDasharray="3 3"
        />
        <Line x1="0" y1="-12" x2="0" y2="-44" stroke={AMBER} strokeWidth={3} strokeLinecap="round" />
        <Path d="M-6 -42 L0 -50 L6 -42 Z" fill={AMBER} />
        {/* badge stays upright whatever the rotation */}
        <G transform={`translate(0 -64) rotate(${-d})`}>
          <Circle r={11} fill={AMBER} stroke="#fff" strokeWidth={2} />
          <G transform="translate(-8 -8)">
            <Path d={CAM_PATH} fill="#fff" />
            <Circle cx={8} cy={8.5} r={2.2} fill={AMBER} />
          </G>
        </G>
      </Svg>
    </View>
  );
}
