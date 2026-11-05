// app/quotations/[id].tsx - create / edit one quotation (super admin only). `id` is a number or "new".
// Mirrors the web QuotationGenerator: the same fields, the same quote-number rules, the same server maths, and the
// SAME 7-page HTML (src/quotation/template.ts) - shown in a WebView preview and turned into a PDF with expo-print.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { CalendarDays, Copy, Eye, Plus, RefreshCw, Save, Share2, Trash2, X } from 'lucide-react-native';
import { styles as shared, palette } from '../../src/theme';
import { errorMessage } from '../../src/api/client';
import { useStaffClients } from '../../src/hooks';
import { useAuth } from '../../src/auth/AuthContext';
import PageHeader from '../../src/components/PageHeader';
import KeyboardScreen from '../../src/components/KeyboardScreen';
import { useQuotationAccess } from '../../src/quotation/access';
import {
  MAX_ITEMS, MAX_TERMS, QuotationForm, QuotationStatus, STATUSES, baseQuoteNo, blankForm, getQuotation,
  nextQuoteNo, saveQuotation, setQuotationStatus, statusOf, stripRevision, todayIso,
} from '../../src/quotation/api';
import { DEFAULT_TERMS, buildQuotationHtml, calcTotals } from '../../src/quotation/template';
import { shareQuotationPdf } from '../../src/quotation/pdf';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const PAGE_W = 794;

// The system date picker (a native module, so required lazily: an older build without it just keeps the typed field).
function DatePick({ value, onDone }: { value: string; onDone: (iso: string | null) => void }) {
  let Picker: typeof import('@react-native-community/datetimepicker').default;
  try {
    Picker = require('@react-native-community/datetimepicker').default;
  } catch {
    return null;
  }
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const current = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  return (
    <Picker
      value={current}
      mode="date"
      onChange={(e, d) => {
        if (e.type !== 'set' || !d) return onDone(null);
        onDone(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[s.label, { color: palette.muted }]}>{label}</Text>
      {children}
    </View>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={[s.section, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={s.sectionHead}>
        <Text style={[s.sectionTitle, { color: palette.ink }]}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export default function QuotationFormScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { allowed, ready } = useQuotationAccess();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const openId = idParam && idParam !== 'new' ? Number(idParam) : null;

  const [form, setForm] = useState<QuotationForm>(blankForm);
  const [savedId, setSavedId] = useState<number | null>(openId);
  const [status, setStatus] = useState<QuotationStatus | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(!!openId);
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [autoQuote, setAutoQuote] = useState(!openId);
  const [genQuote, setGenQuote] = useState(false);
  const [showDate, setShowDate] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const input = [s.input, { color: palette.ink, borderColor: palette.border, backgroundColor: palette.bg }];
  const ph = palette.mutedLight;

  const update = useCallback((fn: (f: QuotationForm) => QuotationForm) => {
    setForm(fn);
    setDirty(true);
  }, []);
  const setField = (key: string) => (v: string) => update((f) => ({ ...f, [key]: v }));

  // open an existing quotation
  useEffect(() => {
    if (!openId || !allowed) return;
    let live = true;
    getQuotation(openId)
      .then((q) => {
        if (!live) return;
        setForm({ ...blankForm(), ...(q.data || {}) });
        setStatus(q.status);
        setDirty(false);
      })
      .catch((e) => {
        if (!live) return;
        Alert.alert('Quotation', errorMessage(e, 'Could not load the quotation.'));
        router.back();
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [openId, allowed, router]);

  const generateQuoteNo = useCallback(async (date: string, revised: boolean, revisionOf: string) => {
    setGenQuote(true);
    try {
      const no = await nextQuoteNo(date, revised, revisionOf);
      setForm((f) => ({ ...f, quoteNo: no }));
      setAutoQuote(true);
    } catch {
      // offline / API error: still fill the base number; the server rejects a duplicate on save
      const base = revised && revisionOf ? stripRevision(revisionOf) : baseQuoteNo(date);
      setForm((f) => ({ ...f, quoteNo: revised ? `${base}-R` : base }));
    } finally {
      setGenQuote(false);
    }
  }, []);

  // new quotation: keep the number in step with the date until the user types their own
  useEffect(() => {
    if (savedId || !autoQuote || !allowed) return undefined;
    const t = setTimeout(() => void generateQuoteNo(form.date, form.revised, form.revisionOf), 300);
    return () => clearTimeout(t);
  }, [savedId, autoQuote, allowed, form.date, form.revised, form.revisionOf, generateQuoteNo]);

  const totals = useMemo(() => calcTotals(form), [form]);

  // existing clients matching what is typed (a tap fills the name and the contact person)
  const clients = useStaffClients();
  const suggestions = useMemo(() => {
    const q = form.clientName.trim().toLowerCase();
    if (q.length < 2) return [];
    return (clients.data?.clients ?? [])
      .filter((c) => c.client_name && c.client_name.toLowerCase().includes(q) && c.client_name.toLowerCase() !== q)
      .slice(0, 5);
  }, [form.clientName, clients.data]);

  const validate = (): boolean => {
    if (!form.clientName.trim()) { Alert.alert('Quotation', 'Client name is required.'); return false; }
    if (!form.quoteNo.trim()) { Alert.alert('Quotation', 'Quote number is required.'); return false; }
    if (!form.lineItems.some((it) => it.description.trim() && String(it.amount).trim())) {
      Alert.alert('Quotation', 'Add at least one line item with a description and amount.');
      return false;
    }
    return true;
  };

  const save = async (): Promise<boolean> => {
    if (!validate()) return false;
    setSaving(true);
    try {
      const q = await saveQuotation(savedId, form);
      setSavedId(q.id);
      setStatus(q.status);
      setDirty(false);
      return true;
    } catch (e) {
      const code = (e as { response?: { status?: number } })?.response?.status;
      if (code === 409 && !savedId && autoQuote) {
        await generateQuoteNo(form.date, form.revised, form.revisionOf);
        Alert.alert('Quotation', 'That quote number was just used - a new number has been filled in. Please save again.');
      } else {
        Alert.alert('Quotation', errorMessage(e, 'Could not save the quotation.'));
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (next: QuotationStatus, forId?: number) => {
    const target = forId ?? savedId;
    if (!target || (!forId && next === status)) return;
    try {
      const q = await setQuotationStatus(target, next);
      setStatus(q.status);
    } catch (e) {
      Alert.alert('Quotation', errorMessage(e, 'Could not update the status.'));
    }
  };

  // copy this quotation into a new one numbered as its revision (-R, -R2 ...)
  const createRevision = () => {
    const make = () => {
      const revisionOf = stripRevision(form.quoteNo);
      setForm((f) => ({ ...f, quoteNo: '', revised: true, revisionOf, date: todayIso() }));
      setSavedId(null);
      setStatus(null);
      setAutoQuote(true);
      setDirty(true);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    };
    if (dirty) {
      Alert.alert('Create revision', 'You have unsaved changes. Create the revision from what is on screen?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create revision', onPress: make },
      ]);
    } else make();
  };

  // copy this quotation into a new, independent one (new number from today's date, status draft)
  const duplicate = () => {
    const make = () => {
      setForm((f) => ({ ...f, quoteNo: '', revised: false, revisionOf: '', date: todayIso() }));
      setSavedId(null);
      setStatus(null);
      setAutoQuote(true);
      setDirty(true);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    };
    if (dirty) {
      Alert.alert('Copy as new', 'You have unsaved changes. Copy what is on screen as a new quotation?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Copy as new', onPress: make },
      ]);
    } else make();
  };

  const toggleRevised = () => {
    update((f) => ({ ...f, revised: !f.revised }));
    setAutoQuote(true);
  };

  // the preview page is 794px wide; the viewport meta makes the WebView fit it to the screen
  const openPreview = () => {
    if (!validate()) return;
    const html = buildQuotationHtml(form).replace(
      '<meta charset="utf-8">',
      `<meta charset="utf-8"><meta name="viewport" content="width=${PAGE_W}, initial-scale=0.5, minimum-scale=0.3, maximum-scale=3, user-scalable=yes">`,
    );
    setPreviewHtml(html);
  };

  // PDF: print the same HTML to a file and hand it to the share sheet (WhatsApp, email, ...)
  const sharePdf = async () => {
    if (!validate()) return;
    setPdfBusy(true);
    try {
      // a quotation that goes out must exist in the system: save first when it is new or edited
      let id = savedId;
      if (!id || dirty) {
        const q = await saveQuotation(savedId, form).catch((e) => {
          const code = (e as { response?: { status?: number } })?.response?.status;
          throw code === 409 ? new Error('That quote number is already used. Change it and try again.') : e;
        });
        id = q.id;
        setSavedId(q.id);
        setStatus(q.status);
        setDirty(false);
      }
      await shareQuotationPdf(form, [user?.firstName, user?.lastName].filter(Boolean).join(' '));
      // the share sheet gives no "sent" signal, so ask
      if (id && (status ?? 'draft') === 'draft') {
        Alert.alert('Mark as Sent?', 'Did you send this quotation to the client?', [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Mark as Sent', onPress: () => void changeStatus('sent', id) },
        ]);
      }
    } catch (e) {
      Alert.alert('Quotation', errorMessage(e, 'Could not create the PDF.'));
    } finally {
      setPdfBusy(false);
    }
  };

  const setItem = (i: number, key: 'description' | 'details' | 'amount') => (v: string) =>
    update((f) => ({ ...f, lineItems: f.lineItems.map((it, idx) => (idx === i ? { ...it, [key]: v } : it)) }));
  const setTerm = (i: number) => (v: string) =>
    update((f) => ({ ...f, terms: f.terms.map((t, idx) => (idx === i ? v : t)) }));

  if (!allowed) {
    return (
      <View style={shared.screen}>
        <PageHeader title="Quotation" onBack={() => router.back()} />
        {ready ? (
          <Text style={[s.empty, { color: palette.muted }]}>Quotations are not enabled for your account. Ask the super admin.</Text>
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} color={palette.muted} />
        )}
      </View>
    );
  }

  const title = savedId ? form.quoteNo || 'Quotation' : 'New quotation';
  const st = status ? statusOf(status) : null;

  return (
    <View style={shared.screen}>
      <PageHeader
        title={title}
        subtitle={st ? `${st.label}${dirty ? ' - unsaved changes' : ''}` : dirty ? 'Unsaved changes' : 'Fill in the details'}
        onBack={() => {
          if (!dirty) return router.back();
          Alert.alert('Discard changes?', 'This quotation has unsaved changes.', [
            { text: 'Keep editing', style: 'cancel' },
            { text: 'Discard', style: 'destructive', onPress: () => router.back() },
          ]);
        }}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={palette.muted} />
      ) : (
        <KeyboardScreen style={{ flex: 1 }}>
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {savedId && st ? (
              <Section title="Status">
                <View style={s.chips}>
                  {STATUSES.map((c) => {
                    const on = status === c.value;
                    return (
                      <TouchableOpacity key={c.value} onPress={() => void changeStatus(c.value)}
                        style={[s.chip, { borderColor: c.color, backgroundColor: on ? c.color : 'transparent' }]}>
                        <Text style={[s.chipText, { color: on ? '#fff' : c.color }]}>{c.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            <Section title="Client details">
              <Field label="CLIENT NAME *">
                <TextInput style={input} value={form.clientName} onChangeText={setField('clientName')} placeholder="e.g. SKY Electric" placeholderTextColor={ph} />
                {suggestions.length > 0 ? (
                  <View style={[s.chips, { marginTop: 8 }]}>
                    {suggestions.map((c) => (
                      <TouchableOpacity key={c.client_id} style={[s.chip, { borderColor: '#1C9BE0' }]}
                        onPress={() => update((f) => ({ ...f, clientName: c.client_name ?? f.clientName, attention: f.attention || c.contact_person || '' }))}>
                        <Text style={[s.chipText, { color: '#1C9BE0' }]}>{c.client_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </Field>
              <Field label="SITE / ADDRESS">
                <TextInput style={input} value={form.site} onChangeText={setField('site')} placeholder="e.g. PTC Jhelum / Akora Khattak" placeholderTextColor={ph} />
              </Field>
              <Field label="ATTENTION (CONTACT PERSON)">
                <TextInput style={input} value={form.attention} onChangeText={setField('attention')} placeholder="e.g. Mr. Khalid" placeholderTextColor={ph} />
              </Field>
              <Field label="QUOTATION REFERENCE">
                <TextInput style={input} value={form.quotationRef} onChangeText={setField('quotationRef')} placeholder="e.g. PTC" placeholderTextColor={ph} />
              </Field>
            </Section>

            <Section title="Quotation details">
              <Field label={`QUOTE NO. *${!savedId && autoQuote ? '  (auto)' : ''}`}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[input, { flex: 1 }]}
                    value={form.quoteNo}
                    onChangeText={(v) => { setAutoQuote(false); setField('quoteNo')(v); }}
                    placeholder={baseQuoteNo(form.date)}
                    placeholderTextColor={ph}
                    autoCapitalize="characters"
                  />
                  {!savedId ? (
                    <TouchableOpacity style={[s.iconBtn, { borderColor: palette.border }]} disabled={genQuote}
                      onPress={() => void generateQuoteNo(form.date, form.revised, form.revisionOf)} accessibilityLabel="Generate the next quote number">
                      {genQuote ? <ActivityIndicator size="small" /> : <RefreshCw size={16} color={palette.muted} />}
                    </TouchableOpacity>
                  ) : null}
                </View>
                {!savedId ? (
                  <TouchableOpacity onPress={toggleRevised} style={s.checkRow}>
                    <View style={[s.check, { borderColor: palette.muted, backgroundColor: form.revised ? '#F59E0B' : 'transparent' }]} />
                    <Text style={{ color: palette.ink, fontSize: 13 }}>
                      Revised quotation{form.revisionOf ? ` (adds -R to ${stripRevision(form.revisionOf)})` : ' (adds -R)'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </Field>
              <Field label="DATE (YYYY-MM-DD)">
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput style={[input, { flex: 1 }]} value={form.date} onChangeText={setField('date')} placeholder="2026-11-05" placeholderTextColor={ph} keyboardType="numbers-and-punctuation" />
                  <TouchableOpacity style={[s.iconBtn, { borderColor: palette.border }]} onPress={() => setShowDate(true)} accessibilityLabel="Pick a date">
                    <CalendarDays size={18} color="#1C9BE0" />
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.iconBtn, { borderColor: palette.border, width: 64 }]} onPress={() => setField('date')(todayIso())}>
                    <Text style={s.addText}>Today</Text>
                  </TouchableOpacity>
                </View>
                {showDate ? <DatePick value={form.date} onDone={(iso) => { setShowDate(false); if (iso) setField('date')(iso); }} /> : null}
              </Field>
              <Field label="VALIDITY">
                <TextInput style={input} value={form.validity} onChangeText={setField('validity')} placeholder="e.g. 30 Days" placeholderTextColor={ph} />
              </Field>
              <Field label="SOWASH CONTACT PERSON">
                <TextInput style={input} value={form.contactPerson} onChangeText={setField('contactPerson')} placeholder="e.g. Junaid Raza" placeholderTextColor={ph} />
              </Field>
            </Section>

            <Section title="Scope (cover page)">
              <Field label="SERVICE TITLE">
                <TextInput style={input} value={form.serviceTitle} onChangeText={setField('serviceTitle')} placeholderTextColor={ph} />
              </Field>
              <Field label="SYSTEM SIZE">
                <TextInput style={input} value={form.systemSize} onChangeText={setField('systemSize')} placeholder="e.g. 5.79MW or 850kW" placeholderTextColor={ph} />
              </Field>
              <Field label="FREQUENCY">
                <TextInput style={input} value={form.frequency} onChangeText={setField('frequency')} placeholder="e.g. 3 cycles a month" placeholderTextColor={ph} />
              </Field>
              <Field label="COVER HEADLINE">
                <TextInput style={[input, s.multi]} multiline value={form.coverHeadline} onChangeText={setField('coverHeadline')} placeholderTextColor={ph} />
              </Field>
              <Field label="COVER TAGLINE (BLANK = AUTOMATIC)">
                <TextInput style={[input, s.multi]} multiline value={form.coverTagline} onChangeText={setField('coverTagline')} placeholderTextColor={ph} />
              </Field>
              <Field label="COMMERCIAL OFFER INTRO (BLANK = AUTOMATIC)">
                <TextInput style={[input, s.multi]} multiline value={form.offerIntro} onChangeText={setField('offerIntro')} placeholderTextColor={ph} />
              </Field>
            </Section>

            <Section
              title="Line items & tax"
              right={
                <TouchableOpacity style={s.addBtn} disabled={form.lineItems.length >= MAX_ITEMS}
                  onPress={() => update((f) => ({ ...f, lineItems: [...f.lineItems, { description: '', details: '', amount: '' }] }))}>
                  <Plus size={14} color="#1C9BE0" /><Text style={s.addText}>Add item</Text>
                </TouchableOpacity>
              }
            >
              {form.lineItems.map((it, i) => (
                <View key={i} style={[s.item, { borderColor: palette.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={[s.itemNo, { flex: 1 }]}>ITEM {String(i + 1).padStart(2, '0')}</Text>
                    {form.lineItems.length > 1 ? (
                      <TouchableOpacity onPress={() => update((f) => ({ ...f, lineItems: f.lineItems.filter((_, k) => k !== i) }))} accessibilityLabel={`Remove item ${i + 1}`}>
                        <Trash2 size={16} color="#DC2626" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Field label="DESCRIPTION *">
                    <TextInput style={input} value={it.description} onChangeText={setItem(i, 'description')} placeholder="e.g. 5.79 MW - PV cleaning with partial O&M" placeholderTextColor={ph} />
                  </Field>
                  <Field label="DETAILS (ONE PER LINE)">
                    <TextInput style={[input, s.multi]} multiline value={it.details} onChangeText={setItem(i, 'details')} placeholderTextColor={ph} />
                  </Field>
                  <Field label={`AMOUNT (${form.currency}) *`}>
                    <TextInput style={input} value={String(it.amount)} onChangeText={setItem(i, 'amount')} keyboardType="decimal-pad" placeholder="e.g. 627250" placeholderTextColor={ph} />
                  </Field>
                </View>
              ))}
              <Field label="TAX NAME">
                <TextInput style={input} value={form.taxName} onChangeText={setField('taxName')} placeholder="e.g. PRA, SST" placeholderTextColor={ph} />
              </Field>
              <Field label="TAX %">
                <TextInput style={input} value={String(form.taxPercent)} onChangeText={setField('taxPercent')} keyboardType="decimal-pad" placeholderTextColor={ph} />
              </Field>
              <Field label="CURRENCY">
                <TextInput style={input} value={form.currency} onChangeText={setField('currency')} autoCapitalize="characters" placeholderTextColor={ph} />
              </Field>
              <View style={s.totalBox}>
                <Text style={{ color: palette.ink, fontSize: 13 }}>Subtotal <Text style={s.bold}>{fmt(totals.subtotal)}</Text></Text>
                <Text style={{ color: palette.ink, fontSize: 13 }}>{totals.taxLabel} <Text style={s.bold}>{fmt(totals.taxAmt)}</Text></Text>
                <Text style={{ color: '#16A34A', fontSize: 15, fontWeight: '800' }}>Net total {form.currency} {fmt(totals.total)}</Text>
              </View>
              <Field label="WITHHOLDING TAX NOTE (BLANK = HIDE)">
                <TextInput style={[input, s.multi]} multiline value={form.whtNote} onChangeText={setField('whtNote')} placeholderTextColor={ph} />
              </Field>
            </Section>

            <Section
              title="Service terms & conditions"
              right={
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={() => update((f) => ({ ...f, terms: [...DEFAULT_TERMS] }))}><Text style={s.addText}>Defaults</Text></TouchableOpacity>
                  <TouchableOpacity disabled={form.terms.length >= MAX_TERMS} onPress={() => update((f) => ({ ...f, terms: [...f.terms, ''] }))}>
                    <Text style={s.addText}>+ Add</Text>
                  </TouchableOpacity>
                </View>
              }
            >
              {form.terms.map((term, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
                  <Text style={[s.itemNo, { width: 24, paddingTop: 12 }]}>#{i + 1}</Text>
                  <TextInput style={[input, s.multi, { flex: 1 }]} multiline value={term} onChangeText={setTerm(i)} placeholderTextColor={ph} />
                  <TouchableOpacity style={{ paddingTop: 12 }} onPress={() => update((f) => ({ ...f, terms: f.terms.filter((_, k) => k !== i) }))} accessibilityLabel={`Remove term ${i + 1}`}>
                    <Trash2 size={16} color="#DC2626" />
                  </TouchableOpacity>
                </View>
              ))}
              <Text style={{ color: palette.muted, fontSize: 11 }}>Up to {MAX_TERMS} terms fit on the page.</Text>
            </Section>

            <View style={s.actions}>
              <TouchableOpacity style={[s.action, { backgroundColor: '#16A34A' }]} disabled={saving} onPress={() => void save()}>
                {saving ? <ActivityIndicator color="#fff" /> : <Save size={16} color="#fff" />}
                <Text style={s.actionText}>{savedId ? 'Save changes' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.action, { backgroundColor: '#1C9BE0' }]} onPress={openPreview}>
                <Eye size={16} color="#fff" /><Text style={s.actionText}>Preview</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.action, { backgroundColor: '#0F172A' }]} disabled={pdfBusy} onPress={() => void sharePdf()}>
                {pdfBusy ? <ActivityIndicator color="#fff" /> : <Share2 size={16} color="#fff" />}
                <Text style={s.actionText}>Share PDF</Text>
              </TouchableOpacity>
            </View>
            <Text style={[s.hint, { color: palette.muted }]}>
              Share PDF saves the quotation, copies a ready cover message and opens the share sheet (WhatsApp, email...). Paste the message as the caption.
            </Text>
            {savedId ? (
              <View style={{ gap: 12, marginTop: 16 }}>
                <TouchableOpacity style={s.revision} onPress={createRevision}>
                  <Copy size={14} color="#1C9BE0" /><Text style={s.addText}>Create revision (numbered -R)</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.revision} onPress={duplicate}>
                  <Copy size={14} color="#1C9BE0" /><Text style={s.addText}>Copy as new quotation</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardScreen>
      )}

      <Modal visible={previewHtml !== null} animationType="slide" onRequestClose={() => setPreviewHtml(null)}>
        <View style={{ flex: 1, backgroundColor: '#E5E7EB' }}>
          <View style={s.previewBar}>
            <Text style={s.previewTitle}>Preview - 7 pages</Text>
            <TouchableOpacity onPress={() => setPreviewHtml(null)} hitSlop={10} accessibilityLabel="Close preview">
              <X size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          {previewHtml !== null ? (
            <WebView originWhitelist={['*']} source={{ html: previewHtml }} style={{ flex: 1 }} scalesPageToFit />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  section: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  multi: { minHeight: 60, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 12, fontWeight: '700' },
  iconBtn: { width: 44, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  check: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addText: { color: '#1C9BE0', fontWeight: '700', fontSize: 13 },
  item: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  itemNo: { color: '#16A34A', fontSize: 12, fontWeight: '800' },
  totalBox: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: 'rgba(34,211,165,0.10)', marginBottom: 14 },
  bold: { fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  action: { flex: 1, height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  revision: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  hint: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 10 },
  previewBar: { height: 90, paddingTop: 40, paddingHorizontal: 18, backgroundColor: '#1C9BE0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  empty: { textAlign: 'center', marginTop: 48, paddingHorizontal: 24, fontSize: 14 },
});
