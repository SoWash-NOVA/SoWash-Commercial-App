// src/components/BubblePhysics.tsx
//
// Draggable, colliding bubbles for the login backdrop.
//
// Grab a bubble and drag it: it follows your finger and shoves the others — they
// collide like real balls (momentum exchange by mass, a bit of bounce) — and when
// you let go everything drifts slowly back to where it started.
//
// PERFORMANCE (the first version lagged on a budget phone, so this is built around it)
//  • Two layers of motion are summed natively with Animated.add:
//      1. an IDLE float — plain native-driven Animated loops. Zero JS work per frame.
//      2. a PHYSICS offset — written with setValue from a requestAnimationFrame loop.
//    The first version ran the physics loop forever and pushed ~12 values across the
//    JS→native bridge every frame even when nobody was touching anything. Now the
//    loop only runs while something is held, moving, or on its way home, and stops
//    (snapping exactly home) the moment everything is at rest.
//  • Within the loop only values that actually changed are written, and the held
//    bubble is written straight from the touch event instead of waiting for the next
//    frame (less latency under the finger).
//  • Each bubble is rasterised once as a texture (renderToHardwareTextureAndroid), so
//    moving it is a transform of a cached bitmap, not a re-draw of two gradients.
//
// Touch is NOT handled by the bubbles themselves (they sit BEHIND the form, and
// anything on top would swallow taps on the inputs). The screen instead claims a
// touch in the responder *capture* phase only when it lands on a bubble (and not on
// the form card). Decoration only: nothing here affects layout.

import React, { useEffect, useMemo } from 'react';
import { Animated, Easing, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface BubbleSpec {
  size: number;
  colors: [string, string];
  /** Anchors, in px from the screen edges (negative = partly off-screen), like absolute styles. */
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  /** Idle float: vertical bob and horizontal sway in px. */
  amp?: number;
  sway?: number;
}

interface Body {
  r: number;
  mass: number;
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dragging: boolean;
}

// Tuned with a headless run of this maths (drag one bubble into the biggest, release):
// SPRING 5.5 / DAMPING 3.0 brought everything home in ~1.4s — a snap. 1.8 / 2.2 is slightly
// underdamped (a faint overshoot) and settles in ~3.2s: slow, as asked, but not sluggish.
const SPRING = 1.8;
const DAMPING = 2.2;
const RESTITUTION = 0.9;
const MAX_SPEED = 1600; // px/s
const HIT_SLOP = 10; // forgiving grab radius
// "At rest" = within a pixel of home and barely moving: the snap to exactly home is invisible, and
// a looser threshold ends the JS loop sooner (a headless run: ~6.8s after a throw at 0.4px / 3px/s).
const REST_DIST = 0.8; // px
const REST_SPEED = 8; // px/s

type Pair = { tx: Animated.Value; ty: Animated.Value };

/** The sim itself — plain objects and one rAF loop, no React state. */
function createEngine(specs: BubbleSpec[], values: Pair[], screenW: number, screenH: number) {
  const bodies: Body[] = specs.map((s) => {
    const r = s.size / 2;
    const hx = s.left !== undefined ? s.left + r : screenW - (s.right ?? 0) - r;
    const hy = s.top !== undefined ? s.top + r : screenH - (s.bottom ?? 0) - r;
    return { r, mass: r * r, hx, hy, x: hx, y: hy, vx: 0, vy: 0, dragging: false };
  });
  const published = specs.map(() => ({ x: 0, y: 0 }));
  const drag = { index: -1, offX: 0, offY: 0, lastX: 0, lastY: 0, lastT: 0 };

  let raf = 0;
  let running = false;
  let last = 0;

  /** Write a body's offset-from-home to native, only for the axes that changed. */
  const publish = (i: number, force = false) => {
    const b = bodies[i];
    const ox = b.x - b.hx;
    const oy = b.y - b.hy;
    const p = published[i];
    if (force || Math.abs(ox - p.x) > 0.02) {
      values[i].tx.setValue(ox);
      p.x = ox;
    }
    if (force || Math.abs(oy - p.y) > 0.02) {
      values[i].ty.setValue(oy);
      p.y = oy;
    }
  };

  const step = (dt: number) => {
    // 1) integrate: spring home, damped
    for (const b of bodies) {
      if (b.dragging) continue;
      b.vx += ((b.hx - b.x) * SPRING - b.vx * DAMPING) * dt;
      b.vy += ((b.hy - b.y) * SPRING - b.vy * DAMPING) * dt;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) {
        b.vx *= MAX_SPEED / sp;
        b.vy *= MAX_SPEED / sp;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // 2) circle–circle collisions (a dragged bubble acts as immovable: it shoves, isn't shoved)
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min || d2 < 1e-6) continue;

        const dist = Math.sqrt(d2);
        const nx = dx / dist;
        const ny = dy / dist;
        const invA = a.dragging ? 0 : 1 / a.mass;
        const invB = b.dragging ? 0 : 1 / b.mass;
        const inv = invA + invB;
        if (inv === 0) continue;

        const overlap = min - dist;
        a.x -= nx * overlap * (invA / inv);
        a.y -= ny * overlap * (invA / inv);
        b.x += nx * overlap * (invB / inv);
        b.y += ny * overlap * (invB / inv);

        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const jImp = (-(1 + RESTITUTION) * rv) / inv;
          a.vx -= jImp * invA * nx;
          a.vy -= jImp * invA * ny;
          b.vx += jImp * invB * nx;
          b.vy += jImp * invB * ny;
        }
      }
    }

    // 3) soft limits, then publish what changed
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      const pad = b.r * 1.3;
      b.x = Math.max(-pad, Math.min(screenW + pad, b.x));
      b.y = Math.max(-pad, Math.min(screenH + pad, b.y));
      publish(i);
    }
  };

  const allAtRest = () =>
    bodies.every(
      (b) =>
        !b.dragging &&
        Math.abs(b.x - b.hx) < REST_DIST &&
        Math.abs(b.y - b.hy) < REST_DIST &&
        Math.hypot(b.vx, b.vy) < REST_SPEED,
    );

  const loop = (now: number) => {
    const dt = last ? Math.min(0.033, (now - last) / 1000) : 0.016;
    last = now;
    step(dt);

    if (allAtRest()) {
      // Snap exactly home and STOP — no JS work at all until the next touch.
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        b.x = b.hx;
        b.y = b.hy;
        b.vx = 0;
        b.vy = 0;
        publish(i, true);
      }
      running = false;
      return;
    }
    raf = requestAnimationFrame(loop);
  };

  const ensureRunning = () => {
    if (running) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  };

  return {
    /** Index of the bubble under a screen point (nearest edge wins), or -1. */
    hitTest(px: number, py: number): number {
      let best = -1;
      let bestScore = Infinity;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const d = Math.hypot(px - b.x, py - b.y);
        if (d <= b.r + HIT_SLOP && d - b.r < bestScore) {
          best = i;
          bestScore = d - b.r;
        }
      }
      return best;
    },

    begin(index: number, px: number, py: number) {
      const b = bodies[index];
      if (!b) return;
      b.dragging = true;
      b.vx = 0;
      b.vy = 0;
      drag.index = index;
      drag.offX = px - b.x;
      drag.offY = py - b.y;
      drag.lastX = b.x;
      drag.lastY = b.y;
      drag.lastT = Date.now();
      ensureRunning();
    },

    move(px: number, py: number) {
      const b = bodies[drag.index];
      if (!b) return;
      const nx = px - drag.offX;
      const ny = py - drag.offY;
      const now = Date.now();
      const dt = Math.max(1, now - drag.lastT) / 1000;
      // finger velocity, smoothed — what a released/colliding bubble inherits
      b.vx = b.vx * 0.5 + ((nx - drag.lastX) / dt) * 0.5;
      b.vy = b.vy * 0.5 + ((ny - drag.lastY) / dt) * 0.5;
      b.x = nx;
      b.y = ny;
      drag.lastX = nx;
      drag.lastY = ny;
      drag.lastT = now;
      publish(drag.index); // straight from the touch event: less latency under the finger
    },

    end() {
      const b = bodies[drag.index];
      if (b) {
        b.dragging = false;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) {
          b.vx *= MAX_SPEED / sp;
          b.vy *= MAX_SPEED / sp;
        }
      }
      drag.index = -1;
      ensureRunning();
    },

    stop() {
      cancelAnimationFrame(raf);
      running = false;
    },
  };
}

export function useBubblePhysics(specs: BubbleSpec[], screenW: number, screenH: number) {
  const values = useMemo<Pair[]>(
    () => specs.map(() => ({ tx: new Animated.Value(0), ty: new Animated.Value(0) })),
    [specs],
  );

  // Idle float: native loops → interpolations. Summed with the physics offset in PhysicsBubble.
  const idle = useMemo(
    () =>
      specs.map((s) => {
        const sway = s.sway ?? 6;
        const amp = s.amp ?? 10;
        const x = new Animated.Value(0);
        const y = new Animated.Value(0);
        return {
          x,
          y,
          ix: x.interpolate({ inputRange: [0, 1], outputRange: [-sway, sway] }),
          iy: y.interpolate({ inputRange: [0, 1], outputRange: [amp / 2, -amp / 2] }),
        };
      }),
    [specs],
  );

  useEffect(() => {
    const mk = (v: Animated.Value, duration: number, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
    const loops = idle.flatMap((o, i) => [
      mk(o.x, 4200 + (i % 3) * 900, i * 300),
      mk(o.y, 3600 + (i % 4) * 700, i * 450),
    ]);
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [idle]);

  const engine = useMemo(() => createEngine(specs, values, screenW, screenH), [specs, values, screenW, screenH]);
  useEffect(() => () => engine.stop(), [engine]);

  return {
    values,
    idle: idle.map((o) => ({ ix: o.ix, iy: o.iy })),
    hitTest: engine.hitTest,
    begin: engine.begin,
    move: engine.move,
    end: engine.end,
  };
}

/** One glossy sphere. Positioned at its home; motion is transforms only (idle float + physics offset). */
export function PhysicsBubble({
  spec,
  tx,
  ty,
  ix,
  iy,
  screenW,
  screenH,
}: {
  spec: BubbleSpec;
  tx: Animated.Value;
  ty: Animated.Value;
  ix: Animated.AnimatedInterpolation<number>;
  iy: Animated.AnimatedInterpolation<number>;
  screenW: number;
  screenH: number;
}) {
  const { size, colors } = spec;
  const r = size / 2;
  const cx = spec.left !== undefined ? spec.left + r : screenW - (spec.right ?? 0) - r;
  const cy = spec.top !== undefined ? spec.top + r : screenH - (spec.bottom ?? 0) - r;

  const x = useMemo(() => Animated.add(tx, ix), [tx, ix]);
  const y = useMemo(() => Animated.add(ty, iy), [ty, iy]);

  return (
    <Animated.View
      pointerEvents="none"
      // draw the bubble once, then move the cached bitmap (Android)
      renderToHardwareTextureAndroid
      style={{
        position: 'absolute',
        left: cx - r,
        top: cy - r,
        width: size,
        height: size,
        transform: [{ translateX: x }, { translateY: y }],
      }}
    >
      {/* Soft tinted "shadow" drawn as a view: an Android elevation here would lift the
          bubble ABOVE the logo and form (elevation beats sibling order). */}
      <View
        style={{
          position: 'absolute',
          left: size * 0.06,
          top: size * 0.14,
          width: size * 0.88,
          height: size * 0.88,
          borderRadius: size,
          backgroundColor: colors[1],
          opacity: 0.22,
        }}
      />
      <LinearGradient
        colors={colors}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ width: size, height: size, borderRadius: r }}
      />
      {/* the little window-light highlight that makes it read as a ball */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.12,
          left: size * 0.17,
          width: size * 0.34,
          height: size * 0.2,
          borderRadius: size,
          backgroundColor: 'rgba(255,255,255,0.5)',
          transform: [{ rotate: '-28deg' }],
        }}
      />
    </Animated.View>
  );
}
