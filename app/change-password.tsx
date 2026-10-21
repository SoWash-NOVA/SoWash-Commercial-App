// app/change-password.tsx
//
// Change the signed-in user's own password — clients AND office staff (one screen, reached from both Account tabs).
// POST /customer-portal/auth/change-password { current_password, new_password }; the server checks the current
// password and throttles wrong guesses. Keep MIN_LENGTH in step with MIN_PASSWORD_LENGTH in
// sowash-backend/routes/portalAuthRoutes.js.

import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Eye, EyeOff, KeyRound } from 'lucide-react-native';
import api, { errorMessage, getToken } from '../src/api/client';
import { styles, palette } from '../src/theme';
import { useAccent } from '../src/theme-context';
import PageHeader from '../src/components/PageHeader';
import KeyboardScreen from '../src/components/KeyboardScreen';

const MIN_LENGTH = 8;

function Field({
  label,
  value,
  onChangeText,
  show,
  onToggle,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoFocus?: boolean;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={local.label}>{label}</Text>
      <View style={local.inputRow}>
        <TextInput
          style={local.input}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          textContentType="none"
          importantForAutofill="no"
          autoFocus={autoFocus}
          placeholderTextColor={palette.mutedLight}
          accessibilityLabel={label}
        />
        <TouchableOpacity onPress={onToggle} hitSlop={10} accessibilityLabel={show ? 'Hide password' : 'Show password'}>
          {show ? <EyeOff size={18} color={palette.muted} /> : <Eye size={18} color={palette.muted} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const problem =
    next && next.length < MIN_LENGTH
      ? `At least ${MIN_LENGTH} characters.`
      : next && current && next === current
        ? 'Must be different from the current password.'
        : again && next !== again
          ? 'The two new passwords do not match.'
          : '';
  const ready = !!current && next.length >= MIN_LENGTH && next === again && next !== current && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    try {
      // The shared client skips the token for any customer-portal/auth/* URL (login runs signed out), so attach it here.
      const token = await getToken();
      await api.post(
        'customer-portal/auth/change-password',
        { current_password: current, new_password: next },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      Alert.alert('Password changed', 'Use your new password the next time you sign in.', [
        { text: 'OK', onPress: () => (router.canGoBack() ? router.back() : router.replace('/')) },
      ]);
    } catch (err) {
      Alert.alert('Could not change password', errorMessage(err, 'Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardScreen style={styles.screen}>
      <PageHeader title="Change password" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { marginTop: 8 }]}>
          <View style={local.hero}>
            <View style={[local.heroIcon, { backgroundColor: `${accent}14` }]}>
              <KeyRound size={20} color={accent} />
            </View>
            <Text style={local.heroText}>Enter your current password, then choose a new one of at least {MIN_LENGTH} characters.</Text>
          </View>

          <Field label="Current password" value={current} onChangeText={setCurrent} show={show} onToggle={() => setShow((v) => !v)} autoFocus />
          <Field label="New password" value={next} onChangeText={setNext} show={show} onToggle={() => setShow((v) => !v)} />
          <Field label="Confirm new password" value={again} onChangeText={setAgain} show={show} onToggle={() => setShow((v) => !v)} />

          {problem ? <Text style={local.problem}>{problem}</Text> : null}

          <TouchableOpacity
            style={[local.btn, { backgroundColor: accent, opacity: ready ? 1 : 0.45 }]}
            activeOpacity={0.85}
            onPress={submit}
            disabled={!ready}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={local.btnText}>Change password</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardScreen>
  );
}

const local = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  heroIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heroText: { flex: 1, fontSize: 13, lineHeight: 18, color: palette.muted, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '800', color: palette.muted, marginBottom: 6, letterSpacing: 0.3 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: palette.surface,
  },
  input: { flex: 1, paddingVertical: 12, fontSize: 15, color: palette.ink },
  problem: { color: palette.danger, fontSize: 12.5, fontWeight: '700', marginBottom: 10 },
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
