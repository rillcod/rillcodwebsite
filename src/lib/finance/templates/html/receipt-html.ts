/**
 * buildReceiptHTML
 *
 * Client-safe HTML template for a rich, print-ready receipt preview.
 * Used by the Receipt Builder (live iframe preview + pop-up print + save).
 *
 * Server-side PDF receipts go through src/lib/finance/issue.ts which picks
 * receipt-individual.ts or receipt-school.ts from pdfmake definitions.
 */

export interface ReceiptHTMLInput {
  docRef: string;
  dateStr: string;
  payDateStr: string;
  payerLabel: string;
  payerType: string;
  paymentMethod: string;
  receivedBy: string;
  items: { description: string; quantity: number; unit_price: number }[];
  totalAmount: number;
  payToAcc?: { bank_name: string; account_number: string; account_name: string } | null;
  notes: string;
}

export function buildReceiptHTML(p: ReceiptHTMLInput): string {
  const {
    docRef, dateStr, payDateStr, payerLabel, payerType, paymentMethod,
    receivedBy, items, totalAmount, payToAcc, notes,
  } = p;
  const fmt = (n: number) => `\u20a6${n.toLocaleString('en-NG')}`;
  const methodLabels: Record<string, string> = {
    bank_transfer: 'Bank Transfer', cash: 'Cash', pos: 'POS Terminal',
    cheque: 'Cheque', online: 'Online Payment',
  };

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Payment Receipt \u2014 ${payerLabel}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:22px 24px}
@page{size:A4;margin:14mm 15mm}
@media print{body{padding:0}.no-print{display:none}}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:4px solid #059669;padding-bottom:14px;margin-bottom:18px}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-img{width:56px;height:56px;object-fit:contain}
.org-name{font-size:22px;font-weight:900;color:#059669;letter-spacing:-0.4px}
.org-sub{font-size:10px;color:#6b7280;margin-top:1px;font-weight:600}
.rcpt-badge{text-align:right}
.rcpt-label{font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:1px}
.rcpt-number{font-size:24px;font-weight:900;color:#065f46;letter-spacing:-0.5px}
.paid-stamp{display:inline-block;border:3px solid #059669;color:#059669;font-weight:900;font-size:18px;text-transform:uppercase;letter-spacing:3px;padding:4px 14px;border-radius:6px;transform:rotate(-5deg);margin-top:6px}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}
.party-box{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
.party-label{font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.party-name{font-size:15px;font-weight:900;color:#111827}
.party-sub{font-size:11px;color:#6b7280;margin-top:2px;line-height:1.4}
.meta-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:20px}
.meta-cell{flex:1;min-width:120px;background:#f0fdf4;border:1px solid #05966922;border-radius:8px;padding:10px 12px;text-align:center}
.meta-label{font-size:8px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
.meta-val{font-size:14px;font-weight:900;color:#065f46}
table{width:100%;border-collapse:collapse;margin-bottom:20px;border-radius:8px;overflow:hidden}
thead tr{background:#065f46;color:white}
thead th{padding:9px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
tbody tr{border-bottom:1px solid #e5e7eb}
tbody tr:nth-child(even){background:#f9fafb}
tbody td{padding:8px 12px;font-size:12px;color:#374151}
.totals-box{background:#f0fdf4;border:1px solid #05966922;border-radius:8px;padding:16px;margin-bottom:20px}
.totals-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.totals-label{font-size:11px;color:#6b7280}
.totals-val{font-size:12px;font-weight:700;color:#374151}
.totals-grand-label{font-size:14px;font-weight:900;color:#065f46}
.totals-grand-val{font-size:22px;font-weight:900;color:#059669}
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
hr{border:none;border-top:1px solid #05966922;margin:8px 0}
</style></head><body>
<div class="header">
  <div class="logo-block">
    <img src="/logo.png" class="logo-img" onerror="this.style.display='none'" />
    <div>
      <div class="org-name">RILLCOD TECHNOLOGIES</div>
      <div class="org-sub">STEM, Robotics &amp; AI Education Partner</div>
      <div style="font-size:9px;color:#059669;margin-top:2px;font-weight:700">www.rillcod.com \u00b7 support@rillcod.com \u00b7 08116600091</div>
    </div>
  </div>
  <div class="rcpt-badge">
    <div class="rcpt-label">Official Receipt</div>
    <div class="rcpt-number">${docRef}</div>
    <div style="font-size:10px;color:#6b7280;margin-top:4px"><b>Issued:</b> ${dateStr}</div>
    <div style="font-size:10px;color:#6b7280"><b>Payment Date:</b> ${payDateStr}</div>
    <div class="paid-stamp">PAID</div>
  </div>
</div>

<div class="parties">
  <div class="party-box">
    <div class="party-label">Received By</div>
    <div class="party-name">RILLCOD TECHNOLOGIES</div>
    <div class="party-sub">STEM, Robotics &amp; AI Education Provider<br/>Technology &amp; Innovation Specialists</div>
  </div>
  <div class="party-box">
    <div class="party-label">Received From</div>
    <div class="party-name">${payerLabel}</div>
    <div class="party-sub">${payerType === 'school' ? 'School Partner' : payerType === 'student' ? 'Enrolled Student' : 'Client'}<br/>Payment Method: <b>${methodLabels[paymentMethod] || paymentMethod}</b></div>
  </div>
</div>

<div class="meta-row">
  <div class="meta-cell"><div class="meta-label">Amount Paid</div><div class="meta-val">${fmt(totalAmount)}</div></div>
  <div class="meta-cell"><div class="meta-label">Payment Method</div><div class="meta-val" style="font-size:11px">${methodLabels[paymentMethod] || ''}</div></div>
  <div class="meta-cell"><div class="meta-label">Payment Date</div><div class="meta-val" style="font-size:11px">${payDateStr}</div></div>
  <div class="meta-cell"><div class="meta-label">Reference</div><div class="meta-val" style="font-size:11px">${docRef}</div></div>
</div>

<table>
<thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Amount</th></tr></thead>
<tbody>
  ${items.map(item => `<tr>
    <td><b>${item.description}</b></td>
    <td style="text-align:center">${item.quantity}</td>
    <td style="text-align:right">${fmt(item.unit_price)}</td>
    <td style="text-align:right;font-weight:700">${fmt(item.quantity * item.unit_price)}</td>
  </tr>`).join('')}
</tbody>
</table>

<div class="totals-box">
  ${items.length > 1 ? items.map(i => `<div class="totals-row"><span class="totals-label">${i.description}</span><span class="totals-val">${fmt(i.quantity * i.unit_price)}</span></div>`).join('') : ''}
  <hr/>
  <div class="totals-row"><span class="totals-grand-label">Total Amount Received</span><span class="totals-grand-val">${fmt(totalAmount)}</span></div>
</div>

${payToAcc ? `
<div class="bank-box">
  <div class="bank-title">Deposited To / Payment Account</div>
  <div class="bank-grid">
    <div class="bank-cell"><span class="bank-label">Bank Name</span><span class="bank-val">${payToAcc.bank_name}</span></div>
    <div class="bank-cell"><span class="bank-label">Account Number</span><span class="bank-val" style="font-size:14px;letter-spacing:1px">${payToAcc.account_number}</span></div>
    <div class="bank-cell" style="grid-column:span 2"><span class="bank-label">Account Name</span><span class="bank-val">${payToAcc.account_name}</span></div>
  </div>
</div>` : ''}

${notes ? `<div class="notes-box"><b>Notes:</b> ${notes}</div>` : ''}

<div class="footer">
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">${payerType === 'school' ? 'School Principal / Authority' : 'Payer Signature'}</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">${receivedBy}</div></div>
  <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Finance Officer / Stamp</div></div>
</div>
<div class="watermark">Official payment receipt from Rillcod Technologies \u00b7 Reference: ${docRef} \u00b7 ${dateStr}</div>
<div style="text-align:center;margin-top:10px">
  <button class="no-print" onclick="window.print()" style="padding:10px 28px;background:#059669;color:#fff;border:none;border-radius:8px;font-weight:900;font-size:13px;cursor:pointer;letter-spacing:1px">\ud83d\uddb6 Print Receipt</button>
</div>
</body></html>`;
}
