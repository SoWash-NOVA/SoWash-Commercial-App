// app/login.tsx
//
// Email + password sign-in. There is no self-registration: commercial portal
// accounts are created by SoWash and linked to a commercial_clients row, so
// this screen offers no "sign up" path by design.
//
// The backend distinguishes three failures and words each one usefully — bad
// credentials, a staff account, an account with no client link. We show its
// message verbatim rather than flattening them into "login failed".
//
// Look (2026-10-05, from a reference the user shared): a white page with big
// organic wave shapes in the corners, an illustration in the hero, underline
// inputs (label on the left, a small action on the right) and pill gradient
// buttons. The reference's orange/teal are swapped for the SoWash brand GREEN
// (leading) and sky BLUE. Colours are fixed brand colours, not the
// user-selectable accent (nobody is signed in yet). The illustration — a general
// one (a laptop with the desktop dashboard + a phone with the mobile app, chat bubble,
// check badge; no solar imagery, on purpose)
// — is drawn in SVG, so no image ships.
//
// Layout rule learned the hard way: nothing here may change size in response to
// the keyboard — on Android that dismisses it as soon as a field is tapped. Size
// depends only on the physical screen (measured with the keyboard closed); when the
// keyboard opens, empty space is appended BELOW the content and the page scrolls the
// form card above the keys (no KeyboardAvoidingView). With the keyboard closed the page
// is sized to exactly one screen and scrolling is off, so there is no stray scroll.
// The focus underline is an absolutely-positioned layer, so it can't affect layout.
// The screen draws edge to edge (see Shell in app/_layout.tsx), so the insets are
// added back below as padding on the content.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Dimensions,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, Line, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';
import { ArrowRight, Check, Lock, TriangleAlert } from 'lucide-react-native';
import { palette } from '../src/theme';
import { useAuth } from '../src/auth/AuthContext';
import { BRAND_BLUE, BRAND_GREEN, BRAND_GREEN_DEEP, BRAND_INK } from '../src/brand';

const INK = BRAND_INK;
const BLUE_DEEP = '#0E78B5';
const BLUE_LIGHT = '#7FD3FA';
const GREEN_LIGHT = '#D2FF92';
const GREEN_DARK = '#2E9E00';
const LOGO = require('../assets/sowash-logo.png');
const LOGO_RATIO = 248 / 1004;

type Field = 'email' | 'password' | null;

/** Top wave shapes. Drawn in a 400×360 box stretched to the hero (preserveAspectRatio none). */
function TopWaves({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 400 360" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgGradient id="g1" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={GREEN_LIGHT} />
          <Stop offset="0.55" stopColor={BRAND_GREEN} />
          <Stop offset="1" stopColor="#3DB800" />
        </SvgGradient>
        <SvgGradient id="g2" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GREEN_LIGHT} stopOpacity="0.9" />
          <Stop offset="1" stopColor={BRAND_GREEN} stopOpacity="0.55" />
        </SvgGradient>
        <SvgGradient id="b1" x1="1" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BLUE_DEEP} />
          <Stop offset="1" stopColor={BLUE_LIGHT} />
        </SvgGradient>
      </Defs>
      {/* soft lime layer behind the main green wave */}
      <Path d="M0 0 H310 C292 52 240 102 186 108 C118 116 96 172 84 230 C74 282 42 318 0 336 Z" fill="url(#g2)" />
      {/* main green wave, top-left */}
      <Path d="M0 0 H262 C236 34 204 70 154 80 C94 92 62 132 52 190 C44 238 22 268 0 284 Z" fill="url(#g1)" />
      {/* blue wave down the right side */}
      <Path d="M400 0 V306 C372 324 330 306 330 264 C330 218 372 204 362 152 C352 102 302 92 302 42 C302 20 312 8 324 0 Z" fill="url(#b1)" />
      {/* a few floating dots */}
      <Circle cx="300" cy="300" r="7" fill={BRAND_GREEN} opacity="0.8" />
      <Circle cx="78" cy="318" r="5" fill={BRAND_BLUE} opacity="0.7" />
      <Circle cx="240" cy="40" r="4" fill="#fff" opacity="0.8" />
    </Svg>
  );
}

/**
 * The hero illustration — deliberately general (no solar/industry imagery): a laptop
 * showing the desktop dashboard with a phone in front of it showing the mobile app
 * (the same service on both screens), plus a chat bubble, a check badge and sparkles.
 */
function Illustration({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * (180 / 240)} viewBox="0 0 240 180">
      <Defs>
        <SvgGradient id="screen" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#2AA9E3" />
          <Stop offset="1" stopColor={BLUE_DEEP} />
        </SvgGradient>
        <SvgGradient id="bubble" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#9BF53A" />
          <Stop offset="1" stopColor="#3DB800" />
        </SvgGradient>
        <SvgGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BRAND_GREEN} stopOpacity="0.55" />
          <Stop offset="1" stopColor={BRAND_GREEN} stopOpacity="0.05" />
        </SvgGradient>
      </Defs>
      {/* ground shadow */}
      <Ellipse cx="118" cy="168" rx="104" ry="7" fill={INK} opacity="0.08" />

      {/* ── laptop: the desktop dashboard ── */}
      <Rect x="14" y="44" width="160" height="104" rx="8" fill={INK} />
      <Rect x="20" y="50" width="148" height="92" rx="3" fill="#fff" />
      <Circle cx="94" cy="47" r="1.3" fill="#3b566a" />
      {/* top bar */}
      <Rect x="20" y="50" width="148" height="11" fill="url(#screen)" />
      <Circle cx="27" cy="55.5" r="2" fill="#fff" opacity="0.9" />
      <Rect x="33" y="54" width="24" height="3" rx="1.5" fill="#fff" opacity="0.85" />
      <Circle cx="160" cy="55.5" r="2.4" fill="#fff" opacity="0.9" />
      {/* sidebar */}
      <Rect x="20" y="61" width="26" height="81" fill="#eef4f8" />
      <Rect x="25" y="68" width="16" height="4" rx="2" fill={BRAND_BLUE} />
      <Rect x="25" y="77" width="16" height="3" rx="1.5" fill="#c9d6de" />
      <Rect x="25" y="85" width="16" height="3" rx="1.5" fill="#c9d6de" />
      <Rect x="25" y="93" width="16" height="3" rx="1.5" fill="#c9d6de" />
      {/* KPI cards */}
      <Rect x="52" y="67" width="34" height="18" rx="3" fill="#E9FBD3" />
      <Rect x="56" y="71" width="14" height="3" rx="1.5" fill="#3DB800" />
      <Rect x="56" y="77" width="22" height="4" rx="2" fill={INK} opacity="0.7" />
      <Rect x="90" y="67" width="34" height="18" rx="3" fill="#E3F4FC" />
      <Rect x="94" y="71" width="14" height="3" rx="1.5" fill={BRAND_BLUE} />
      <Rect x="94" y="77" width="22" height="4" rx="2" fill={INK} opacity="0.7" />
      <Rect x="128" y="67" width="34" height="18" rx="3" fill="#E9FBD3" />
      <Rect x="132" y="71" width="14" height="3" rx="1.5" fill="#3DB800" />
      <Rect x="132" y="77" width="22" height="4" rx="2" fill={INK} opacity="0.7" />
      {/* line chart */}
      <Path d="M54 130 L70 118 L84 122 L100 104 L116 110 L132 96 L150 100 L150 136 L54 136 Z" fill="url(#area)" />
      <Path d="M54 130 L70 118 L84 122 L100 104 L116 110 L132 96 L150 100" stroke="#3DB800" strokeWidth="2.2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Line x1="52" y1="136" x2="162" y2="136" stroke="#dfe8ee" strokeWidth="1.2" />
      {/* base */}
      <Path d="M2 148 H186 L180 156 H8 Z" fill="#b9c9d3" />
      <Rect x="80" y="148" width="28" height="3" rx="1.5" fill="#97abb8" />

      {/* ── phone in front: the mobile app ── */}
      <Rect x="160" y="68" width="52" height="96" rx="10" fill={INK} />
      <Rect x="164" y="74" width="44" height="84" rx="6" fill="#fff" />
      <Rect x="179" y="70.5" width="14" height="2" rx="1" fill="#3b566a" />
      <Rect x="164" y="74" width="44" height="20" rx="6" fill="url(#screen)" />
      <Rect x="164" y="86" width="44" height="8" fill="url(#screen)" />
      <Circle cx="172" cy="84" r="3.5" fill="#fff" opacity="0.9" />
      <Rect x="178" y="82" width="20" height="3" rx="1.5" fill="#fff" opacity="0.9" />
      {/* bars */}
      <Rect x="169" y="118" width="6" height="14" rx="1.5" fill={BRAND_BLUE} />
      <Rect x="178" y="110" width="6" height="22" rx="1.5" fill={BRAND_GREEN} />
      <Rect x="187" y="114" width="6" height="18" rx="1.5" fill={BRAND_BLUE} opacity="0.7" />
      <Rect x="196" y="104" width="6" height="28" rx="1.5" fill="#3DB800" />
      <Rect x="169" y="99" width="26" height="3" rx="1.5" fill="#c9d6de" />
      <Rect x="169" y="139" width="34" height="4" rx="2" fill="#dfe8ee" />
      <Rect x="169" y="147" width="22" height="4" rx="2" fill="#dfe8ee" />

      {/* chat bubble, top-left */}
      <Rect x="8" y="6" width="58" height="30" rx="15" fill="url(#bubble)" />
      <Path d="M46 33 L58 46 L38 35 Z" fill="#3DB800" />
      <Circle cx="25" cy="21" r="3.4" fill="#fff" />
      <Circle cx="37" cy="21" r="3.4" fill="#fff" />
      <Circle cx="49" cy="21" r="3.4" fill="#fff" />
      {/* check badge, top-right */}
      <Circle cx="210" cy="40" r="16" fill="#fff" stroke={BRAND_BLUE} strokeWidth="2.6" />
      <Path d="M203 40 L208.5 45.5 L218 35" stroke={BLUE_DEEP} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* sparkles */}
      <Path d="M150 6 L153 16 L163 19 L153 22 L150 32 L147 22 L137 19 L147 16 Z" fill={BRAND_GREEN} />
      <Path d="M100 18 L102 23 L107 25 L102 27 L100 32 L98 27 L93 25 L98 23 Z" fill={BRAND_BLUE} opacity="0.85" />
      <Circle cx="228" cy="96" r="3.5" fill={BRAND_GREEN} opacity="0.8" />
    </Svg>
  );
}

/** Bottom corner shapes: a green half-circle on the left, a blue wave on the right. */
function BottomWaves({ width }: { width: number }) {
  const h = 150;
  return (
    <Svg width={width} height={h} viewBox="0 0 400 150" preserveAspectRatio="none">
      <Defs>
        <SvgGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={GREEN_LIGHT} />
          <Stop offset="1" stopColor="#3DB800" />
        </SvgGradient>
        <SvgGradient id="bb" x1="1" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={BLUE_DEEP} />
          <Stop offset="1" stopColor={BLUE_LIGHT} />
        </SvgGradient>
      </Defs>
      <Path d="M400 150 V40 C376 30 352 58 346 88 C340 118 310 128 280 150 Z" fill="url(#bb)" opacity="0.9" />
      <Path d="M0 150 V70 C40 66 92 94 108 150 Z" fill="url(#bg)" />
    </Svg>
  );
}

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Field>(null);

  const passwordRef = useRef<TextInput>(null);

  const { width } = useWindowDimensions();
  // The shell gives the login no safe-area padding (so the waves can reach under the
  // status bar and nav bar); the insets come back here as padding on the CONTENT only.
  const insets = useSafeAreaInsets();
  // Fixed physical screen size: the window height shrinks when the keyboard opens, and
  // nothing on this screen may resize with it.
  const screen = Dimensions.get('screen');
  const compact = screen.height < 700;
  const scrollRef = useRef<ScrollView>(null);
  /** The view the scroll view fills — measured in the window to find the keyboard overlap. */
  const frameRef = useRef<View>(null);

  // ── fit-to-screen: no scroll when the keyboard is closed ──
  // The hero takes whatever height is left after the form and the footer, so the page is
  // exactly one screen tall. Every input here is measured with the keyboard CLOSED (the
  // viewport only ever grows; the body/footer don't depend on the keyboard), so opening
  // the keyboard never re-sizes anything — the layout rule above still holds.
  const [viewportH, setViewportH] = useState(0);
  const [bodyH, setBodyH] = useState(0);
  const [footerH, setFooterH] = useState(0);
  const bodyY = useRef(0);
  const card = useRef({ y: 0, h: 0 });
  const PAD_BOTTOM = 20 + insets.bottom;
  const MIN_GAP = 12;
  const minHero = insets.top + (compact ? 150 : 190);
  const maxHero = insets.top + Math.min(screen.height * (compact ? 0.34 : 0.4), 380);
  const measured = viewportH > 0 && bodyH > 0 && footerH > 0;
  const heroHeight = Math.round(
    measured
      ? Math.max(minHero, Math.min(maxHero, viewportH - bodyH - footerH - PAD_BOTTOM - MIN_GAP))
      : Math.min(screen.height * (compact ? 0.32 : 0.38), 360) + insets.top,
  );
  const contentFits = measured && heroHeight + bodyH + footerH + PAD_BOTTOM + MIN_GAP <= viewportH + 0.5;
  const illoTop = insets.top + (compact ? 14 : 28);
  // the illustration shrinks with the hero so it never gets cut off
  const illoWidth = Math.max(120, Math.min(width * 0.6, compact ? 200 : 250, ((heroHeight - illoTop - 14) * 240) / 180));

  // ── keyboard: lift the email/password card above it ──
  // No KeyboardAvoidingView (it under-compensates on Android edge-to-edge — see
  // src/components/KeyboardScreen.tsx). Instead: measure how far the keyboard reaches into
  // the scroll view, add that much empty space at the END of the content (appending space
  // never moves the inputs), and scroll so the whole card sits just above the keys.
  const [kbOverlap, setKbOverlap] = useState(0);
  // separate from the overlap: if Android resizes the window instead (adjustResize), the
  // overlap is 0 but the keyboard is still up and the card still has to be lifted.
  const [kbOpen, setKbOpen] = useState(false);
  /** The scroll view's CURRENT height (shrinks if the window is resized for the keyboard). */
  const curH = useRef(0);
  const kbOpenRef = useRef(false);
  const lastBodyH = useRef(0);
  const liftForm = useCallback(
    (overlap: number) => {
      const visible = (curH.current || viewportH) - overlap;
      const top = bodyY.current + card.current.y;
      const bottom = top + card.current.h;
      // the whole card if it fits above the keyboard, otherwise its top edge
      const y = Math.max(0, Math.min(bottom - visible + 16, top - 8));
      scrollRef.current?.scrollTo({ y, animated: true });
    },
    [viewportH],
  );
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: { endCoordinates: { height: number; screenY: number } }) => {
      if (!e.endCoordinates.height) return;
      frameRef.current?.measureInWindow((_x, y, _w, h) => {
        const overlap = Math.max(0, Math.min(y + h - e.endCoordinates.screenY, e.endCoordinates.height));
        kbOpenRef.current = true;
        setKbOpen(true);
        setKbOverlap(overlap);
        // after the spacer has been laid out
        setTimeout(() => liftForm(overlap), 120);
      });
    };
    const a = Keyboard.addListener(showEvt, onShow as never);
    const b = Keyboard.addListener(hideEvt, () => {
      kbOpenRef.current = false;
      setKbOpen(false);
      setKbOverlap(0);
      if (lastBodyH.current) setBodyH(lastBodyH.current);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    const c = Keyboard.addListener('keyboardDidChangeFrame' as never, ((e: { endCoordinates: { height: number; screenY: number } }) => {
      if (e.endCoordinates.height > 0) onShow(e);
    }) as never);
    return () => {
      a.remove();
      b.remove();
      c.remove();
    };
  }, [liftForm]);
  const logoWidth = Math.min(width - 120, compact ? 190 : 230);
  const formWidth = Math.min(width - 40, 460);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;
  const emailLooksValid = /^\S+@\S+\.\S+$/.test(email.trim());

  // ── entrance: the hero fades in, then the form rises ──
  const heroIn = useRef(new Animated.Value(0)).current;
  const formIn = useRef(new Animated.Value(0)).current;
  // ── a slow float on the illustration (native-driven, zero JS per frame) ──
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.stagger(140, [
      Animated.timing(heroIn, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(formIn, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [heroIn, formIn, float]);

  // ── button: a subtle press-in ──
  const press = useRef(new Animated.Value(0)).current;
  const pressTo = (v: number) => Animated.timing(press, { toValue: v, duration: 90, useNativeDriver: true }).start();

  const submit = useCallback(async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      // No navigation here: _layout redirects on the status change, so there is
      // exactly one place that decides where a signed-in user lands.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  }, [canSubmit, email, password, signIn]);

  /** Underline field: label left, a small action right, the input, then the line. */
  const renderField = (
    f: Exclude<Field, null>,
    label: string,
    right: React.ReactNode,
    input: React.ReactNode,
    extraStyle?: object,
  ) => (
    <View style={[local.field, extraStyle]}>
      <View style={local.fieldTop}>
        <Text style={[local.label, focus === f && { color: BRAND_GREEN_DEEP }]}>{label}</Text>
        {right}
      </View>
      {input}
      <View style={local.underline}>
        {/* focus line — absolute, so turning it on/off never changes layout */}
        <LinearGradient
          pointerEvents="none"
          colors={[BRAND_GREEN, BRAND_BLUE]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[local.underlineFocus, { opacity: focus === f ? 1 : 0 }]}
        />
      </View>
    </View>
  );

  return (
    <View ref={frameRef} collapsable={false} style={local.screen}>
      {/* Bottom corner shapes, pinned to the physical screen bottom (top offset, not
          bottom: 0, so they don't ride up with the keyboard). */}
      <View pointerEvents="none" style={[local.bottomShapes, { top: screen.height - 150 }]}>
        <BottomWaves width={screen.width} />
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[local.content, { paddingBottom: PAD_BOTTOM }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // fits the screen exactly when the keyboard is closed, so no stray scroll/overscroll
        scrollEnabled={kbOpen || !contentFits}
        bounces={false}
        overScrollMode="never"
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          curH.current = h;
          // only ever grows: the keyboard never shrinks this view, but be safe if it does
          setViewportH((v) => (h > v ? h : v));
        }}
      >
        {/* ── Hero: waves + illustration ─────────────────────────── */}
        <Animated.View style={[local.hero, { height: heroHeight, opacity: heroIn }]}>
          <TopWaves width={width} height={heroHeight} />
          <Animated.View
            style={{
              marginTop: illoTop,
              transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) }],
            }}
          >
            <Illustration width={illoWidth} />
          </Animated.View>
        </Animated.View>

        {/* ── Brand + form ─────────────────────────────────────── */}
        <Animated.View
          style={[
            local.body,
            {
              width: formWidth,
              opacity: formIn,
              transform: [{ translateY: formIn.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            },
          ]}
          onLayout={(e) => {
            bodyY.current = e.nativeEvent.layout.y;
            lastBodyH.current = e.nativeEvent.layout.height;
            // while the keyboard is open nothing may re-size (an error box appearing after a
            // failed sign-in); the new height is applied when the keyboard closes.
            if (!kbOpenRef.current) setBodyH(e.nativeEvent.layout.height);
          }}
        >
          <View style={local.brand}>
            <Image
              source={LOGO}
              resizeMode="contain"
              style={{ width: logoWidth, height: logoWidth * LOGO_RATIO }}
              accessibilityLabel="SoWash Maintenance Solutions"
            />
            <Text style={local.tagline}>SoWash Commercial App</Text>
          </View>

          <View
            style={local.card}
            onLayout={(e) => {
              card.current = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
            }}
          >
            <Text style={local.welcome}>Welcome back</Text>
            <Text style={local.welcomeSub}>Sign in with the email SoWash set your account up with.</Text>

            {error ? (
              <View style={local.errorBox}>
                <TriangleAlert size={16} color={palette.danger} />
                <Text style={local.errorText}>{error}</Text>
              </View>
            ) : null}

            {renderField(
              'email',
              'Email',
              emailLooksValid ? (
                <View style={local.checkDot}>
                  <Check size={11} color="#fff" strokeWidth={3} />
                </View>
              ) : null,
              <TextInput
                style={local.input}
                placeholder="you@company.com"
                placeholderTextColor="#a3b4c0"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocus('email')}
                onBlur={() => setFocus((f) => (f === 'email' ? null : f))}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                editable={!busy}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />,
              { marginTop: 18 },
            )}

            {renderField(
              'password',
              'Password',
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={10}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Text style={local.fieldAction}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>,
              <TextInput
                ref={passwordRef}
                style={local.input}
                placeholder="Enter your password"
                placeholderTextColor="#a3b4c0"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('password')}
                onBlur={() => setFocus((f) => (f === 'password' ? null : f))}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                returnKeyType="go"
                editable={!busy}
                onSubmitEditing={submit}
              />,
              { marginTop: 18 },
            )}

            {/* Pill gradient button, arrow on the right — as in the reference. */}
            <Pressable
              onPress={submit}
              onPressIn={() => pressTo(1)}
              onPressOut={() => pressTo(0)}
              disabled={!canSubmit}
              style={[local.btnWrap, { opacity: canSubmit ? 1 : 0.55 }]}
            >
              <Animated.View style={{ transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }] }}>
                <LinearGradient colors={['#2AA9E3', BLUE_DEEP]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={local.btn}>
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={local.btnText}>Sign in</Text>
                      <View style={local.arrowChip}>
                        <ArrowRight size={17} color="#fff" />
                      </View>
                    </>
                  )}
                </LinearGradient>
              </Animated.View>
            </Pressable>

            {/* The API is served over HTTPS (https://app.sowashusa.com), so this is true as written. */}
            <View style={local.secureRow}>
              <Lock size={12} color="#7a93a3" />
              <Text style={local.secureText}>Encrypted connection</Text>
            </View>
          </View>
        </Animated.View>

        {/* Fills the rest of the screen so the footer sits at the bottom on tall phones. */}
        <View style={{ flex: 1, minHeight: MIN_GAP }} />
        <View onLayout={(e) => setFooterH(e.nativeEvent.layout.height)}>
          <Text style={local.footnote}>
            Accounts are created by SoWash. If you cannot sign in, contact your account manager.
          </Text>
          <Text style={local.powered}>
            Powered By <Text style={local.poweredBrand}>iNOVAA.AI</Text>
          </Text>
        </View>
        {/* Room to scroll the card above the keyboard — appended at the END, so adding it
            never moves the inputs. */}
        {kbOverlap > 0 ? <View style={{ height: kbOverlap }} /> : null}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { flexGrow: 1 },
  bottomShapes: { position: 'absolute', left: 0, right: 0, height: 150 },

  hero: { width: '100%', alignItems: 'center', overflow: 'hidden' },

  body: { alignSelf: 'center' },
  brand: { alignItems: 'center', marginTop: 4 },
  tagline: { marginTop: 10, fontSize: 14, fontWeight: '700', color: '#2f5870', letterSpacing: 0.4 },

  card: {
    marginTop: 18,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(11,42,58,0.06)',
    shadowColor: INK,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  welcome: { fontSize: 22, fontWeight: '800', color: INK, letterSpacing: -0.3 },
  welcomeSub: { fontSize: 13, lineHeight: 19, color: '#5b7384', marginTop: 4 },

  field: {},
  fieldTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 18 },
  label: { fontSize: 12, fontWeight: '700', color: '#7a93a3', letterSpacing: 0.4 },
  fieldAction: { fontSize: 12, fontWeight: '700', color: BLUE_DEEP },
  checkDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: GREEN_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: { fontSize: 16, color: palette.ink, paddingVertical: 8, paddingHorizontal: 0 },
  underline: { height: 2, backgroundColor: '#dfe8ee', borderRadius: 1 },
  underlineFocus: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 1 },

  btnWrap: {
    marginTop: 26,
    borderRadius: 30,
    shadowColor: BLUE_DEEP,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 54,
    borderRadius: 30,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.4 },
  arrowChip: {
    position: 'absolute',
    right: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  secureText: { fontSize: 11.5, fontWeight: '600', color: '#7a93a3', letterSpacing: 0.2 },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#9f1239' },
  footnote: {
    marginTop: 14,
    paddingHorizontal: 40,
    fontSize: 12,
    lineHeight: 18,
    color: '#5f7d8f',
    textAlign: 'center',
  },
  powered: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: '600',
    color: INK,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  poweredBrand: { fontWeight: '900', color: BRAND_GREEN_DEEP },
});
