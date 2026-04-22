/**
 * buildSchoolInvoiceHTML
 *
 * Client-safe HTML template for a rich, print-ready school invoice preview.
 * Used by the School Invoice Builder (live iframe preview + pop-up print).
 *
 * Server-side PDF emission uses src/lib/finance/templates/receipt-school.ts
 * and the invoice-stream PDF endpoint. This HTML builder is for the interactive
 * builder experience ONLY (live preview, manual print).
 */

export interface SchoolInvoiceHTMLInput {
  sch: { name: string };
  isFixed: boolean;
  count: number;
  ratePerChild: number;
  fixedPrice: number;
  quotaPct: number;
  subtotal: number;
  deposit: number;
  rillcodShare: number;
  schoolShare: number;
  balance: number;
  revenueShareOn: boolean;
  dateStr: string;
  dueStr: string;
  docRef: string;
  payToAcc?: { bank_name: string; account_number: string; account_name: string } | null;
  showRevenueShare: boolean;
  showWhatsapp: boolean;
  notes: string;
  currency?: string;
}

export function buildSchoolInvoiceHTML(p: SchoolInvoiceHTMLInput): string {
  const {
    sch, isFixed, count, ratePerChild, fixedPrice, quotaPct, subtotal, deposit,
    rillcodShare, schoolShare, balance, revenueShareOn, dateStr, dueStr, docRef,
    payToAcc, showRevenueShare, showWhatsapp, notes, currency,
  } = p;
  const cur = (currency || 'NGN').toUpperCase();
  const fmt = (n: number) =>
    cur === 'USD'
      ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `\u20a6${n.toLocaleString('en-NG')}`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>School Invoice \u2014 ${sch.name}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:22px 24px}
@page{size:A4;margin:14mm 15mm}
@media print{body{padding:0}}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:4px solid #7c3aed;padding-bottom:14px;margin-bottom:18px}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-img{width:56px;height:56px;object-fit:contain}
.org-name{font-size:22px;font-weight:900;color:#7c3aed;letter-spacing:-0.4px}
.org-sub{font-size:10px;color:#6b7280;margin-top:1px;font-weight:600}
.inv-badge{text-align:right}
.inv-label{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.inv-number{font-size:24px;font-weight:900;color:#4c1d95;letter-spacing:-0.5px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}
.party-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
.party-label{font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.party-name{font-size:15px;font-weight:900;color:#111827}
.party-sub{font-size:11px;color:#6b7280;margin-top:2px;line-height:1.4}
.meta-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.meta-cell{flex:1;min-width:120px;background:#f3f0ff;border:1px solid #7c3aed22;border-radius:8px;padding:10px 12px;text-align:center}
.meta-label{font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.meta-val{font-size:15px;font-weight:900;color:#4c1d95}
table{width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden}
thead tr{background:#4c1d95;color:white}
thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
tbody tr{border-bottom:1px solid #e5e7eb}
tbody tr:nth-child(even){background:#f9fafb}
tbody td{padding:8px 12px;font-size:12px;color:#374151}
.totals-box{background:#f3f0ff;border:1px solid #7c3aed22;border-radius:8px;padding:16px;margin-bottom:12px;display:flex;flex-direction:column;gap:6px}
.totals-row{display:flex;justify-content:space-between;align-items:center}
.totals-label{font-size:11px;color:#6b7280}
.totals-val{font-size:12px;font-weight:700;color:#374151}
.totals-grand-label{font-size:14px;font-weight:900;color:#4c1d95}
.totals-grand-val{font-size:20px;font-weight:900;color:#4c1d95}
.balance-box{background:#fff7ed;border:2px solid #ea580c;padding:12px 16px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
.balance-label{font-size:12px;font-weight:900;color:#9a3412;text-transform:uppercase;letter-spacing:1px}
.balance-val{font-size:22px;font-weight:950;color:#ea580c}
.revenue-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.split-box{border-radius:8px;padding:12px 16px;text-align:center}
.split-rillcod{background:linear-gradient(135deg,#7c3aed11,#4f46e511);border:1px solid #7c3aed44}
.split-school{background:linear-gradient(135deg,#05966911,#059669aa11);border:1px solid #05966944}
.split-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.split-pct{font-size:14px;font-weight:900}
.split-amount{font-size:18px;font-weight:900;margin-top:2px}
.split-sub{font-size:9px;color:#9ca3af;margin-top:2px}
.bank-box{background:#f8fafc;border:1px solid #33415522;border-radius:8px;padding:14px;margin-bottom:18px}
.bank-title{font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.bank-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bank-cell{font-size:11px}
.bank-label{color:#94a3b8;font-weight:700;display:block;margin-bottom:1px;font-size:9px}
.bank-val{color:#334155;font-weight:800}
.notes-box{background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:11px;color:#92400e}
.footer{border-top:1px solid #e5e7eb;padding-top:14px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:8px}
.sig-box{text-align:center}
.sig-line{border-bottom:1px solid #374151;height:34px;margin-bottom:5px}
.sig-label{font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}
.watermark{text-align:center;margin-top:12px;font-size:8px;color:#9ca3af}
.status-paid{color:#059669;background:#d1fae5;padding:2px 10px;border-radius:20px;font-weight:800;font-size:11px}
.status-due{color:#d97706;background:#fef3c7;padding:2px 10px;border-radius:20px;font-weight:800;font-size:11px}
hr{border:none;border-top:1px solid #7c3aed22;margin:8px 0}
</style></head><body>
<div class="header">
  <div class="logo-block">
    <img src="/logo.png" class="logo-img" />
    <div>
      <div class="org-name">RILLCOD TECHNOLOGIES</div>
      <div class="org-sub">STEM, Robotics &amp; AI Education Partner</div>
      <div style="font-size:9px;color:#7c3aed;margin-top:2px;font-weight:700">www.rillcod.com \u00b7 support@rillcod.com \u00b7 08116600091</div>
    </div>
  </div>
  <div class="inv-badge">
    <div class="inv-label">School Invoice</div>
    <div class="inv-number">${docRef}</div>
    <div style="font-size:10px;color:#6b7280;margin-top:4px"><b>Date:</b> ${dateStr}</div>
    <div style="font-size:10px;color:#6b7280"><b>Due:</b> ${dueStr}</div>
    <div style="margin-top:6px"><span class="${balance <= 0 ? 'status-paid' : 'status-due'}">${balance <= 0 ? 'Fully Paid' : 'Awaiting Payment'}</span></div>
  </div>
</div>
<div class="parties">
  <div class="party-box">
    <div class="party-label">From (Billed By)</div>
    <div class="party-name">RILLCOD TECHNOLOGIES</div>
    <div class="party-sub">STEM, Robotics &amp; AI Education Provider<br/>Technology &amp; Innovation Specialists</div>
  </div>
  <div class="party-box">
    <div class="party-label">To (Bill To)</div>
    <div class="party-name">${sch.name}</div>
    <div class="party-sub">School Partner \u2014 Academic Session Invoice<br/>Payment due by ${dueStr}</div>
  </div>
</div>
<div class="meta-row">
  ${isFixed
    ? `<div class="meta-cell" style="background:#fff7ed;border-color:#ea580c33"><div class="meta-label" style="color:#ea580c">Pricing</div><div class="meta-val" style="color:#ea580c;font-size:11px">Fixed Package</div></div>`
    : `<div class="meta-cell"><div class="meta-label">Students</div><div class="meta-val">${count}</div></div>
       <div class="meta-cell"><div class="meta-label">Rate / Child</div><div class="meta-val">${fmt(ratePerChild)}</div></div>`
  }
  <div class="meta-cell"><div class="meta-label">Package Price</div><div class="meta-val">${fmt(subtotal)}</div></div>
  ${showRevenueShare ? `
  <div class="meta-cell"><div class="meta-label">Rillcod %</div><div class="meta-val">${quotaPct}%</div></div>
  <div class="meta-cell"><div class="meta-label">School %</div><div class="meta-val">${100 - quotaPct}%</div></div>
  ` : ''}
</div>
<table>
<thead><tr>
  <th>Description</th>
  ${isFixed ? '' : '<th style="text-align:center">Students</th><th style="text-align:right">Rate / Child</th>'}
  <th style="text-align:right">Amount</th>
</tr></thead>
<tbody>
  <tr>
    <td>
      <b>${isFixed ? 'STEM / AI / Coding \u2014 Fixed School Package' : 'STEM / AI / Coding Programme Fee'}</b>
      <br><span style="font-size:10px;color:#9ca3af">${sch.name} \u00b7 ${isFixed ? 'All students included \u2014 compulsory school programme' : 'Academic Term'}</span>
    </td>
    ${isFixed ? '' : `<td style="text-align:center;font-weight:700">${count}</td><td style="text-align:right">${fmt(ratePerChild)}</td>`}
    <td style="text-align:right;font-weight:700">${fmt(subtotal)}</td>
  </tr>
</tbody>
</table>
<div class="totals-box">
  <div class="totals-row">
    <span class="totals-label">${isFixed ? `Fixed Package Price` : `Total Fee (${count} students \u00d7 ${fmt(ratePerChild)})`}</span>
    <span class="totals-val">${fmt(subtotal)}</span>
  </div>
  ${revenueShareOn ? `
  <div class="totals-row">
    <span class="totals-label">Less School Commission / Share (${100 - quotaPct}%)</span>
    <span class="totals-val" style="color:#f43f5e">(${fmt(schoolShare)})</span>
  </div>
  ` : ''}
  <div class="totals-row"><span class="totals-label">Less Deposit / Previous Payment</span><span class="totals-val" style="color:#059669">(${fmt(deposit)})</span></div>
  <hr/>
  <div class="totals-row"><span class="totals-grand-label">Total Payable Amount</span><span class="totals-grand-val">${fmt(balance)}</span></div>
</div>

${balance > 0 ? `
<div class="balance-box">
  <div class="balance-label">${revenueShareOn ? 'Net Rillcod Balance' : 'Outstanding Balance'}</div>
  <div class="balance-val">${fmt(balance)}</div>
</div>
` : ''}

${revenueShareOn ? `
<div style="font-size:11px;font-weight:800;color:#4c1d95;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Revenue Allocation &amp; Split</div>
<div class="revenue-split">
  <div class="split-box split-rillcod">
    <div class="split-label" style="color:#7c3aed">RILLCOD TECHNOLOGIES</div>
    <div class="split-pct" style="color:#7c3aed">${quotaPct}% Share</div>
    <div class="split-amount" style="color:#4c1d95">${fmt(rillcodShare)}</div>
    ${deposit > 0 ? `<div style="font-size:9px; color:#7c3aed; margin-top:2px">Less Deposit: ${fmt(deposit)}</div>
    <div style="font-size:11px; font-weight:900; margin-top:4px; padding-top:4px; border-top:1px solid #7c3aed22">Net: ${fmt(balance)}</div>` : ''}
    <div class="split-sub" style="margin-top:6px">Final amount to be remitted</div>
  </div>
  <div class="split-box split-school">
    <div class="split-label" style="color:#059669">${sch.name}</div>
    <div class="split-pct" style="color:#059669">${100 - quotaPct}% Share</div>
    <div class="split-amount" style="color:#065f46">${fmt(schoolShare)}</div>
    <div class="split-sub" style="margin-top:6px">School's retained portion</div>
  </div>
</div>
` : ''}

${payToAcc ? `
<div class="bank-box">
  <div class="bank-title">Payment Instructions (Pay To)</div>
  <div class="bank-grid">
    <div class="bank-cell"><span class="bank-label">Bank Name</span><span class="bank-val">${payToAcc.bank_name}</span></div>
    <div class="bank-cell"><span class="bank-label">Account Number</span><span class="bank-val" style="font-size:14px;letter-spacing:1px">${payToAcc.account_number}</span></div>
    <div class="bank-cell" style="grid-column: span 2"><span class="bank-label">Account Name</span><span class="bank-val">${payToAcc.account_name}</span></div>
  </div>
</div>
` : ''}

${showWhatsapp ? `
<div style="background:#dcfce7; border:1px solid #16a34a33; border-radius:8px; padding:10px 14px; margin-bottom:18px; font-size:11px; color:#166534; display:flex; align-items:center; gap:8px">
  <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .018 5.393 0 12.03c0 2.12.554 4.189 1.604 6.046L0 24l6.109-1.603a11.803 11.803 0 005.937 1.597h.005c6.632 0 12.029-5.392 12.032-12.029a11.77 11.77 0 00-3.517-8.482z"/></svg>
  <span><b>WhatsApp Receipt:</b> Digital confirmation should be forwarded to the Tech Hub Admin or Director (08116600091) upon payment.</span>
</div>
` : ''}

${notes ? `<div class="notes-box"><b>Notes:</b> ${notes}</div>` : ''}
<div class="footer">
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">School Principal / Authority</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Rillcod Technologies Representative</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Finance Officer / Stamp</div></div>
</div>
<div class="watermark">This is a computer-generated invoice from Rillcod Technologies \u00b7 Reference: ${docRef} \u00b7 ${dateStr}</div>
</body></html>`;
}
