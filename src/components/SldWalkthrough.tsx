// src/components/SldWalkthrough.tsx
//
// The "walk the site" viewer: a single-line diagram covered in numbered pins,
// tap one to zoom into it, then page through each point's before/after photo
// with a mini-map showing where you are standing.
//
// Ported from the web portal's SLDWalkthrough.js (itself the me-portal
// GTASLDViewer). What changed in the port, and why:
//
//   • Built-in Animated, not Reanimated. reanimated@4 is in package.json but
//     imported nowhere, and this project has NO babel.config.js — v4 worklets
//     need react-native-worklets/plugin registered there. Everything here is
//     opacity/scale/rotate, which the native driver does natively. Nothing to
//     configure, and it survives `expo export` for web.
//
//   • The stick figure is Views, not <Svg>. Same reason, plus RN cannot put an
//     Animated.View inside <Svg> to swing a limb.
//
//   • Arrows walk the points that HAVE photos, not every point. The web arrows
//     step through all of them, so arrowing into a photo-less point renders
//     src="" — a broken frame. Filtering fixes that at the source.
//
//   • Photos are `contain`, not `cover`. The web crops to fill. These are
//     evidence of what a panel looked like before and after a clean; cropping
//     the edges off the thing being examined is the wrong trade on a phone.
//
//   • No transform-origin in RN. Zooming "into" a pin is done by translating
//     the pin to the centre and scaling about it — see zoomTo().

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronLeft, ChevronRight, Map as MapIcon, X } from 'lucide-react-native';
import { photoUrl } from '../api/client';
import { palette, ACCENT_DEFAULT } from '../theme';
import { SldDiagram, SldPoint } from '../api/types';

/* ── palette ──────────────────────────────────────────────────────────────
 *
 * The STAGE is dark on purpose — a diagram and a set of site photos read best
 * against near-black, and it is what the web portal does. The CHROME around it
 * stays light.
 *
 * That split is not a style choice. app/_layout.tsx wraps every route in a
 * SafeAreaView painted palette.bg with edges top+bottom, so a full-bleed dark
 * screen would sit between two light bands at the notch and the home indicator.
 * Light chrome merges with those bands; the alternative was repainting the root
 * layout and changing all fifteen other routes to fix one.
 *
 * The app's teal (#0F766E) is unreadable on near-black, so the stage carries a
 * lighter accent. Before/after keep the web portal's amber/green so a customer
 * using both clients reads them the same way — the same reasoning as statusMeta.
 */
const C = {
  void: '#050810',
  panel: '#0D1120',
  accent: '#2DD4BF',
  pin: '#22D3A5',
  pinDead: 'rgba(255,255,255,0.28)',
  before: '#F59E0B',
  after: '#22C55E',
  ink: '#E2E8F0',
  faint: 'rgba(255,255,255,0.45)',
};

const ZOOM = 3;
const ZOOM_MS = 620;
const WALK_MS = 1100;
const SWAP_MS = 480;

/* ── geometry ─────────────────────────────────────────────────────────── */

type PhotoType = 'before' | 'after';

interface WalkPoint extends SldPoint {
  beforeUrl: string | null;
  afterUrl: string | null;
}

interface Box {
  w: number;
  h: number;
  left: number;
  top: number;
}

/**
 * x_percent / y_percent may arrive as strings — commercial_sld_points is not in
 * the schema dump and the column may be `numeric`, which node-postgres returns
 * as text. The web viewer never noticed because it interpolates straight into a
 * CSS `%`; RN needs a real number. Anything unparseable lands at dead centre,
 * which is what the web's `?? 50` did.
 */
export function pointXY(p: SldPoint): { x: number; y: number } {
  const n = (v: number | string | null | undefined) => {
    const f = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
    return Number.isFinite(f) ? Math.min(100, Math.max(0, f)) : 50;
  };
  return { x: n(p.x_percent), y: n(p.y_percent) };
}

/**
 * Where a `contain`-fitted image actually sits inside its container.
 *
 * This is load-bearing, not decoration. Pin coordinates are percentages of the
 * DIAGRAM, and a contained image is letterboxed — so a pin placed against the
 * container instead of the image drifts by exactly the size of the letterbox.
 * The web got this free by wrapping the <img> in an inline-block; RN has to
 * compute it.
 */
function containBox(nat: { w: number; h: number } | null, outer: { w: number; h: number }): Box | null {
  if (!nat || nat.w <= 0 || nat.h <= 0 || outer.w <= 0 || outer.h <= 0) return null;
  const k = Math.min(outer.w / nat.w, outer.h / nat.h);
  const w = nat.w * k;
  const h = nat.h * k;
  return { w, h, left: (outer.w - w) / 2, top: (outer.h - h) / 2 };
}

/* ── component ────────────────────────────────────────────────────────── */

interface Props {
  diagram: SldDiagram;
  points: SldPoint[];
  siteName?: string | null;
  /** Leaves the walkthrough entirely. The route owns what "back" means. */
  onExit: () => void;
}

export default function SldWalkthrough({ diagram, points, siteName, onExit }: Props) {
  const diagramUri = useMemo(() => photoUrl(diagram.diagram_url), [diagram.diagram_url]);

  /** Every point, with its photo paths already resolved to loadable URLs. */
  const all: WalkPoint[] = useMemo(
    () =>
      points.map((p) => ({
        ...p,
        beforeUrl: photoUrl(p.before_url),
        afterUrl: photoUrl(p.after_url),
      })),
    [points],
  );

  /** The ones worth walking to. Arrows and the strip both traverse this. */
  const walk = useMemo(() => all.filter((p) => p.beforeUrl || p.afterUrl), [all]);

  const [view, setView] = useState<'map' | 'photo'>('map');
  const [idx, setIdx] = useState(0);
  const [photoType, setPhotoType] = useState<PhotoType>('before');
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [outer, setOuter] = useState({ w: 0, h: 0 });
  const [mini, setMini] = useState({ w: 0, h: 0 });

  const active: WalkPoint | undefined = walk[idx];

  /* ── animated values ── */
  const zoom = useRef(new Animated.Value(0)).current;   // 0 map at rest → 1 zoomed away
  const photo = useRef(new Animated.Value(0)).current;  // photo layer opacity
  const swap = useRef(new Animated.Value(1)).current;   // 0→1 per photo change
  const pulse = useRef(new Animated.Value(0)).current;  // one loop drives every pin
  const step = useRef(new Animated.Value(0)).current;   // walking limbs
  const walkPos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  /** Shuts the door during a zoom. Two pins tapped 100ms apart would otherwise
   *  both fire, and the second would retarget the zoom mid-flight. */
  const busy = useRef(false);
  /** False until the walker has been dropped on a pin for this visit inward. */
  const placed = useRef(false);

  const [zoomTo, setZoomTo] = useState({ x: 0, y: 0 });
  const [dir, setDir] = useState<'fwd' | 'bwd' | 'fade'>('fwd');
  const [layers, setLayers] = useState<{ prev: string | null; cur: string | null }>({
    prev: null,
    cur: null,
  });

  /* ── the diagram's intrinsic size ──
   *
   * Needed before a single pin can be placed. A failure here is fatal to the
   * walkthrough (pins would be plotted against the wrong rectangle), so it
   * surfaces as an error state rather than a silently crooked map.
   */
  useEffect(() => {
    if (!diagramUri) {
      setFailed(true);
      return;
    }
    let alive = true;
    Image.getSize(
      diagramUri,
      (w, h) => alive && setNat({ w, h }),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [diagramUri]);

  /** Warm the cache so stepping between points never shows an empty frame. */
  useEffect(() => {
    walk.forEach((p) => {
      if (p.beforeUrl) Image.prefetch(p.beforeUrl).catch(() => {});
      if (p.afterUrl) Image.prefetch(p.afterUrl).catch(() => {});
    });
  }, [walk]);

  /** One pulse loop for all pins — N looping animations would be N too many. */
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
        Animated.delay(700),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const imgBox = containBox(nat, outer);
  const miniBox = containBox(nat, mini);

  /* ── walking ──
   *
   * Runs for WALK_MS after arriving anywhere: limbs swing, and the mini-map
   * figure slides from the last pin to this one over the same interval, so the
   * two read as one movement.
   */
  const startWalking = useCallback(() => {
    step.stopAnimation();
    step.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(step, { toValue: 1, duration: 200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(step, { toValue: 0, duration: 200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    const t = setTimeout(() => {
      loop.stop();
      step.setValue(0);
    }, WALK_MS);
    return () => {
      clearTimeout(t);
      loop.stop();
    };
  }, [step]);

  /**
   * Put the mini-map figure on the active pin.
   *
   * The first placement after entering a point JUMPS, every later one WALKS.
   * Tapping a pin means you zoomed straight to it — animating a walk there
   * would be a walk you did not take, and it starts from wherever the figure
   * was left, which on a fresh open is the corner. Arrowing to the next point
   * is a walk, and animates.
   */
  useEffect(() => {
    if (!miniBox || !active) return;
    const { x, y } = pointXY(active);
    const to = {
      x: miniBox.left + (x / 100) * miniBox.w,
      y: miniBox.top + (y / 100) * miniBox.h,
    };
    if (!placed.current) {
      walkPos.setValue(to);
      placed.current = true;
      return;
    }
    Animated.timing(walkPos, {
      toValue: to,
      duration: WALK_MS,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, mini.w, mini.h, nat?.w, nat?.h]);

  /** Cross-fade whenever the shown photo changes. */
  const currentUri = active ? (photoType === 'before' ? active.beforeUrl : active.afterUrl) : null;
  useEffect(() => {
    setLayers((l) => (l.cur === currentUri ? l : { prev: l.cur, cur: currentUri }));
    swap.setValue(0);
    Animated.timing(swap, {
      toValue: 1,
      duration: SWAP_MS,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [currentUri, swap]);

  /* ── transitions ── */

  const enterPoint = useCallback(
    (target: number) => {
      const p = walk[target];
      if (!p || !imgBox || busy.current) return;
      busy.current = true;

      // Translate the pin to the centre, then scale about it — RN has no
      // transform-origin, so t = -s·(pin − centre) is the whole trick.
      const { x, y } = pointXY(p);
      const px = imgBox.left + (x / 100) * imgBox.w;
      const py = imgBox.top + (y / 100) * imgBox.h;
      setZoomTo({ x: -(px - outer.w / 2) * ZOOM, y: -(py - outer.h / 2) * ZOOM });

      setIdx(target);
      setPhotoType(p.beforeUrl ? 'before' : 'after');
      setDir('fwd');

      Animated.timing(zoom, {
        toValue: 1,
        duration: ZOOM_MS,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      }).start(({ finished }) => {
        busy.current = false;
        if (!finished) return;
        setView('photo');
        startWalking();
        Animated.timing(photo, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
    },
    [walk, imgBox, outer.w, outer.h, zoom, photo, startWalking],
  );

  const backToMap = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    // Next entry is a fresh arrival, so the walker jumps to it rather than
    // strolling across the map from whichever point this one was.
    placed.current = false;
    Animated.timing(photo, {
      toValue: 0,
      duration: 260,
      easing: Easing.in(Easing.ease),
      useNativeDriver: true,
    }).start(({ finished }) => {
      busy.current = false;
      if (!finished) return;
      setView('map');
      Animated.timing(zoom, {
        toValue: 0,
        duration: ZOOM_MS,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      }).start();
    });
  }, [photo, zoom]);

  const goTo = useCallback(
    (target: number, d: 'fwd' | 'bwd') => {
      const p = walk[target];
      if (!p) return;
      setDir(d);
      setIdx(target);
      setPhotoType(p.beforeUrl ? 'before' : 'after');
      startWalking();
    },
    [walk, startWalking],
  );

  /* ── error + empty states ── */

  if (failed || !diagramUri) {
    return (
      <View style={local.fill}>
        <Header siteName={siteName} title={diagram.title} onExit={onExit} />
        <View style={local.centre}>
          <MapIcon size={26} color={palette.mutedLight} />
          <Text style={local.errTitle}>The diagram could not be loaded</Text>
          <Text style={local.errBody}>
            The visit photos are still on the previous screen — this only affects the map view.
          </Text>
        </View>
      </View>
    );
  }

  if (!nat) {
    return (
      <View style={local.fill}>
        <Header siteName={siteName} title={diagram.title} onExit={onExit} />
        <View style={local.centre}>
          <ActivityIndicator size="large" color={ACCENT_DEFAULT} />
        </View>
      </View>
    );
  }

  /* ── map layer ── */

  const mapStyle = {
    opacity: zoom.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 0.55, 0] }),
    transform: [
      { translateX: zoom.interpolate({ inputRange: [0, 1], outputRange: [0, zoomTo.x] }) },
      { translateY: zoom.interpolate({ inputRange: [0, 1], outputRange: [0, zoomTo.y] }) },
      { scale: zoom.interpolate({ inputRange: [0, 1], outputRange: [1, ZOOM] }) },
    ],
  };

  const swapScale = swap.interpolate({
    inputRange: [0, 1],
    outputRange: [dir === 'fade' ? 1 : dir === 'fwd' ? 0.86 : 1.14, 1],
  });

  return (
    <View style={local.fill}>
      <Header siteName={siteName} title={diagram.title} onExit={onExit} />

      <View style={local.stage}>
        {/* ── MAP ── */}
        <Animated.View
          pointerEvents={view === 'map' ? 'auto' : 'none'}
          style={[local.layer, mapStyle]}
          onLayout={(e: LayoutChangeEvent) => {
            const { width, height } = e.nativeEvent.layout;
            setOuter({ w: width, h: height });
          }}
        >
          {imgBox ? (
            <View style={{ position: 'absolute', ...boxStyle(imgBox) }}>
              <Image source={{ uri: diagramUri }} style={local.diagram} resizeMode="contain" />
              {all.map((p) => (
                <Pin
                  key={p.id}
                  point={p}
                  box={imgBox}
                  pulse={pulse}
                  isActive={view === 'photo' && active?.id === p.id}
                  onPress={() => {
                    const target = walk.findIndex((w) => w.id === p.id);
                    if (target >= 0) enterPoint(target);
                  }}
                />
              ))}
            </View>
          ) : null}
        </Animated.View>

        {/* ── PHOTO ── */}
        <Animated.View
          pointerEvents={view === 'photo' ? 'auto' : 'none'}
          style={[
            local.layer,
            local.photoLayer,
            { opacity: photo, transform: [{ scale: photo.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1] }) }] },
          ]}
        >
          {layers.prev && layers.prev !== layers.cur ? (
            <Animated.Image
              source={{ uri: layers.prev }}
              style={[local.shot, { opacity: swap.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
              resizeMode="contain"
            />
          ) : null}
          {layers.cur ? (
            <Animated.Image
              source={{ uri: layers.cur }}
              style={[local.shot, { opacity: swap, transform: [{ scale: swapScale }] }]}
              resizeMode="contain"
            />
          ) : null}

          {/* arrows */}
          {idx > 0 ? (
            <TouchableOpacity style={[local.arrow, { left: 0 }]} onPress={() => goTo(idx - 1, 'bwd')} activeOpacity={0.7}>
              <View style={local.arrowDisc}>
                <ChevronLeft size={24} color="#fff" />
              </View>
            </TouchableOpacity>
          ) : null}
          {idx < walk.length - 1 ? (
            <TouchableOpacity style={[local.arrow, { right: 0 }]} onPress={() => goTo(idx + 1, 'fwd')} activeOpacity={0.7}>
              <View style={local.arrowDisc}>
                <ChevronRight size={24} color="#fff" />
              </View>
            </TouchableOpacity>
          ) : null}

          {/* before / after */}
          <View style={local.toggles}>
            {active?.beforeUrl ? (
              <TouchableOpacity
                onPress={() => {
                  setDir('fade');
                  setPhotoType('before');
                }}
                style={[local.toggle, photoType === 'before' && { backgroundColor: C.before, borderColor: C.before }]}
              >
                <Text style={[local.toggleText, photoType === 'before' && { color: '#0B0B0B' }]}>Before</Text>
              </TouchableOpacity>
            ) : null}
            {active?.afterUrl ? (
              <TouchableOpacity
                onPress={() => {
                  setDir('fade');
                  setPhotoType('after');
                }}
                style={[local.toggle, photoType === 'after' && { backgroundColor: C.after, borderColor: C.after }]}
              >
                <Text style={[local.toggleText, photoType === 'after' && { color: '#0B0B0B' }]}>After</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* mini-map */}
          <View style={local.mini} onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setMini({ w: width, h: height });
          }}>
            <Image source={{ uri: diagramUri }} style={local.miniImg} resizeMode="contain" />
            {miniBox
              ? all.map((p) => {
                  const { x, y } = pointXY(p);
                  return (
                    <View
                      key={p.id}
                      style={[
                        local.miniDot,
                        {
                          left: miniBox.left + (x / 100) * miniBox.w - 2,
                          top: miniBox.top + (y / 100) * miniBox.h - 2,
                        },
                      ]}
                    />
                  );
                })
              : null}
            {miniBox ? <Walker pos={walkPos} step={step} /> : null}
            <Text style={local.miniLabel}>YOU ARE HERE</Text>
          </View>

          {/* bottom bar */}
          <View style={local.bar}>
            <TouchableOpacity onPress={backToMap} style={local.barBack} activeOpacity={0.7}>
              <MapIcon size={14} color={C.accent} />
              <Text style={local.barBackText}>Map</Text>
            </TouchableOpacity>
            <Text style={local.barTitle} numberOfLines={1}>
              {active?.label || `Point ${active?.index ?? ''}`}
            </Text>
            <Text style={local.barCount}>
              {idx + 1} / {walk.length}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* ── point strip ──
        *
        * Not in the web version. On a phone the pins can sit closer together
        * than a fingertip is wide, and a customer should never have to pinch a
        * technical drawing to reach one. Every walkable point is one tap away
        * here regardless of how the diagram crowds them.
        */}
      {view === 'map' ? (
        <View style={local.stripWrap}>
          <Text style={local.stripHint}>
            {walk.length} {walk.length === 1 ? 'point' : 'points'} photographed on this visit
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.strip}>
            {walk.map((p, i) => (
              <TouchableOpacity key={p.id} style={local.chip} onPress={() => enterPoint(i)} activeOpacity={0.75}>
                <View style={local.chipNum}>
                  <Text style={local.chipNumText}>{p.index}</Text>
                </View>
                <Text style={local.chipText} numberOfLines={1}>
                  {p.label || `Point ${p.index}`}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

/* ── pieces ───────────────────────────────────────────────────────────── */

function Header({
  siteName,
  title,
  onExit,
}: {
  siteName?: string | null;
  title: string | null;
  onExit: () => void;
}) {
  return (
    <View style={local.header}>
      <View style={{ flex: 1 }}>
        <Text style={local.headerTitle} numberOfLines={1}>
          {siteName || 'Site'}
        </Text>
        <Text style={local.headerSub} numberOfLines={1}>
          {title || 'Single-line diagram'}
        </Text>
      </View>
      <TouchableOpacity onPress={onExit} style={local.close} activeOpacity={0.7}>
        <X size={18} color={palette.inkSoft} />
      </TouchableOpacity>
    </View>
  );
}

function Pin({
  point,
  box,
  pulse,
  isActive,
  onPress,
}: {
  point: WalkPoint;
  box: Box;
  pulse: Animated.Value;
  isActive: boolean;
  onPress: () => void;
}) {
  const has = Boolean(point.beforeUrl || point.afterUrl);
  const { x, y } = pointXY(point);

  // The touch target is 44 square even though the dot is 26 — the dot is sized
  // for the drawing, the target is sized for a finger.
  const TARGET = 44;

  return (
    <TouchableOpacity
      disabled={!has}
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        position: 'absolute',
        left: (x / 100) * box.w - TARGET / 2,
        top: (y / 100) * box.h - TARGET / 2,
        width: TARGET,
        height: TARGET,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {has ? (
        <Animated.View
          style={[
            local.pulse,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.9] }) }],
            },
          ]}
        />
      ) : null}
      <View
        style={[
          local.pin,
          { backgroundColor: has ? C.pin : C.pinDead },
          isActive && { borderColor: '#fff', borderWidth: 2 },
        ]}
      >
        <Text style={[local.pinText, !has && { color: 'rgba(0,0,0,0.45)' }]}>{point.index}</Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * The "you are here" walker.
 *
 * Each limb hangs inside a 0×0 anchor pinned at its joint. A View rotates about
 * its own centre, and the centre of a zero-sized view IS the joint — which is
 * how you get a shoulder to swing an arm without transform-origin.
 */
function Walker({ pos, step }: { pos: Animated.ValueXY; step: Animated.Value }) {
  const swing = (from: number, to: number) =>
    step.interpolate({ inputRange: [0, 1], outputRange: [`${from}deg`, `${to}deg`] });

  const Limb = ({ x, y, len, rotate }: { x: number; y: number; len: number; rotate: Animated.AnimatedInterpolation<string> }) => (
    <Animated.View style={{ position: 'absolute', left: x, top: y, width: 0, height: 0, transform: [{ rotate }] }}>
      <View style={{ position: 'absolute', left: -1, top: 0, width: 2, height: len, backgroundColor: C.accent, borderRadius: 1 }} />
    </Animated.View>
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -9,
        top: -20,
        width: 18,
        height: 24,
        transform: [
          { translateX: pos.x },
          { translateY: pos.y },
          { translateY: step.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] }) },
        ],
      }}
    >
      <View style={{ position: 'absolute', left: 6, top: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: C.accent }} />
      <View style={{ position: 'absolute', left: 8, top: 6, width: 2, height: 9, backgroundColor: C.accent, borderRadius: 1 }} />
      <Limb x={9} y={8} len={7} rotate={swing(-32, 30)} />
      <Limb x={9} y={8} len={7} rotate={swing(30, -32)} />
      <Limb x={9} y={15} len={8} rotate={swing(28, -30)} />
      <Limb x={9} y={15} len={8} rotate={swing(-30, 28)} />
    </Animated.View>
  );
}

const boxStyle = (b: Box) => ({ left: b.left, top: b.top, width: b.w, height: b.h });

const local = StyleSheet.create({
  fill: { flex: 1, backgroundColor: palette.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 36 },
  errTitle: { fontSize: 15, fontWeight: '800', color: palette.ink },
  errBody: { fontSize: 13, lineHeight: 19, color: palette.mutedLight, textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: palette.borderSubtle,
  },
  headerTitle: { fontSize: 15, fontWeight: '900', color: palette.ink },
  headerSub: { fontSize: 11.5, fontWeight: '600', color: palette.mutedLight, marginTop: 1 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.borderSubtle,
  },

  stage: { flex: 1, backgroundColor: C.panel, overflow: 'hidden' },
  // RN 0.86 no longer exposes StyleSheet.absoluteFillObject in its types, and
  // absoluteFill is a registered style that cannot be spread — so, by hand.
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  photoLayer: { backgroundColor: C.void },
  diagram: { width: '100%', height: '100%' },
  shot: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },

  pulse: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: C.pin },
  pin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.55)',
  },
  pinText: { fontSize: 11, fontWeight: '900', color: '#06231C' },

  arrow: { position: 'absolute', top: 0, bottom: 0, width: '22%', alignItems: 'center', justifyContent: 'center' },
  arrowDisc: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },

  toggles: { position: 'absolute', top: 14, alignSelf: 'center', flexDirection: 'row', gap: 8 },
  toggle: {
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  toggleText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.78)' },

  mini: {
    position: 'absolute',
    left: 12,
    bottom: 66,
    width: 116,
    height: 84,
    borderRadius: 12,
    backgroundColor: 'rgba(5,8,16,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  miniImg: { width: '100%', height: '100%', opacity: 0.45 },
  miniDot: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)' },
  miniLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 3,
    textAlign: 'center',
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: C.accent,
  },

  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: 'rgba(5,8,16,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  barBack: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  barBackText: { fontSize: 12, fontWeight: '800', color: C.accent },
  barTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: '#fff' },
  barCount: { fontSize: 11, fontWeight: '700', color: C.faint },

  stripWrap: { paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: palette.borderSubtle },
  stripHint: { fontSize: 11, fontWeight: '700', color: palette.mutedLight, paddingHorizontal: 18, marginBottom: 8 },
  strip: { paddingHorizontal: 18, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 6,
    paddingRight: 13,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    maxWidth: 190,
  },
  chipNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.pin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipNumText: { fontSize: 10, fontWeight: '900', color: '#06231C' },
  chipText: { fontSize: 12.5, fontWeight: '700', color: palette.inkSoft, flexShrink: 1 },
});
