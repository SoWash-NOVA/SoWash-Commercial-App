// app/login.tsx
//
// Email + password sign-in. There is no self-registration: commercial portal
// accounts are created by SoWash and linked to a commercial_clients row, so
// this screen offers no "sign up" path by design.
//
// The backend distinguishes three failures and words each one usefully — bad
// credentials, a staff account, an account with no client link. We show its
// message verbatim rather than flattening them into "login failed".

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Building2, Mail, Lock, Eye, EyeOff, ArrowRight, TriangleAlert } from 'lucide-react-native';
import { styles, palette } from '../src/theme';
import { useAccent } from '../src/theme-context';
import { useAuth } from '../src/auth/AuthContext';

export default function LoginScreen() {
  const { accent } = useAccent();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={local.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.avatarBox, { backgroundColor: accent, marginBottom: 20 }]}>
          <Building2 size={34} color="#fff" />
        </View>

        <Text style={[styles.titleExtrabold, { fontSize: 26, marginBottom: 6 }]}>
          SoWash Commercial
        </Text>
        <Text style={[styles.subTextCenter, { marginBottom: 28 }]}>
          Sign in with the email address SoWash set your account up with.
        </Text>

        {error ? (
          <View style={local.errorBox}>
            <TriangleAlert size={16} color={palette.danger} />
            <Text style={local.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.inputContainer}>
          <View style={styles.inputWrapper}>
            <Mail size={18} color={palette.mutedLight} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="you@company.com"
              placeholderTextColor={palette.mutedLight}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              editable={!busy}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </View>
        </View>

        <View style={[styles.inputContainer, { marginTop: 12 }]}>
          <View style={styles.inputWrapper}>
            <Lock size={18} color={palette.mutedLight} style={styles.inputIcon} />
            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={palette.mutedLight}
              value={password}
              onChangeText={setPassword}
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
              style={styles.inputIconRight}
              hitSlop={10}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? (
                <EyeOff size={18} color={palette.mutedLight} />
              ) : (
                <Eye size={18} color={palette.mutedLight} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          onPress={submit}
          disabled={!canSubmit}
          style={[
            styles.btnPrimary,
            { backgroundColor: accent, marginTop: 24, opacity: canSubmit ? 1 : 0.45 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.btnPrimaryText}>Sign in</Text>
              <ArrowRight size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        <Text style={local.footnote}>
          Accounts are created by SoWash. If you cannot sign in, contact your account manager.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const local = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
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
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: '#9f1239',
  },
  footnote: {
    marginTop: 24,
    fontSize: 12,
    lineHeight: 18,
    color: palette.mutedLight,
    textAlign: 'center',
  },
});
