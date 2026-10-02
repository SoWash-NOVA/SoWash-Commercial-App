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
// Look (a trial, login only): built around the SoWash logo — sky blue + lime
// green — but restrained. The user liked the floating bubbles and found the first
// pass "childish", so: the bubbles stay but are drawn as delicate soap bubbles
// (clear body, iridescent rim, crescent highlight); the logo sits directly on the
// backdrop (no sticker box); features are a quiet text row, not candy chips; the
// card is calm; and the button is dark ink with a lime accent instead of a glossy
// toy. Brand colours are used as ACCENTS. Colours are fixed brand colours, not the
// user-selectable accent (nobody is signed in yet).
//
// Layout rule learned the hard way: nothing here may change size in response to
// the keyboard — on Android that dismisses it as soon as a field is tapped. Size
// depends only on the physical screen; focusing a field just scrolls (and the
// focus "glow" is an absolutely-positioned ring, so it can't affect layout).
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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Dimensions,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import { palette } from '../src/theme';
import { useAuth } from '../src/auth/AuthContext';
import { BRAND_BLUE, BRAND_GREEN, BRAND_GREEN_DEEP, BRAND_GREEN_MID } from '../src/brand';
import ChatBackground from '../src/components/ChatBackground';
import { BubbleSpec, PhysicsBubble, useBubblePhysics } from '../src/components/BubblePhysics';

// Sampled from the logo file itself.
// (brand colours live in src/brand.ts — sampled from the logo)
const INK = '#0b2a3a';
const LOGO = require('../assets/sowash-logo.png');
const LOGO_RATIO = 248 / 1004;

type Field = 'email' | 'password' | null;

/**
 * The backdrop bubbles — glossy spheres you can grab, throw and bounce off each other
 * (see src/components/BubblePhysics.tsx). Anchors are px from the screen edges; a few
 * sit partly off-screen on purpose. Keep them clear of the form card at rest.
 */
const BUBBLES: BubbleSpec[] = [
  { size: 190, colors: ['#D2FF92', BRAND_GREEN], top: -70, right: -64, amp: 12, sway: -5 },
  { size: 92, colors: ['#D2FF92', '#6BE000'], top: 250, left: -34, amp: 9, sway: 7 },
  { size: 64, colors: ['#7FD3FA', '#1E9BE0'], bottom: 190, right: 18, amp: 8, sway: -5 },
  { size: 150, colors: ['#D2FF92', BRAND_GREEN], bottom: -56, left: -52, amp: 11, sway: 6 },
  { size: 44, colors: ['#D2FF92', '#6BE000'], top: 104, left: 22, amp: 8, sway: 5 },
  { size: 54, colors: ['#7FD3FA', '#1E9BE0'], bottom: 92, left: 118, amp: 8, sway: -6 },
];

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
  // The shell gives the login no safe-area padding (so the backdrop can reach under the
  // status bar and nav bar); the insets come back here as padding on the CONTENT only.
  const insets = useSafeAreaInsets();
  const compact = Dimensions.get('screen').height < 700;
  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef(0);
  const scrollToForm = () => {
    // After the keyboard has had a moment to open and the window to resize.
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, cardY.current - 12), animated: true }), 180);
  };

  const logoWidth = Math.min(width - 96, compact ? 240 : 300);
  const cardWidth = Math.min(width - 40, 460);

  // ── draggable bubbles ──
  // Fixed physical screen size: the window height shrinks when the keyboard opens, and
  // the bubbles' homes must not move with it.
  const screen = Dimensions.get('screen');
  const physics = useBubblePhysics(BUBBLES, screen.width, screen.height);
  const scrollY = useRef(0);
  const cardH = useRef(0);
  /** The form card in screen coordinates — a touch on it must reach the inputs, never grab a bubble behind it. */
  const onCard = (px: number, py: number) => {
    const x0 = (screen.width - cardWidth) / 2;
    const y0 = cardY.current - scrollY.current;
    return px >= x0 - 4 && px <= x0 + cardWidth + 4 && py >= y0 - 4 && py <= y0 + cardH.current + 4;
  };
  const candidate = useRef(-1);
  const pan = useRef(
    PanResponder.create({
      // Capture phase: runs before the inputs / ScrollView, and claims the touch ONLY on a bubble.
      onStartShouldSetPanResponderCapture: (e) => {
        const { pageX, pageY } = e.nativeEvent;
        candidate.current = onCard(pageX, pageY) ? -1 : physics.hitTest(pageX, pageY);
        return candidate.current >= 0;
      },
      onPanResponderGrant: (e) => {
        if (candidate.current >= 0) physics.begin(candidate.current, e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: (e) => physics.move(e.nativeEvent.pageX, e.nativeEvent.pageY),
      onPanResponderRelease: () => physics.end(),
      onPanResponderTerminate: () => physics.end(),
      // once a bubble is held, don't let anything else steal the gesture
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  // ── entrance: the brand fades up, then the card ──
  const logoIn = useRef(new Animated.Value(0)).current;
  const cardIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.stagger(120, [
      Animated.timing(logoIn, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(cardIn, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [logoIn, cardIn]);

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

  const renderField = (
    f: Exclude<Field, null>,
    label: string,
    icon: React.ReactNode,
    input: React.ReactNode,
    extraStyle?: object,
  ) => (
    <View style={extraStyle}>
      <Text style={[local.label, focus === f && { color: BRAND_GREEN_DEEP }]}>{label}</Text>
      <View style={local.fieldWrap}>
        {/* focus glow — absolute, so turning it on/off never changes layout */}
        <View pointerEvents="none" style={[local.glow, { opacity: focus === f ? 1 : 0 }]} />
        <View style={[local.field, focus === f && { borderColor: BRAND_GREEN }]}>
          {icon}
          {input}
        </View>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={local.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      {...pan.panHandlers}
    >
      {/* ── Backdrop: soft gradient, faint doodles, physics bubbles ── */}
      <LinearGradient
        pointerEvents="none"
        colors={['#F8FEF1', '#E5F8D0', '#E3F3F9']}
        locations={[0, 0.58, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ChatBackground tone="plain" color={BRAND_GREEN_MID} />
      {BUBBLES.map((spec, i) => (
        <PhysicsBubble
          key={i}
          spec={spec}
          tx={physics.values[i].tx}
          ty={physics.values[i].ty}
          ix={physics.idle[i].ix}
          iy={physics.idle[i].iy}
          screenW={screen.width}
          screenH={screen.height}
        />
      ))}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[local.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onScroll={(e) => {
          scrollY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        {/* ── Brand block: the logo straight on the backdrop ─────── */}
        <Animated.View
          style={[
            local.brandBlock,
            {
              paddingTop: (compact ? 26 : 56) + insets.top,
              paddingBottom: compact ? 28 : 40,
              opacity: logoIn,
              transform: [{ translateY: logoIn.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            },
          ]}
        >
          <Image
            source={LOGO}
            resizeMode="contain"
            style={{ width: logoWidth, height: logoWidth * LOGO_RATIO }}
            accessibilityLabel="SoWash Maintenance Solutions"
          />
          <Text style={local.tagline}>SoWash Commercial App</Text>

          {compact ? null : (
            <View style={local.features}>
              <View style={[local.dot, { backgroundColor: BRAND_GREEN_MID }]} />
              <Text style={local.featureText}>AI-powered</Text>
              <Text style={local.sep}>·</Text>
              <View style={[local.dot, { backgroundColor: BRAND_BLUE }]} />
              <Text style={local.featureText}>Live reports</Text>
              <Text style={local.sep}>·</Text>
              <View style={[local.dot, { backgroundColor: BRAND_GREEN_MID }]} />
              <Text style={local.featureText}>Secure</Text>
            </View>
          )}
        </Animated.View>

        {/* ── Form card ───────────────────────────────────────────── */}
        <Animated.View
          style={{
            alignSelf: 'center',
            opacity: cardIn,
            transform: [{ translateY: cardIn.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }],
          }}
          onLayout={(e) => {
            cardY.current = e.nativeEvent.layout.y;
            cardH.current = e.nativeEvent.layout.height;
          }}
        >
          <View style={[local.card, { width: cardWidth }]}>
            <View style={local.cardClip}>
              {/* ── Header band: a quiet tinted top with the heading ── */}
              <LinearGradient colors={['#EEF9DD', '#FFFFFF']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={local.cardHead}>
                <View style={local.headRow}>
                  <View style={local.badge}>
                    <ShieldCheck size={22} color={BRAND_GREEN_DEEP} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={local.eyebrow}>SIGN IN</Text>
                    <Text style={local.welcome}>Welcome back</Text>
                  </View>
                </View>
                <Text style={local.welcomeSub}>Use the email address SoWash set your account up with.</Text>
              </LinearGradient>

              {/* ── Form body ── */}
              <View style={local.cardBody}>
                {error ? (
                  <View style={local.errorBox}>
                    <TriangleAlert size={16} color={palette.danger} />
                    <Text style={local.errorText}>{error}</Text>
                  </View>
                ) : null}

                {renderField(
                  'email',
                  'Email address',
                  <Mail size={18} color={focus === 'email' ? BRAND_GREEN_DEEP : palette.mutedLight} />,
                  <TextInput
                    style={local.input}
                    placeholder="you@company.com"
                    placeholderTextColor="#a3b4c0"
                    value={email}
                    onChangeText={setEmail}
                    onFocus={() => {
                      setFocus('email');
                      scrollToForm();
                    }}
                    onBlur={() => setFocus((f) => (f === 'email' ? null : f))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    editable={!busy}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />,
                )}

                {renderField(
                  'password',
                  'Password',
                  <Lock size={18} color={focus === 'password' ? BRAND_GREEN_DEEP : palette.mutedLight} />,
                  <>
                    <TextInput
                      ref={passwordRef}
                      style={local.input}
                      placeholder="Enter your password"
                      placeholderTextColor="#a3b4c0"
                      value={password}
                      onChangeText={setPassword}
                      onFocus={() => {
                        setFocus('password');
                        scrollToForm();
                      }}
                      onBlur={() => setFocus((f) => (f === 'password' ? null : f))}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textContentType="password"
                      returnKeyType="go"
                      editable={!busy}
                      onSubmitEditing={submit}
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={10}
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff size={18} color={palette.mutedLight} />
                      ) : (
                        <Eye size={18} color={palette.mutedLight} />
                      )}
                    </TouchableOpacity>
                  </>,
                  { marginTop: 16 },
                )}

                {/* Dark ink button, lime accent — the brand colours as accents, not fills. */}
                <Pressable
                  onPress={submit}
                  onPressIn={() => pressTo(1)}
                  onPressOut={() => pressTo(0)}
                  disabled={!canSubmit}
                  style={[local.btnWrap, { opacity: canSubmit ? 1 : 0.5 }]}
                >
                  <Animated.View
                    style={{ transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }] }}
                  >
                    <LinearGradient
                      colors={['#17506b', INK]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={local.btn}
                    >
                      <View pointerEvents="none" style={local.btnHighlight} />
                      {busy ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Text style={local.btnText}>Sign in</Text>
                          <View style={local.arrowChip}>
                            <ArrowRight size={16} color={INK} />
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
            </View>
          </View>
        </Animated.View>

        {/* Fills the rest of the screen so the footer sits at the bottom on tall phones. */}
        <View style={{ flex: 1, minHeight: 16 }} />
        <Text style={local.footnote}>
          Accounts are created by SoWash. If you cannot sign in, contact your account manager.
        </Text>
        <Text style={local.powered}>
          Powered By <Text style={local.poweredBrand}>iNOVAA.AI</Text>
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  content: { flexGrow: 1 },

  brandBlock: { alignItems: 'center', paddingHorizontal: 24 },
  tagline: { marginTop: 18, fontSize: 15, fontWeight: '600', color: '#2f5870', letterSpacing: 0.3 },
  features: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  featureText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, color: '#4d6b7c', textTransform: 'uppercase' },
  sep: { fontSize: 14, color: '#9db3c1', marginHorizontal: 2 },

  // Outer view carries the shadow; the inner one clips the tinted header band to the corners
  // (one view can't both clip its children and cast an iOS shadow).
  card: {
    borderRadius: 26,
    backgroundColor: '#fff',
    shadowColor: INK,
    shadowOpacity: 0.15,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  cardClip: {
    borderRadius: 26,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(11,42,58,0.07)',
    backgroundColor: '#fff',
  },
  cardHead: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cfe9a8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND_GREEN,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  eyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1.6, color: BRAND_GREEN_DEEP },
  welcome: { fontSize: 24, fontWeight: '800', color: INK, letterSpacing: -0.3, marginTop: 1 },
  welcomeSub: { fontSize: 13, lineHeight: 19, color: '#5b7384', marginTop: 12 },
  cardBody: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20 },

  label: { fontSize: 12, fontWeight: '700', color: '#3b566a', letterSpacing: 0.3, marginBottom: 7 },
  fieldWrap: { position: 'relative' },
  glow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: 'rgba(126,245,5,0.3)',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#d5e3ec',
    paddingHorizontal: 14,
  },
  input: { flex: 1, fontSize: 15.5, color: palette.ink, paddingVertical: 0 },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14 },
  secureText: { fontSize: 11.5, fontWeight: '600', color: '#7a93a3', letterSpacing: 0.2 },

  btnWrap: {
    marginTop: 22,
    borderRadius: 16,
    shadowColor: INK,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
  },
  btnHighlight: { position: 'absolute', top: 0, left: 16, right: 16, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  arrowChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BRAND_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#9f1239' },
  footnote: {
    marginTop: 12,
    paddingHorizontal: 36,
    fontSize: 12,
    lineHeight: 18,
    color: '#5f7d8f',
    textAlign: 'center',
  },
  powered: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: '600',
    color: '#5f7d8f',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  poweredBrand: { fontWeight: '900', color: BRAND_GREEN_DEEP },
});
