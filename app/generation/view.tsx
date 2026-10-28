// app/generation/view.tsx
//
// The iNOVAA report for the period the client picked, shown INSIDE the app: the server rebuilds the report (the same HTML design
// the team used to email by hand) from the published figures and it is displayed in a WebView. The share / print button hands
// the same HTML to the phone's own sheet. If this build has no WebView (an older dev build), the screen says so and offers the
// share sheet instead of failing.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CircleAlert, Share2 } from 'lucide-react-native';
import { styles, palette } from '../../src/theme';
import { keep } from '../../src/themeEngine';
import { useAccent } from '../../src/theme-context';
import { errorMessage } from '../../src/api/client';
import { fetchGenerationView, shareGenerationHtml } from '../../src/hooks';
import PageHeader from '../../src/components/PageHeader';

// react-native-webview is a native module: absent in a build made before it was added.
let WebViewComponent: React.ComponentType<Record<string, unknown>> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebViewComponent = require('react-native-webview').WebView;
} catch {
  WebViewComponent = null;
}

// The report's own Print / Download buttons do nothing inside a WebView: hide them; the app's share button replaces them.
const HIDE_BUTTONS = `(function(){var s=document.createElement('style');s.innerHTML='.btn-bar,.no-print{display:none !important}body{-webkit-text-size-adjust:100%}';document.head.appendChild(s);})();true;`;

class Guard extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function GenerationViewScreen() {
  const router = useRouter();
  const { accent } = useAccent();
  const { from, to, label, scope, client_id: clientParam } = useLocalSearchParams<{ from: string; to: string; label?: string; scope?: string; client_id?: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState('Report');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetchGenerationView(String(from), String(to), scope === 'staff' ? 'staff' : 'client', clientParam ? Number(clientParam) : null);
      setHtml(r.html);
      setTitle(r.title || 'Report');
    } catch (e) {
      setError(errorMessage(e, 'Could not build the report.'));
    } finally {
      setLoading(false);
    }
  }, [from, to, scope, clientParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const share = async () => {
    if (!html) return;
    try {
      await shareGenerationHtml(html, title);
    } catch (e) {
      Alert.alert('Could not share', e instanceof Error ? e.message : 'Try again.');
    }
  };

  const noWebView = (
    <View style={local.center}>
      <CircleAlert size={24} color={palette.warn} />
      <Text style={local.title}>Update the app to read it here</Text>
      <Text style={local.body}>This version of the app cannot show the report inside the app yet. You can still open it with the phone&apos;s viewer.</Text>
      <TouchableOpacity onPress={share} style={[local.btn, { backgroundColor: accent }]}>
        <Share2 size={16} color="#fff" />
        <Text style={local.btnText}>Open with the phone</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.screen}>
      <PageHeader
        title={title}
        subtitle={label || undefined}
        onBack={() => (router.canGoBack() ? router.back() : router.replace((scope === 'staff' ? '/generation/staff' : '/generation') as never))}
        right={
          html ? (
            <TouchableOpacity onPress={share} hitSlop={10} accessibilityLabel="Share or print the report" style={local.headerBtn}>
              <Share2 size={18} color="#fff" />
            </TouchableOpacity>
          ) : undefined
        }
      />
      {loading ? (
        <View style={local.center}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={local.body}>Building your report…</Text>
        </View>
      ) : error ? (
        <View style={local.center}>
          <CircleAlert size={24} color={palette.danger} />
          <Text style={local.title}>Could not open the report</Text>
          <Text style={local.body}>{error}</Text>
          <TouchableOpacity onPress={load} style={[local.btn, { backgroundColor: accent }]}>
            <Text style={local.btnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : html && WebViewComponent ? (
        <Guard fallback={noWebView}>
          <WebViewComponent
            originWhitelist={['*']}
            source={{ html, baseUrl: 'https://app.sowashusa.com' }}
            injectedJavaScript={HIDE_BUTTONS}
            javaScriptEnabled
            setSupportMultipleWindows={false}
            showsVerticalScrollIndicator={false}
            startInLoadingState
            // the report is self-contained: never let a tapped link carry the client away from it
            onShouldStartLoadWithRequest={(req: { url: string }) => req.url.startsWith('about:') || req.url === 'https://app.sowashusa.com/'}
            style={{ flex: 1, backgroundColor: '#F2F2F7' }}
          />
        </Guard>
      ) : html ? (
        noWebView
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  title: { fontSize: 16, fontWeight: '800', color: palette.ink, textAlign: 'center' },
  body: { fontSize: 13, color: palette.muted, textAlign: 'center', lineHeight: 19 },
  btn: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  headerBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: keep('#1789C9') },
});
