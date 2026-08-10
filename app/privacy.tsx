// app/privacy.tsx
//
// In-app privacy policy. Play requires a policy URL on the store listing; this
// is the in-app copy so a reviewer and a customer can find it without leaving
// the app.
//
// KEEP IN SYNC with docs/privacy-policy.html — that is the hosted version the
// Play Console links to.
//
// This is NOT the residential policy with the names swapped. The two apps
// collect different things and this text was written against this app's code:
//   • sign-in is email + password against a users row — no phone number, no SMS,
//     no Firebase Authentication (src/auth/AuthContext.tsx)
//   • no weather, so no coordinates go to any third party (unlike the
//     residential app's Open-Meteo call)
//   • the account holder is a business contact, not a consumer at home
// If those change, change this.

import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { styles, palette } from '../src/theme';
import { useAccent } from '../src/theme-context';
import { PRIVACY_EMAIL } from '../src/contact';

const LAST_UPDATED = '10 August 2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { marginTop: 16 }]}>
      <Text style={[styles.cardTitle, { marginBottom: 12 }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <Text style={local.body}>{children}</Text>;
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={local.bulletRow}>
      <View style={local.bulletDot} />
      <Text style={[local.body, { flex: 1, marginBottom: 0 }]}>{children}</Text>
    </View>
  );
}

export default function PrivacyScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const mailto = () => Linking.openURL(`mailto:${PRIVACY_EMAIL}`);

  return (
    <View style={styles.screen}>
      <View style={styles.stubHeader}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={styles.stubBackBtn}
        >
          <ChevronLeft size={20} color={palette.inkSoft} />
        </TouchableOpacity>
        <Text style={styles.stubTitle}>Privacy policy</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={local.updated}>Last updated {LAST_UPDATED}</Text>

        <View style={[styles.card, { marginTop: 8, borderColor: accent, borderWidth: 1 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 12 }]}>IN SHORT</Text>
          <P>
            SoWash Commercial shows your organisation its own solar cleaning and maintenance record —
            your sites, the visits our crews made, the photos they took, and what they found.
          </P>
          <P>
            We collect what we need to run that service. We do not sell your information, we do not
            track you across other apps or websites, and we do not use your data for advertising.
          </P>
        </View>

        <Section title="Who we are">
          <P>
            SoWash provides solar panel cleaning and maintenance to commercial and industrial clients
            in Pakistan. This app is for staff at organisations that hold a SoWash contract. Accounts
            are created by SoWash and linked to your organisation — you cannot register in the app.
          </P>
        </Section>

        <Section title="What we collect">
          <Bullet>
            <Text style={local.strong}>Your sign-in details.</Text> The work email address and
            password for the account SoWash created for you. Passwords are stored only as a hash and
            can never be read back.
          </Bullet>
          <Bullet>
            <Text style={local.strong}>Your organisation&apos;s record.</Text> Company name, contract
            details, sites, system sizes, and the contact people named on the account.
          </Bullet>
          <Bullet>
            <Text style={local.strong}>Your service record.</Text> Visit dates, job status, the
            before and after photos our crews take at your sites, their inspection findings, and
            maintenance task history.
          </Bullet>
          <Bullet>
            <Text style={local.strong}>A notification token.</Text> Once push notifications are
            enabled, an anonymous device identifier from Google so we can tell you when a visit is
            scheduled or completed. It identifies a device, not a person.
          </Bullet>
        </Section>

        <Section title="What we do not collect">
          <Bullet>
            We never read your device location. The app does not ask for location permission and has
            no way to track where you or your phone are.
          </Bullet>
          <Bullet>
            We never access your camera, contacts, calendar, microphone, or call history. The app
            declares no camera or microphone permission at all.
          </Bullet>
          <Bullet>No advertising identifiers, no third-party analytics, no cross-app tracking.</Bullet>
          <Bullet>
            We do not send your data to any outside service other than the one named below.
          </Bullet>
        </Section>

        <Section title="How we use it">
          <Bullet>To show you your sites, visits, photos, findings and maintenance history.</Bullet>
          <Bullet>To sign you in and keep you signed in securely.</Bullet>
          <Bullet>To notify you about upcoming and completed work.</Bullet>
          <Bullet>To answer messages you send our support team.</Bullet>
        </Section>

        <Section title="Who we share it with">
          <P>
            <Text style={local.strong}>Google Firebase</Text> delivers push notifications to your
            device. It receives a device token and the notification text, nothing more.
          </P>
          <P>
            That is the only third party. We do not sell your information or share it with
            advertisers or data brokers, except where we are required to by law.
          </P>
        </Section>

        <Section title="Who can see what">
          <P>
            Your account is scoped to your organisation. Every request the app makes is limited to
            your own client record on the server — you cannot see another company&apos;s sites,
            visits or photos, and they cannot see yours.
          </P>
          <P>
            Anyone at your organisation whom SoWash has given an account can see the whole
            organisation&apos;s record, including who signed in and what was found. If someone
            leaves, ask us to close their account.
          </P>
        </Section>

        <Section title="How long we keep it">
          <P>
            We keep your organisation&apos;s account and service history for as long as the contract
            runs, and afterwards for as long as we need it for warranty, tax and legal purposes. It
            is the record of work done on your system. Notification tokens are deleted automatically
            once a device stops responding.
          </P>
        </Section>

        <Section title="Your choices">
          <Bullet>
            <Text style={local.strong}>Notifications.</Text> You can decline the prompt, or turn
            notifications off later in your phone settings. The app works normally either way.
          </Bullet>
          <Bullet>
            <Text style={local.strong}>Signing out.</Text> Sign out from the Account tab at any time.
            That removes your login from the device.
          </Bullet>
          <Bullet>
            <Text style={local.strong}>Access, correction and deletion.</Text> You can ask for a copy
            of the personal data we hold about you, ask us to correct it, or ask us to close your
            account — in the app under <Text style={local.strong}>Account → Close my account</Text>,
            or by writing to{' '}
            <Text style={[local.link, { color: accent }]} onPress={mailto}>
              {PRIVACY_EMAIL}
            </Text>
            . We action requests within 30 days. Closing your login does not delete your
            organisation&apos;s service records, which we keep under the contract.
          </Bullet>
        </Section>

        <Section title="Security">
          <P>
            All traffic between the app and our servers is encrypted in transit. Your login token is
            held in your device&apos;s secure storage — the Android Keystore or iOS Keychain — not in
            ordinary app files, and it is cleared when you sign out.
          </P>
        </Section>

        <Section title="Changes">
          <P>
            If we change this policy we will update the date at the top and, where the change
            matters, tell you in the app.
          </P>
        </Section>

        <Section title="Contact">
          <P>Questions about this policy, or about your data:</P>
          <TouchableOpacity onPress={mailto}>
            <Text style={[local.link, local.body, { color: accent }]}>{PRIVACY_EMAIL}</Text>
          </TouchableOpacity>
        </Section>
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  updated: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.mutedLight,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  body: { fontSize: 14, lineHeight: 21, color: palette.inkSoft, marginBottom: 10 },
  strong: { fontWeight: '800', color: palette.ink },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
  bulletRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: palette.mutedLight,
    marginTop: 8,
  },
});
