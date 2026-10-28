// src/phonebookConsent.tsx
//
// Google Play "Prominent Disclosure" for the staff Phone Book (User Data policy). The phone's contacts are personal and
// sensitive data, and the Phone Book UPLOADS them to the SoWash server, so before anything is read or uploaded the staff user
// must see - inside the app, in normal use, not in a menu or only in the privacy policy - what is collected, why, and who can
// see it, and must tap an explicit "Agree". Tapping away, the Android back button or closing the app is NOT consent.
//
//   getConsent / setConsent   the per-user choice, kept on the device (expo-secure-store)
//   ContactsDisclosureModal   the disclosure screen (Agree / No thanks)
//
// src/phonebook.ts refuses to read or upload contacts (autoBackup, backupContacts) unless the choice is 'granted'.
// Change DISCLOSURE_VERSION when the wording changes materially: everyone is asked again.

import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Contact } from 'lucide-react-native';
import { palette } from './theme';
import { keep } from './themeEngine';

export type Consent = 'granted' | 'declined' | null;

const DISCLOSURE_VERSION = 1;
const key = (userId: number) => `phonebookConsent:${userId}`;

export async function getConsent(userId: number): Promise<Consent> {
  try {
    const raw = await SecureStore.getItemAsync(key(userId));
    if (!raw) return null;
    const v = JSON.parse(raw) as { v?: number; choice?: string };
    if (v.v !== DISCLOSURE_VERSION) return null; // the wording changed: ask again
    return v.choice === 'granted' || v.choice === 'declined' ? v.choice : null;
  } catch {
    return null;
  }
}

export async function setConsent(userId: number, choice: 'granted' | 'declined'): Promise<void> {
  try {
    await SecureStore.setItemAsync(key(userId), JSON.stringify({ v: DISCLOSURE_VERSION, choice, at: new Date().toISOString() }));
  } catch {
    // if it cannot be saved the user is simply asked again next time - never treated as consent
  }
}

export function ContactsDisclosureModal({
  visible,
  onAgree,
  onDecline,
}: {
  visible: boolean;
  onAgree: () => void;
  onDecline: () => void;
}) {
  return (
    // onRequestClose (Android back) deliberately does nothing: going back is not consent, and the choice must be made here.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => undefined} statusBarTranslucent>
      <View style={s.backdrop}>
        <View style={s.card}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
            <View style={s.iconWrap}>
              <Contact size={26} color={keep('#1C9BE0')} />
            </View>
            <Text style={s.title}>Back up your phone&apos;s contacts?</Text>

            <Text style={s.lead}>
              SoWash Commercial collects your phone&apos;s contacts (names, phone numbers, email addresses, company and job title) and
              uploads them to SoWash&apos;s secure server (app.sowashusa.com) to back them up automatically while you use the staff
              app, so they can be restored if you change phones.
            </Text>

            <Bullet text="Used only for backup and restore. Never used for advertising and never sold." />
            <Bullet text="Your backup is private to you, except that SoWash's super administrator and CI administrator can view the contacts staff have backed up." />
            <Bullet text="Putting the backup back on a phone needs approval from the administrators." />
            <Bullet text="If you choose “No thanks”, your contacts are not read or uploaded. You can change your mind later in Phone Book." />
          </ScrollView>

          <TouchableOpacity style={s.agree} activeOpacity={0.9} onPress={onAgree} accessibilityRole="button">
            <Text style={s.agreeText}>Agree and back up my contacts</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.decline} activeOpacity={0.8} onPress={onDecline} accessibilityRole="button">
            <Text style={s.declineText}>No thanks</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={s.bulletRow}>
      <View style={s.bulletDot} />
      <Text style={s.bulletText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,15,30,0.62)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, maxHeight: '88%', backgroundColor: palette.surface, borderRadius: 22, padding: 20 },
  iconWrap: { width: 52, height: 52, borderRadius: 16, backgroundColor: palette.borderSubtle, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '900', color: palette.ink, letterSpacing: -0.3, marginBottom: 10 },
  lead: { fontSize: 14, lineHeight: 21, fontWeight: '600', color: palette.ink, marginBottom: 12 },
  bulletRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.muted, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 13.5, lineHeight: 20, fontWeight: '600', color: palette.muted },
  agree: { marginTop: 16, height: 50, borderRadius: 14, backgroundColor: keep('#1C9BE0'), alignItems: 'center', justifyContent: 'center' },
  agreeText: { fontSize: 15, fontWeight: '800', color: keep('#fff') },
  decline: { marginTop: 8, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  declineText: { fontSize: 14.5, fontWeight: '800', color: palette.muted },
});
