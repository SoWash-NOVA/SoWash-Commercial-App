// MIRROR of sowash-frontend/src/pages/Sales/quotationTemplate.js (printQuotation removed: the app prints with expo-print).
// Keep the two in step by hand, like the privacy policy.
// SoWash quotation template — builds the full 7-page A4 quotation as one HTML document.
// Used by QuotationGenerator.js for the live preview and for Print → Save as PDF.
// Design source: approved SoWash quotation design (SKY Electric / Razi Sons versions).

const LOGO_COLOR = 'data:image/png;base64,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';
const LOGO_WHITE = 'data:image/png;base64,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';

export const DEFAULT_TERMS = [
  'Electricity and water to be provided by the customer for performing the service.',
  'Safe access to the cleaning site to be provided by the customer to the staff.',
  'Our scope is not limited to cleaning only; system performance relies on the scope mutually agreed.',
  'The terms of this agreement take effect from the date of the first wash.',
  'By signing below, the above prices and terms are satisfactory and hereby accepted.',
  'If any wash is delayed or cannot be completed for any reason, the fixed amount remains the same.',
  'The contract is valid for a period of 1 year.',
];

export const DEFAULT_QUOTATION: Record<string, any> = {
  clientName: '',
  site: '',
  attention: '',
  quotationRef: '',
  quoteNo: '',
  date: new Date().toISOString().slice(0, 10),
  validity: '30 Days',
  paymentTerms: '',
  contactPerson: '',
  serviceTitle: 'PV Cleaning & O&M',
  systemSize: '',
  frequency: '',
  coverTagline: '',
  coverHeadline: 'PV cleaning plus partial O&M, with a dedicated crew on rotation.',
  offerIntro: '',
  currency: 'PKR',
  taxName: 'PRA',
  taxPercent: 16,
  lineItems: [{ description: '', details: '', amount: '' }],
  whtNote: 'By accepting this offer, customer agrees that the income withholding tax will be under Engineering Services Withholding tax 7%.',
  terms: DEFAULT_TERMS,
};

const TERM_ICONS = [
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"></path></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="1"></rect><path d="M9 5v12M15 5v12M3 11h18M12 17v3"></path></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M4 10h16"></path></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 0 1 14-5.3M20 4v5h-5M20 12a8 8 0 0 1-14 5.3M4 20v-5h5"></path></svg>',
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M4 10h16M9 15l2 2 4-4"></path></svg>',
];

const e = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const money = (n: unknown) => Math.round(num(n)).toLocaleString('en-US');

// Shrinks big headline text for long client names so nothing wraps out of its box.
// tiers: [[maxChars, px], ...] — the first tier whose maxChars fits wins; last px is the floor.
const fitSize = (text: unknown, tiers: number[][]) => {
  const t = String(text || '').trim();
  const longestWord = t.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
  const len = Math.max(t.length, longestWord * 2.2);
  const hit = tiers.find(([max]) => len <= max);
  return hit ? hit[1] : tiers[tiers.length - 1][1];
};

const fmtDate = (iso: unknown) => {
  if (!iso) return '';
  const [y, m, dd] = String(iso).split('-');
  return y && m && dd ? `${dd}-${m}-${y}` : String(iso);
};

export const calcTotals = (d: Record<string, any>) => {
  const pct = num(d.taxPercent);
  const items = (d.lineItems || []).map((it: any) => {
    const amount = num(it.amount);
    const tax = Math.round(amount * pct / 100);
    return { ...it, amount, tax, total: amount + tax };
  });
  const subtotal = items.reduce((s: number, it: any) => s + it.amount, 0);
  const taxAmt = items.reduce((s: number, it: any) => s + it.tax, 0);
  const taxLabel = d.taxName ? `${d.taxName} ${pct}%` : `Tax ${pct}%`;
  return { items, subtotal, taxAmt, total: subtotal + taxAmt, taxLabel: pct ? taxLabel : 'Tax' };
};

const PAGE_CSS = `
  @page { size: A4; margin: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #E5E7EB; }
  .q-page { width: 794px; height: 1123px; overflow: hidden; margin: 0 auto 24px; background: #FFFFFF; box-shadow: 0 4px 24px rgba(0,0,0,0.12); }
  @media print {
    html, body { background: #FFFFFF; }
    .q-page { margin: 0; box-shadow: none; page-break-after: always; break-after: page; }
    .q-page:last-child { page-break-after: auto; break-after: auto; }
  }
`;

export function buildQuotationHtml(input: Record<string, any>): string {
  const d = { ...DEFAULT_QUOTATION, ...input };
  if (!d.coverTagline) d.coverTagline = d.systemSize
    ? `Your ${d.systemSize} solar plant loses output every day it stays dusty. We bring it back.`
    : 'Your solar plant loses output every day it stays dusty. We bring it back.';
  if (!d.offerIntro) d.offerIntro = `${d.serviceTitle}${d.systemSize ? ' for ' + d.systemSize : ''}${num(d.taxPercent) ? ', inclusive of ' + (d.taxName || 'tax') + ' ' + num(d.taxPercent) + '%' : ''}.`;
  const t = calcTotals(d);

  const rowsHtml = t.items.map((it: any, i: number) => `<div style="display: grid; grid-template-columns: 50px 1fr 110px 90px 110px; gap: 12px; padding: 16px 22px; font-size: 16px; align-items: center; border-top: ${i ? '1px solid #DDF3FC' : 'none'}"><div style="font-size: 20px; font-weight: 800; color: #00699A">${String(i + 1).padStart(2, '0')}</div><div><div style="font-weight: 800">${e(it.description)}</div>${it.details ? `<div style="font-size: 13px; line-height: 1.45; color: #3C6A82; margin-top: 4px; white-space: pre-line">${e(it.details)}</div>` : ''}</div><div style="text-align: right">${money(it.amount)}</div><div style="text-align: right">${money(it.tax)}</div><div style="text-align: right; font-weight: 800">${money(it.total)}</div></div>`).join('');
  const termsHtml = (d.terms || []).filter((x: unknown) => String(x).trim()).map((term: string, i: number) => `<div style="position: relative; background: #FFFFFF; border-radius: 14px; padding: 13px 62px 13px 16px; min-height: 60px"><div style="font-size: 15px; line-height: 1.45"><b style="color: #00699A">#${i + 1} </b>${e(term)}</div><div style="position: absolute; right: 14px; bottom: 14px; width: 38px; height: 38px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center">${TERM_ICONS[i % TERM_ICONS.length]}</div></div>`).join('\n');

  const pages = [
    `<div style="position: relative; overflow: hidden; width: 794px; height: 1123px; box-sizing: border-box; background: #33B8F0; font-family: 'DM Sans', sans-serif; color: #FFFFFF">

<div aria-hidden="true" style="position: absolute; right: -150px; top: 330px; transform: rotate(-16deg); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; width: 560px">
<div style="height: 150px; border: 2px solid rgba(255,255,255,0.4); border-radius: 10px"></div><div style="height: 150px; border: 2px solid rgba(255,255,255,0.4); border-radius: 10px"></div><div style="height: 150px; background: rgba(255,255,255,0.18); border-radius: 10px"></div><div style="height: 150px; border: 2px solid rgba(255,255,255,0.4); border-radius: 10px"></div>
<div style="height: 150px; border: 2px solid rgba(255,255,255,0.4); border-radius: 10px"></div><div style="height: 150px; background: rgba(255,255,255,0.18); border-radius: 10px"></div><div style="height: 150px; border: 2px solid rgba(255,255,255,0.4); border-radius: 10px"></div><div style="height: 150px; border: 2px solid rgba(255,255,255,0.4); border-radius: 10px"></div>
<div style="height: 150px; border: 2px solid rgba(255,255,255,0.4); border-radius: 10px"></div><div style="height: 150px; border: 2px solid rgba(255,255,255,0.4); border-radius: 10px"></div><div style="height: 150px; border: 2px solid rgba(255,255,255,0.4); border-radius: 10px"></div><div style="height: 150px; background: rgba(255,255,255,0.18); border-radius: 10px"></div>
</div>

<div aria-hidden="true" style="position: absolute; left: 0; top: 0; width: 28px; height: 1123px; background: #7EE80A"></div>
<div aria-hidden="true" style="position: absolute; left: 0; bottom: 0; width: 794px; height: 160px; background: #2AA6DB"></div>
<div aria-hidden="true" style="position: absolute; left: 0; bottom: 160px; width: 794px; height: 10px; background: #7EE80A"></div>

<img src="${LOGO_WHITE}" alt="SoWash Maintenance Solutions" style="position: absolute; left: 84px; top: 96px; width: 366px; height: 70px; display: block">

<div style="position: absolute; left: 84px; bottom: 250px; width: 620px; display: flex; flex-direction: column; gap: 22px">
<div aria-hidden="true" style="width: 96px; height: 10px; border-radius: 5px; background: #7EE80A"></div>
<h1 style="margin: 0; font-size: ${fitSize(d.clientName, [[12, 116], [18, 96], [26, 80], [36, 64], [50, 54], [999, 46]])}px; line-height: 0.95; font-weight: 800; letter-spacing: -0.05em; color: #FFFFFF; text-wrap: balance; overflow-wrap: anywhere">${e(d.clientName)}</h1>
</div>

</div>`,
    `<div style="width: 794px; height: 1123px; box-sizing: border-box; padding: 40px; background: #DDF3FC; font-family: 'DM Sans', sans-serif; color: #073B57; display: flex; flex-direction: column; gap: 24px">

<div style="position: relative; overflow: hidden; min-height: 530px; flex: 0 0 auto; box-sizing: border-box; background: #33B8F0; border-radius: 18px; padding: 46px 48px; display: flex; flex-direction: column; gap: 24px">
<div aria-hidden="true" style="position: absolute; top: -40px; right: -70px; transform: rotate(-14deg); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; width: 260px">
<div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div><div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div><div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div><div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div>
<div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div><div style="height: 74px; background: rgba(255,255,255,0.22); border-radius: 6px"></div><div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div><div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div>
<div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div><div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div><div style="height: 74px; background: rgba(255,255,255,0.22); border-radius: 6px"></div><div style="height: 74px; border: 2px solid rgba(255,255,255,0.45); border-radius: 6px"></div>
</div>

<img src="${LOGO_WHITE}" alt="SoWash Maintenance Solutions" style="position: relative; width: 262px; height: 50px; display: block">
<div style="position: relative; align-self: flex-start; background: #7EE80A; border-radius: 8px; padding: 6px 20px; margin-top: 18px">
<div style="font-size: 40px; font-weight: 800; letter-spacing: -0.04em; color: #073B57">${e(d.serviceTitle)}</div>
</div>
<h1 style="position: relative; margin: -8px 0 0; font-size: ${fitSize(d.clientName, [[14, 82], [20, 68], [28, 56], [40, 46], [56, 38], [80, 32], [999, 28]])}px; line-height: 1; font-weight: 800; letter-spacing: -0.045em; color: #073B57; text-wrap: balance; overflow-wrap: anywhere">Proposal for<br><span style="color: #FFFFFF">${e(d.clientName)}</span></h1>
<p style="position: relative; margin: 6px 0 0; font-size: 20px; line-height: 1.4; font-weight: 700; color: #073B57">${e(d.coverTagline)}</p>
<p style="position: relative; margin: 0; font-size: 20px; line-height: 1.4; font-weight: 700; color: #073B57">Prepared for ${e(d.attention || d.clientName)}${d.site ? ', ' + e(d.site) : ''}.</p>
</div>

<div style="position: relative; height: 230px; flex: 0 0 auto">
<div aria-hidden="true" style="position: absolute; left: 330px; top: 0; width: 170px; height: 38px; background: #FFFFFF; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 12px; box-sizing: border-box; box-shadow: 0 2px 8px rgba(7,59,87,0.08)"><div style="height: 5px; width: 120px; background: #D6E4EC; border-radius: 3px"></div><div style="height: 5px; width: 80px; background: #D6E4EC; border-radius: 3px; align-self: flex-end"></div></div>
<div aria-hidden="true" style="position: absolute; right: 0; top: 30px; width: 150px; height: 38px; background: #FFFFFF; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 12px; box-sizing: border-box; box-shadow: 0 2px 8px rgba(7,59,87,0.08)"><div style="height: 5px; width: 100px; background: #D6E4EC; border-radius: 3px"></div><div style="height: 5px; width: 60px; background: #D6E4EC; border-radius: 3px; align-self: flex-end"></div></div>
<div aria-hidden="true" style="position: absolute; left: 70px; top: 186px; width: 200px; height: 40px; background: #FFFFFF; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 12px; box-sizing: border-box; box-shadow: 0 2px 8px rgba(7,59,87,0.08)"><div style="height: 5px; width: 150px; background: #D6E4EC; border-radius: 3px"></div><div style="height: 5px; width: 90px; background: #D6E4EC; border-radius: 3px; align-self: flex-end"></div></div>
<div aria-hidden="true" style="position: absolute; right: 60px; top: 192px; width: 180px; height: 38px; background: #EEF8FD; border-radius: 10px; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 0 12px; box-sizing: border-box"><div style="height: 5px; width: 130px; background: #D6E4EC; border-radius: 3px"></div><div style="height: 5px; width: 70px; background: #D6E4EC; border-radius: 3px; align-self: flex-end"></div></div>

<div style="position: absolute; left: 24px; top: 34px; width: 220px; height: 160px; background: #7EE80A; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center">
<div style="font-size: 54px; font-weight: 800; letter-spacing: -0.05em; color: #073B57; line-height: 1; white-space: nowrap">${e(d.systemSize)}</div>
<div style="font-size: 15px; font-weight: 800; color: #073B57; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.08em">${e(d.frequency)}</div>
</div>
<div style="position: absolute; left: 272px; top: 66px; width: 440px; font-size: 32px; line-height: 1.12; font-weight: 800; letter-spacing: -0.035em; color: #073B57">${e(d.coverHeadline)}</div>
</div>

<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px">
<div style="background: #FFFFFF; border-radius: 12px; padding: 12px 14px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">Quote no.</div><div style="font-size: 16px; font-weight: 800; margin-top: 4px">${e(d.quoteNo)}</div></div>
<div style="background: #FFFFFF; border-radius: 12px; padding: 12px 14px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">Date</div><div style="font-size: 16px; font-weight: 800; margin-top: 4px">${e(fmtDate(d.date))}</div></div>
<div style="background: #FFFFFF; border-radius: 12px; padding: 12px 14px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">Site</div><div style="font-size: 16px; font-weight: 800; margin-top: 4px">${e(d.site)}</div></div>
<div style="background: #FFFFFF; border-radius: 12px; padding: 12px 14px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">Validity</div><div style="font-size: 16px; font-weight: 800; margin-top: 4px">${e(d.validity)}</div></div>
</div>

<div style="margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px">
<div style="display: flex; flex-direction: column; gap: 10px">
<p style="margin: 0; font-size: 17px; line-height: 1.5; color: #1E4A63">Proposal no. ${e(d.quoteNo)}, submitted by SoWash (“SW” or “Seller”) to ${e(d.clientName)} for the scope detailed inside.</p>
<div style="font-size: 18px; font-weight: 800; color: #073B57">Net total ${e(d.currency)} ${money(t.total)}${t.taxAmt ? ' incl. ' + e(t.taxLabel) : ''} — see the commercial offer.</div>
</div>
<div style="flex: 0 0 auto; width: 58px; height: 58px; border-radius: 50%; background: #7EE80A; display: flex; align-items: center; justify-content: center">
<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>
</div>
</div>

</div>`,
    `<div style="width: 794px; height: 1123px; box-sizing: border-box; background: #FFFFFF; font-family: 'DM Sans', sans-serif; color: #073B57; display: flex; flex-direction: column">

<div style="padding: 36px 40px 22px; display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; justify-content: space-between; align-items: flex-start">
<div style="background: #7EE80A; border-radius: 8px; padding: 6px 16px; font-size: 17px; font-weight: 800; color: #073B57">Confidential</div>
<div style="width: 72px; height: 72px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg></div>
</div>
<h1 style="margin: -14px 0 0; font-size: 52px; line-height: 1; font-weight: 800; letter-spacing: -0.05em"><span style="color: #00699A">Proprietary</span> statement</h1>
<p style="margin: 0; font-size: 15px; line-height: 1.5; color: #1E4A63">Proposal No. ${e(d.quoteNo)} and all related correspondence (the “Proposal”) are the property of the Seller, furnished in confidence solely to consider its merits. By accepting this document, the recipient agrees:</p>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">
<div style="background: #DDF3FC; border-radius: 12px; padding: 10px 14px; font-size: 14px; line-height: 1.45"><b style="color: #00699A">#1 </b>To use it only for the stated purpose — not to perform the proposed work or share it with the Seller's competitors.</div>
<div style="background: #DDF3FC; border-radius: 12px; padding: 10px 14px; font-size: 14px; line-height: 1.45"><b style="color: #00699A">#2 </b>To avoid publication or other unrestricted disclosure of this document or its information.</div>
<div style="background: #DDF3FC; border-radius: 12px; padding: 10px 14px; font-size: 14px; line-height: 1.45"><b style="color: #00699A">#3 </b>To make no copies of any part thereof without the Seller's prior written permission.</div>
<div style="background: #DDF3FC; border-radius: 12px; padding: 10px 14px; font-size: 14px; line-height: 1.45"><b style="color: #00699A">#4 </b>To return this document when no longer needed, or upon the Seller's request.</div>
<div style="background: #DDF3FC; border-radius: 12px; padding: 10px 14px; font-size: 14px; line-height: 1.45"><b style="color: #00699A">#5 </b>Quoted services are delivered in the best-case scenario; any change will be of equal or better quality.</div>
<div style="background: #DDF3FC; border-radius: 12px; padding: 10px 14px; font-size: 14px; line-height: 1.45"><b style="color: #00699A">#6 </b>SoWash may quote the above items subject to its suppliers' availability.</div>
</div>
</div>

<div style="flex: 1; background: #DDF3FC; padding: 22px 40px 28px; display: flex; flex-direction: column; gap: 14px">
<div style="background: #FFFFFF; border-radius: 18px; padding: 22px 26px; display: flex; flex-direction: column; gap: 16px">
<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 20px">
<div style="font-size: 28px; font-weight: 800; letter-spacing: -0.04em; line-height: 1.1">Accept this quotation<br><span style="color: #00699A">and we'll schedule your first wash.</span></div>
<div style="flex: 0 0 auto; width: 56px; height: 56px; border-radius: 50%; background: #7EE80A; display: flex; align-items: center; justify-content: center"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path></svg></div>
</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px">
<div style="display: flex; flex-direction: column; gap: 14px">
<div style="align-self: flex-start; background: #33B8F0; border-radius: 6px; padding: 4px 10px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em">For ${e(d.clientName)}</div>
<div style="height: 160px; box-sizing: border-box; border: 1.5px dashed #7FBFDF; border-radius: 12px; padding: 10px 12px; display: flex; align-items: flex-end; font-size: 13px; color: #2C5A74">Signature &amp; stamp</div>
<div style="border-bottom: 1.5px solid #7FBFDF; padding: 16px 0 6px; font-size: 13px; color: #2C5A74">Name &amp; designation</div>
<div style="border-bottom: 1.5px solid #7FBFDF; padding: 16px 0 6px; font-size: 13px; color: #2C5A74">Date</div>
</div>
<div style="display: flex; flex-direction: column; gap: 14px">
<div style="align-self: flex-start; background: #7EE80A; border-radius: 6px; padding: 4px 10px; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em">For SoWash</div>
<div style="height: 160px; box-sizing: border-box; border: 1.5px dashed #7FBFDF; border-radius: 12px; padding: 10px 12px; display: flex; align-items: flex-end; font-size: 13px; color: #2C5A74">Signature &amp; stamp</div>
<div style="border-bottom: 1.5px solid #7FBFDF; padding: 16px 0 6px; font-size: 13px; color: #2C5A74">Authorised signatory</div>
<div style="border-bottom: 1.5px solid #7FBFDF; padding: 16px 0 6px; font-size: 13px; color: #2C5A74">Date</div>
</div>
</div>
</div>

<div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between">
<div style="display: flex; align-items: center; gap: 16px"><img src="${LOGO_COLOR}" alt="SoWash" style="width: 157px; height: 30px; display: block"><div style="font-size: 12px; line-height: 1.45; color: #2C5A74">www.sowash.pk · sales@sowash.pk · UAN 021 111 769 274</div></div>
<div style="display: flex; align-items: center; gap: 14px"><div style="font-size: 13px; font-weight: 800; color: #2C5A74">3 / 7</div><div style="width: 52px; height: 52px; border-radius: 50%; background: #33B8F0; display: flex; align-items: center; justify-content: center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></div></div>
</div>
</div>

</div>`,
    `<div style="width: 794px; height: 1123px; box-sizing: border-box; background: #FFFFFF; font-family: 'DM Sans', sans-serif; color: #073B57; display: flex; flex-direction: column">

<div style="padding: 36px 40px 24px; display: flex; flex-direction: column; gap: 14px">
<div style="display: flex; justify-content: space-between; align-items: flex-start">
<div style="background: #7EE80A; border-radius: 8px; padding: 6px 16px; font-size: 17px; font-weight: 800; color: #073B57">Quote # ${e(d.quoteNo)}</div>
<div style="width: 72px; height: 72px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"></path><path d="M14 3v5h5M9 13h7M9 17h5"></path></svg></div>
</div>
<h1 style="margin: -14px 0 0; font-size: 58px; line-height: 1; font-weight: 800; letter-spacing: -0.05em"><span style="color: #00699A">Commercial offer</span><br><span style="font-size: ${fitSize(d.clientName, [[22, 52], [32, 40], [46, 32], [70, 26], [999, 22]])}px; display: inline-block; line-height: 1.08; overflow-wrap: anywhere">for ${e(d.clientName)}</span></h1>
<p style="margin: 0; font-size: 18px; line-height: 1.5; color: #1E4A63">${e(d.offerIntro)}</p>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 4px">
<div style="position: relative; background: #DDF3FC; border-radius: 14px; padding: 12px 16px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">Customer</div><div style="font-size: 17px; font-weight: 800; margin-top: 6px">${e(d.clientName)}</div></div>
<div style="position: relative; background: #DDF3FC; border-radius: 14px; padding: 12px 16px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">Site</div><div style="font-size: 17px; font-weight: 800; margin-top: 6px">${e(d.site)}</div></div>
<div style="position: relative; background: #DDF3FC; border-radius: 14px; padding: 12px 16px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">Date</div><div style="font-size: 17px; font-weight: 800; margin-top: 6px">${e(fmtDate(d.date))}</div></div>
<div style="position: relative; background: #DDF3FC; border-radius: 14px; padding: 12px 16px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">Quotation ref.</div><div style="font-size: 17px; font-weight: 800; margin-top: 6px">${e(d.quotationRef)}</div></div>
<div style="position: relative; background: #DDF3FC; border-radius: 14px; padding: 12px 16px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">SoWash contact</div><div style="font-size: 17px; font-weight: 800; margin-top: 6px">${e(d.contactPerson)}</div></div>
<div style="position: relative; background: #DDF3FC; border-radius: 14px; padding: 12px 16px"><div style="font-size: 12px; font-weight: 700; color: #00699A; text-transform: uppercase; letter-spacing: 0.06em">Quotation validity</div><div style="font-size: 17px; font-weight: 800; margin-top: 6px">${e(d.validity)}</div></div>
</div>
</div>

<div style="flex: 1; background: #DDF3FC; padding: 22px 40px 26px; display: flex; flex-direction: column; gap: 14px">
<div style="background: #FFFFFF; border-radius: 16px; overflow: hidden">
<div style="display: grid; grid-template-columns: 50px 1fr 110px 90px 110px; gap: 12px; padding: 14px 22px; background: #33B8F0; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #073B57">
<div>Sr.</div><div>Description</div><div style="text-align: right">Line total</div><div style="text-align: right">${e(t.taxLabel)}</div><div style="text-align: right">Total</div>
</div>
${rowsHtml}
</div>

<div style="display: flex; gap: 20px; align-items: stretch">
<div style="flex: 0 0 300px; background: #7EE80A; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; justify-content: center; gap: 4px">
<div style="font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em">Net total (all taxes)</div>
<div style="font-size: 50px; font-weight: 800; letter-spacing: -0.05em; line-height: 1.05">${money(t.total)}</div>
<div style="font-size: 15px; font-weight: 700">${e(d.currency)}${t.taxAmt ? ' · incl. ' + e(t.taxLabel) + ' (' + money(t.taxAmt) + ')' : ''}</div>
</div>
<div style="position: relative; flex: 1; background: #FFFFFF; border-radius: 16px; padding: 22px 24px; display: flex; flex-direction: column; gap: 8px">
<div style="position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6"></path></svg></div>
<div style="font-size: 18px; font-weight: 800; color: #00699A">Send your purchase order to</div>
<div style="font-size: 15px; line-height: 1.5"><b>SoWash — Head Office</b><br>House No. F8/1, Tipu Sultan Road,<br>KDA Scheme No. 1, Karachi, Pakistan</div>
<div style="font-size: 15px; line-height: 1.5">UAN 021 111 769 274 · sales@sowash.pk</div>
</div>
</div>
${d.whtNote ? `
<div style="background: #FFFFFF; border-radius: 14px; padding: 14px 20px; display: flex; gap: 14px; align-items: center"><div style="flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%; background: #33B8F0; display: flex; align-items: center; justify-content: center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 11v6M12 7.5v.5"></path></svg></div><div style="font-size: 15px; line-height: 1.45; font-weight: 600">${e(d.whtNote)}</div></div>` : ''}
<div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between">
<div style="display: flex; align-items: center; gap: 16px"><img src="${LOGO_COLOR}" alt="SoWash" style="width: 157px; height: 30px; display: block"><div style="font-size: 12px; line-height: 1.45; color: #2C5A74">www.sowash.pk</div></div>
<div style="display: flex; align-items: center; gap: 14px"><div style="font-size: 13px; font-weight: 800; color: #2C5A74">4 / 7</div><div style="width: 52px; height: 52px; border-radius: 50%; background: #33B8F0; display: flex; align-items: center; justify-content: center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></div></div>
</div>
</div>

</div>`,
    `<div style="width: 794px; height: 1123px; box-sizing: border-box; background: #FFFFFF; font-family: 'DM Sans', sans-serif; color: #073B57; display: flex; flex-direction: column">

<div style="padding: 36px 40px 22px; display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; justify-content: space-between; align-items: flex-start">
<div style="background: #7EE80A; border-radius: 8px; padding: 6px 16px; font-size: 17px; font-weight: 800; color: #073B57">Terms</div>
<div style="width: 72px; height: 72px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"></path></svg></div>
</div>
<h1 style="margin: -14px 0 0; font-size: 52px; line-height: 1; font-weight: 800; letter-spacing: -0.05em"><span style="color: #00699A">Services &amp;</span><br>terms of work</h1>
<p style="margin: 0; font-size: 18px; line-height: 1.5; color: #1E4A63">What the maintenance contract covers, what is billed separately, and the ground rules for every wash.</p>
<div style="font-size: 19px; font-weight: 800; color: #00699A; margin-top: 4px">Services to be provided:</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 28px">
<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.45"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: 0 0 auto; margin-top: 1px"><path d="M5 12l5 5L20 7"></path></svg><span><b>Maintenance contract:</b> packages for the period set in the Commercial Offer, with standard and optional services.</span></div>
<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.45"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: 0 0 auto; margin-top: 1px"><path d="M5 12l5 5L20 7"></path></svg><span>Services in the Commercial Offer are subject to the fees stated there.</span></div>
<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.45"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: 0 0 auto; margin-top: 1px"><path d="M5 12l5 5L20 7"></path></svg><span><b>Service on request:</b> anything outside a maintenance contract is invoiced separately.</span></div>
<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.45"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: 0 0 auto; margin-top: 1px"><path d="M5 12l5 5L20 7"></path></svg><span>All additional work not in the Commercial Offer is invoiced separately.</span></div>
</div>
</div>

<div style="flex: 1; background: #DDF3FC; padding: 22px 40px 28px; display: flex; flex-direction: column; gap: 12px">
<div style="font-size: 19px; font-weight: 800; color: #00699A">Terms &amp; conditions:</div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">
${termsHtml}
<div style="background: #33B8F0; border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; justify-content: center; gap: 4px"><div style="font-size: 17px; font-weight: 800">Questions on any term?</div><div style="font-size: 15px; font-weight: 700">sales@sowash.pk · UAN 021 111 769 274</div></div>
</div>

<div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between">
<div style="display: flex; align-items: center; gap: 16px"><img src="${LOGO_COLOR}" alt="SoWash" style="width: 157px; height: 30px; display: block"><div style="font-size: 12px; line-height: 1.45; color: #2C5A74">www.sowash.pk</div></div>
<div style="display: flex; align-items: center; gap: 14px"><div style="font-size: 13px; font-weight: 800; color: #2C5A74">5 / 7</div><div style="width: 52px; height: 52px; border-radius: 50%; background: #33B8F0; display: flex; align-items: center; justify-content: center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></div></div>
</div>
</div>

</div>`,
    `<div style="width: 794px; height: 1123px; box-sizing: border-box; background: #FFFFFF; font-family: 'DM Sans', sans-serif; color: #073B57; display: flex; flex-direction: column">

<div style="padding: 36px 40px 22px; display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; justify-content: space-between; align-items: flex-start">
<div style="background: #7EE80A; border-radius: 8px; padding: 6px 16px; font-size: 17px; font-weight: 800; color: #073B57">Before we start</div>
<div style="width: 72px; height: 72px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg></div>
</div>
<h1 style="margin: -14px 0 0; font-size: 52px; line-height: 1; font-weight: 800; letter-spacing: -0.05em"><span style="color: #00699A">Inspection</span><br>&amp; site access</h1>
<p style="margin: 0; font-size: 16px; line-height: 1.45; color: #1E4A63">A quick check of your equipment and a few details from your side let our team start without delay.</p>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 4px">
<div style="position: relative; background: #DDF3FC; border-radius: 16px; padding: 18px 20px">
<div style="position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%; background: #FFFFFF; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg></div>
<div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; padding-right: 48px">Initial inspection</div>
<div style="font-size: 15px; line-height: 1.5; margin-top: 8px">Before services begin, SoWash may inspect the equipment to confirm there is no major defect and it is in good condition. This may be charged at the rates in the Commercial Offer.</div>
</div>
<div style="position: relative; background: #DDF3FC; border-radius: 16px; padding: 18px 20px">
<div style="position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%; background: #FFFFFF; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"></path><path d="M9 12h7M9 16h5"></path></svg></div>
<div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; padding-right: 48px">Information we need</div>
<div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px">
<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.4"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: 0 0 auto; margin-top: 1px"><path d="M5 12l5 5L20 7"></path></svg><span>Structure of the installation</span></div>
<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.4"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: 0 0 auto; margin-top: 1px"><path d="M5 12l5 5L20 7"></path></svg><span>Repairs done earlier by another company</span></div>
<div style="display: flex; gap: 10px; font-size: 15px; line-height: 1.4"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex: 0 0 auto; margin-top: 1px"><path d="M5 12l5 5L20 7"></path></svg><span>Special safety regulations at the site</span></div>
</div>
</div>
</div>
</div>

<div style="flex: 1; background: #DDF3FC; padding: 22px 40px 28px; display: flex; flex-direction: column; gap: 10px">
<div style="font-size: 19px; font-weight: 800; color: #00699A">Access &amp; working conditions:</div>
<div style="position: relative; background: #FFFFFF; border-radius: 14px; padding: 12px 66px 12px 18px"><div style="font-size: 16px; font-weight: 800">Access to the equipment</div><div style="font-size: 14px; line-height: 1.45; margin-top: 3px">The customer shall give SoWash engineers access to the installation and make the equipment available so services run without delay, ensuring the installation runs autonomously in real operating conditions.</div><div style="position: absolute; right: 16px; top: 16px; width: 40px; height: 40px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="15" r="4"></circle><path d="M11 12l9-9M17 6l3 3M15 8l2 2"></path></svg></div></div>
<div style="position: relative; background: #FFFFFF; border-radius: 14px; padding: 12px 66px 12px 18px"><div style="font-size: 16px; font-weight: 800">Working hours</div><div style="font-size: 14px; line-height: 1.45; margin-top: 3px">Unless in an emergency or otherwise agreed, services are carried out during SoWash's usual working hours.</div><div style="position: absolute; right: 16px; top: 16px; width: 40px; height: 40px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3 2"></path></svg></div></div>
<div style="position: relative; background: #FFFFFF; border-radius: 14px; padding: 12px 66px 12px 18px"><div style="font-size: 16px; font-weight: 800">Security &amp; safety</div><div style="font-size: 14px; line-height: 1.45; margin-top: 3px">The customer shall ensure work is never carried out under dangerous conditions and protect SoWash engineers from any safety or health hazard. A customer employee will periodically check their safety while they work, and local safety rules must always be respected.</div><div style="position: absolute; right: 16px; top: 16px; width: 40px; height: 40px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path></svg></div></div>
<div style="background: #33B8F0; border-radius: 14px; padding: 14px 20px; display: flex; gap: 16px; align-items: center">
<div style="flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%; background: #7EE80A; display: flex; align-items: center; justify-content: center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></div>
<div><div style="font-size: 18px; font-weight: 800">Services acceptance</div><div style="font-size: 15px; line-height: 1.45; font-weight: 500; margin-top: 2px">Services are accepted in writing by the customer; otherwise they are considered accepted within the payment term.</div></div>
</div>

<div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between">
<div style="display: flex; align-items: center; gap: 16px"><img src="${LOGO_COLOR}" alt="SoWash" style="width: 157px; height: 30px; display: block"><div style="font-size: 12px; line-height: 1.45; color: #2C5A74">www.sowash.pk</div></div>
<div style="display: flex; align-items: center; gap: 14px"><div style="font-size: 13px; font-weight: 800; color: #2C5A74">6 / 7</div><div style="width: 52px; height: 52px; border-radius: 50%; background: #33B8F0; display: flex; align-items: center; justify-content: center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"></path></svg></div></div>
</div>
</div>

</div>`,
    `<div style="width: 794px; height: 1123px; box-sizing: border-box; background: #FFFFFF; font-family: 'DM Sans', sans-serif; color: #073B57; display: flex; flex-direction: column">

<div style="padding: 36px 40px 22px; display: flex; flex-direction: column; gap: 12px">
<div style="display: flex; justify-content: space-between; align-items: flex-start">
<div style="background: #7EE80A; border-radius: 8px; padding: 6px 16px; font-size: 17px; font-weight: 800; color: #073B57">Commercial terms</div>
<div style="width: 72px; height: 72px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="2"></rect><path d="M3 10h18M7 15h3"></path></svg></div>
</div>
<h1 style="margin: -14px 0 0; font-size: 52px; line-height: 1; font-weight: 800; letter-spacing: -0.05em"><span style="color: #00699A">Payment</span> &amp; liability</h1>
<p style="margin: 0; font-size: 15px; line-height: 1.45; color: #1E4A63">Prices and payment conditions are set in the Commercial Offer. Unless it says otherwise, maintenance contract fees are paid at the start of each yearly period, Services on Request and Additional Work are invoiced on a time basis, all prices are exclusive of tax, and invoices are paid by bank transfer within 30 days end of month.</p>
<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px">
<div style="background: #33B8F0; border-radius: 14px; padding: 12px 16px"><div style="font-size: 30px; font-weight: 800; letter-spacing: -0.04em; line-height: 1">30 days</div><div style="font-size: 14px; font-weight: 700; margin-top: 6px">Invoice payment by bank transfer, end of month</div></div>
<div style="background: #DDF3FC; border-radius: 14px; padding: 12px 16px"><div style="font-size: 30px; font-weight: 800; letter-spacing: -0.04em; line-height: 1">Yearly</div><div style="font-size: 14px; font-weight: 700; margin-top: 6px">Maintenance fees paid at the start of each period</div></div>
<div style="background: #DDF3FC; border-radius: 14px; padding: 12px 16px"><div style="font-size: 30px; font-weight: 800; letter-spacing: -0.04em; line-height: 1">Excl. tax</div><div style="font-size: 14px; font-weight: 700; margin-top: 6px">All prices, unless the Commercial Offer says otherwise</div></div>
</div>
</div>

<div style="flex: 1; background: #DDF3FC; padding: 22px 40px 28px; display: flex; flex-direction: column; gap: 12px">
<div style="background: #FFFFFF; border-radius: 16px; padding: 16px 20px 18px">
<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px"><div style="width: 40px; height: 40px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"></path></svg></div><div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em">Liability</div><div style="flex: 1; height: 2px; background: #DDF3FC; margin-left: 6px"></div></div>
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 22px">
<div style="display: flex; gap: 12px; align-items: flex-start"><div style="flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: #7EE80A; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800">1</div><div><div style="font-size: 15px; font-weight: 800">Limited to the Agreement</div><div style="font-size: 13px; line-height: 1.45; margin-top: 3px; color: #1E4A63">SoWash's liability is strictly limited to the obligations stated in the Agreement.</div></div></div>
<div style="display: flex; gap: 12px; align-items: flex-start"><div style="flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: #33B8F0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800">2</div><div><div style="font-size: 15px; font-weight: 800">Capped amount</div><div style="font-size: 13px; line-height: 1.45; margin-top: 3px; color: #1E4A63">Limited to direct and foreseeable physical damage, never more than the service price — or the annual fee for the unit concerned under a maintenance contract.</div></div></div>
<div style="display: flex; gap: 12px; align-items: flex-start"><div style="flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: #7EE80A; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800">3</div><div><div style="font-size: 15px; font-weight: 800">Exceptions</div><div style="font-size: 13px; line-height: 1.45; margin-top: 3px; color: #1E4A63">The limits above do not apply to very serious negligence by SoWash or to compensation for personal injury.</div></div></div>
<div style="display: flex; gap: 12px; align-items: flex-start"><div style="flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: #33B8F0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800">4</div><div><div style="font-size: 15px; font-weight: 800">No indirect or consequential loss</div><div style="font-size: 13px; line-height: 1.45; margin-top: 3px; color: #1E4A63">No liability for any direct or indirect liabilities, losses, damages, costs, expenses, fines or penalties — including loss of profits, production or information, commercial damage, business or anticipated savings.</div></div></div>
<div style="display: flex; gap: 12px; align-items: flex-start"><div style="flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: #7EE80A; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800">5</div><div><div style="font-size: 15px; font-weight: 800">No legal &amp; claim costs</div><div style="font-size: 13px; line-height: 1.45; margin-top: 3px; color: #1E4A63">Excludes fees on a full indemnity basis and costs of investigation, litigation, settlement, judgment and interest — whether in contract, tort (incl. negligence), statute or otherwise.</div></div></div>
<div style="display: flex; gap: 12px; align-items: flex-start"><div style="flex: 0 0 auto; width: 30px; height: 30px; border-radius: 50%; background: #33B8F0; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800">6</div><div><div style="font-size: 15px; font-weight: 800">Micro power cuts</div><div style="font-size: 13px; line-height: 1.45; margin-top: 3px; color: #1E4A63">The customer accepts that micro power cuts may occur during services on mains power; SoWash's liability for resulting damage is excluded.</div></div></div>
</div>
</div>
<div style="position: relative; background: #FFFFFF; border-radius: 16px; padding: 16px 20px">
<div style="position: absolute; right: 16px; top: 16px; width: 40px; height: 40px; border-radius: 50%; background: #DDF3FC; display: flex; align-items: center; justify-content: center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00699A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17a4 4 0 0 1-.5-8A6 6 0 0 1 18 8a4.5 4.5 0 0 1 0 9z"></path><path d="M12 13l-2 4h4l-2 4"></path></svg></div>
<div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em">Force majeure</div>
<div style="font-size: 13.5px; line-height: 1.45; margin-top: 6px; padding-right: 40px">SoWash is not liable for failure or delay in meeting its obligations owing directly to acts of God, governmental orders, administrative restrictions, requisitions, warlike conditions, revolution, riot, looting, epidemic, strike, lockout, fire, flood, or any other event the competent courts consider force majeure.</div>
</div>

<div style="margin-top: auto; display: flex; align-items: center; justify-content: space-between">
<div style="display: flex; align-items: center; gap: 16px"><img src="${LOGO_COLOR}" alt="SoWash" style="width: 157px; height: 30px; display: block"><div style="font-size: 12px; line-height: 1.45; color: #2C5A74">www.sowash.pk</div></div>
<div style="display: flex; align-items: center; gap: 14px"><div style="font-size: 13px; font-weight: 800; color: #2C5A74">7 / 7</div><div style="width: 52px; height: 52px; border-radius: 50%; background: #33B8F0; display: flex; align-items: center; justify-content: center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#073B57" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></div></div>
</div>
</div>

</div>`,
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Quotation ${e(d.quoteNo)} — ${e(d.clientName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&display=swap" rel="stylesheet">
<style>${PAGE_CSS}</style>
</head>
<body>
${pages.map((p) => `<section class="q-page">${p}</section>`).join('\n')}
</body>
</html>`;
}

export const fileSafe = (s: unknown) => String(s || '').trim().replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
