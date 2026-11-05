// src/quotation/pdf.ts
//
// Quotation -> PDF file -> the phone's share sheet (WhatsApp, email, Drive, ... whatever the user picks).
// Used by the form screen and by the share button on each list row.

import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { buildQuotationHtml, calcTotals, fileSafe } from './template';

const fmtDate = (iso: unknown) => {
  const [y, m, d] = String(iso ?? '').split('-');
  return y && m && d ? `${d}-${m}-${y}` : String(iso ?? '');
};

/** The cover message that goes with the PDF (WhatsApp / email). Short, plain text; signed with the name of whoever is logged in. */
export function quotationMessage(form: Record<string, any>, senderName = ''): string {
  const t = calcTotals(form);
  const pct = Number(form.taxPercent) || 0;
  const total = `${form.currency || 'PKR'} ${Math.round(t.total).toLocaleString('en-US')}${pct ? ` (incl. ${form.taxName || 'tax'} ${pct}%)` : ''}`;
  return [
    `Dear ${String(form.attention || '').trim() || 'Sir/Madam'},`,
    '',
    `Please find attached our quotation ${form.quoteNo} dated ${fmtDate(form.date)}${form.systemSize ? ` for ${form.systemSize}` : ''}.`,
    `Total: ${total}.`,
    '',
    'Kindly let us know if you need any clarification.',
    '',
    'Kind regards,',
    senderName.trim() || 'SoWash Maintenance Solutions',
    'SoWash Maintenance Solutions',
  ].join('\n');
}

/**
 * Builds the 7-page PDF (A4) and opens the share sheet. The cover message is copied to the clipboard first, because the
 * share sheet can carry the file but not a caption: the user pastes it in WhatsApp / email. Throws if sharing is unavailable.
 */
export async function shareQuotationPdf(form: Record<string, any>, senderName = ''): Promise<void> {
  // The design is 794 x 1123 CSS px (A4 at 96 dpi). expo-print sizes the page in POINTS (72 dpi) and Android lays the
  // HTML out at 96/72 of that, so A4 in points (595 x 842) gives exactly the 794 px viewport the design needs; a bigger
  // page left the design small and centred. iOS lays out 1:1, so it takes the pixel size.
  // expo-print / expo-clipboard are native modules: required here, not at the top, so these screens still open on a
  // build made before they were added (only the PDF button then asks for the new build).
  let Print: typeof import('expo-print');
  try {
    Print = require('expo-print');
  } catch {
    throw new Error('PDF sharing needs the latest app build. Please install the new version.');
  }
  try {
    const Clipboard: typeof import('expo-clipboard') = require('expo-clipboard');
    await Clipboard.setStringAsync(quotationMessage(form, senderName));
  } catch { /* no clipboard module (older build): the PDF still shares */ }
  const page = Platform.OS === 'android' ? { width: 595, height: 842 } : { width: 794, height: 1123 };
  const { uri } = await Print.printToFileAsync({
    html: buildQuotationHtml(form),
    ...page,
    margins: { left: 0, top: 0, right: 0, bottom: 0 },
  });
  const name = `Quotation_${fileSafe(form.quoteNo)}_${fileSafe(form.clientName)}.pdf`;
  const dest = `${FileSystem.cacheDirectory}${name}`;
  await FileSystem.deleteAsync(dest, { idempotent: true });
  await FileSystem.copyAsync({ from: uri, to: dest });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(dest, { mimeType: 'application/pdf', dialogTitle: name, UTI: 'com.adobe.pdf' });
}
