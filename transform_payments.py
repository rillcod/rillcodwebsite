import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('src/app/dashboard/payments/page.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# ── Extract HTML blocks ──────────────────────────────────────────────────────
si_lines = lines[648:838]
si_html_block = ''.join(si_lines)

rc_lines = lines[956:1085]
rc_html_block = ''.join(rc_lines)

# ── Adapt HTML blocks to function bodies ────────────────────────────────────
# School invoice: replace form-state refs with function params
si_fn_body = si_html_block
si_fn_body = si_fn_body.replace(
    '${schoolInvForm.show_revenue_share && quotaPct > 0 ? `',
    '${showRevenueShare ? `'
)
si_fn_body = si_fn_body.replace(
    '${schoolInvForm.show_whatsapp_option ? `',
    '${showWhatsapp ? `'
)
si_fn_body = si_fn_body.replace(
    '${schoolInvForm.notes ? `<div class="notes-box"><b>Notes:</b> ${schoolInvForm.notes}</div>` : \'\'}',
    '${notes ? `<div class="notes-box"><b>Notes:</b> ${notes}</div>` : \'\'}'
)
# Abuja -> Benin City in invoice template
si_fn_body = si_fn_body.replace('Abuja, Nigeria', 'Benin City, Edo State, Nigeria')
si_fn_body = si_fn_body.replace('Abuja', 'Benin City')
# Fix indentation: 4-space indent -> 2-space for function body
si_fn_body = si_fn_body.replace('    const html = `', '  const html = `')

# Receipt: replace form-state refs
rc_fn_body = rc_html_block
rc_fn_body = rc_fn_body.replace(
    "${receiptForm.payer_type === 'school' ? 'School Partner' : receiptForm.payer_type === 'student' ? 'Enrolled Student' : 'Client'}",
    "${payerType === 'school' ? 'School Partner' : payerType === 'student' ? 'Enrolled Student' : 'Client'}"
)
rc_fn_body = rc_fn_body.replace(
    '${methodLabels[receiptForm.payment_method] || receiptForm.payment_method}',
    '${methodLabels[paymentMethod] || paymentMethod}'
)
rc_fn_body = rc_fn_body.replace(
    "${receiptForm.received_by || 'Rillcod Technologies Representative'}",
    '${receivedBy}'
)
rc_fn_body = rc_fn_body.replace(
    "${receiptForm.payer_type === 'school' ? 'School Principal / Authority' : 'Payer Signature'}",
    "${payerType === 'school' ? 'School Principal / Authority' : 'Payer Signature'}"
)
rc_fn_body = rc_fn_body.replace(
    '${receiptForm.notes ? `<div class="notes-box"><b>Notes:</b> ${receiptForm.notes}</div>` : \'\'}',
    '${notes ? `<div class="notes-box"><b>Notes:</b> ${notes}</div>` : \'\'}'
)
# Abuja -> Benin City in receipt template
rc_fn_body = rc_fn_body.replace('Abuja, Nigeria', 'Benin City, Edo State, Nigeria')
rc_fn_body = rc_fn_body.replace('Abuja', 'Benin City')
rc_fn_body = rc_fn_body.replace('    const html = `', '  const html = `')

# ── Build helper block to insert before component ────────────────────────────
HELPERS = (
"""
// ── Scaled iframe preview (shows actual document HTML, mobile-responsive) ──
function ScaledIframePreview({ html, label }: { html: string; label: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.48);
  const [height, setHeight] = useState(1100);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / 900);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{label}</p>
      <div ref={containerRef} className="w-full overflow-hidden rounded-sm bg-white" style={{ height: height * scale }}>
        <div style={{ width: 900, transformOrigin: 'top left', transform: `scale(${scale})` }}>
          <iframe
            srcDoc={html}
            style={{ width: 900, height, border: 'none', display: 'block' }}
            onLoad={e => {
              try {
                const h = (e.target as HTMLIFrameElement).contentDocument?.body?.scrollHeight;
                if (h && h > 100) setHeight(h + 32);
              } catch { /**/ }
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── School Invoice HTML builder ─────────────────────────────────────────────
function buildSchoolInvHTML(p: {
  sch: { name: string }; isFixed: boolean; count: number; ratePerChild: number;
  fixedPrice: number; quotaPct: number; subtotal: number; deposit: number;
  rillcodShare: number; schoolShare: number; balance: number; revenueShareOn: boolean;
  dateStr: string; dueStr: string; docRef: string;
  payToAcc?: { bank_name: string; account_number: string; account_name: string } | null;
  showRevenueShare: boolean; showWhatsapp: boolean; notes: string;
}): string {
  const { sch, isFixed, count, ratePerChild, fixedPrice, quotaPct, subtotal, deposit,
    rillcodShare, schoolShare, balance, revenueShareOn, dateStr, dueStr, docRef,
    payToAcc, showRevenueShare, showWhatsapp, notes } = p;
  const fmtNGN = (n: number) => `\u20a6${n.toLocaleString('en-NG')}`;
"""
+ si_fn_body +
"""  return html;
}

// ── Receipt HTML builder ────────────────────────────────────────────────────
function buildReceiptHTML(p: {
  docRef: string; dateStr: string; payDateStr: string;
  payerLabel: string; payerType: string; paymentMethod: string;
  receivedBy: string; items: { description: string; quantity: number; unit_price: number }[];
  totalAmount: number;
  payToAcc?: { bank_name: string; account_number: string; account_name: string } | null;
  notes: string;
}): string {
  const { docRef, dateStr, payDateStr, payerLabel, payerType, paymentMethod,
    receivedBy, items, totalAmount, payToAcc, notes } = p;
  const fmtNGN = (n: number) => `\u20a6${n.toLocaleString('en-NG')}`;
  const methodLabels: Record<string, string> = {
    bank_transfer: 'Bank Transfer', cash: 'Cash', pos: 'POS Terminal', cheque: 'Cheque', online: 'Online Payment',
  };
"""
+ rc_fn_body +
"""  return html;
}

"""
)

# ── New useMemos ─────────────────────────────────────────────────────────────
NEW_SI_MEMO = """  // \u2500\u2500 Live preview HTML for School Invoice Builder \u2500\u2500
  const schoolInvPreviewHTML = useMemo(() => {
    const sch = schools.find(s => s.id === schoolInvForm.school_id);
    if (!sch) return '<html><body style="font-family:sans-serif;padding:32px;color:#9ca3af;background:#fff"><p style="font-size:14px">Select a school to see the preview</p></body></html>';
    const isFixed = schoolInvForm.pricing_mode === 'fixed_package';
    const count = parseInt(schoolInvForm.manual_student_count) || schoolInvStudentCount || 0;
    const ratePerChild = parseFloat(schoolInvForm.rate_per_child) || 0;
    const fixedPrice = parseFloat(schoolInvForm.fixed_package_price) || 0;
    const quotaPct = parseFloat(schoolInvForm.rillcod_quota_percent) || 0;
    const subtotal = isFixed ? fixedPrice : ratePerChild * count;
    const deposit = parseFloat(schoolInvForm.deposit_amount) || 0;
    const revenueShareOn = schoolInvForm.show_revenue_share && quotaPct > 0;
    const rillcodShare = Math.round(subtotal * (quotaPct / 100));
    const schoolShare = subtotal - rillcodShare;
    const balance = revenueShareOn ? Math.max(0, rillcodShare - deposit) : Math.max(0, subtotal - deposit);
    const payToAcc = accounts.find(a => a.id === schoolInvForm.pay_to_account_id);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const dueStr = schoolInvForm.due_date
      ? new Date(schoolInvForm.due_date).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
      : '\u2014';
    return buildSchoolInvHTML({
      sch, isFixed, count, ratePerChild, fixedPrice, quotaPct, subtotal, deposit,
      rillcodShare, schoolShare, balance, revenueShareOn, dateStr, dueStr,
      docRef: 'PREVIEW', payToAcc,
      showRevenueShare: schoolInvForm.show_revenue_share,
      showWhatsapp: schoolInvForm.show_whatsapp_option,
      notes: schoolInvForm.notes || '',
    });
  }, [schoolInvForm, schoolInvStudentCount, schools, accounts]);
"""

NEW_RC_MEMO = """  // \u2500\u2500 Live preview HTML for Receipt Builder \u2500\u2500
  const receiptPreviewHTML = useMemo(() => {
    const sch = receiptForm.school_id ? schools.find(s => s.id === receiptForm.school_id) : null;
    const payToAcc = receiptForm.pay_to_account_id ? accounts.find(a => a.id === receiptForm.pay_to_account_id) : null;
    const items = receiptForm.items.filter(i => i.description && i.unit_price > 0);
    const totalAmount = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const payerLabel = receiptForm.payer_name || sch?.name || '\u2014 Enter payer name \u2014';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const payDateStr = receiptForm.payment_date
      ? new Date(receiptForm.payment_date).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' })
      : dateStr;
    return buildReceiptHTML({
      docRef: 'PREVIEW', dateStr, payDateStr, payerLabel,
      payerType: receiptForm.payer_type, paymentMethod: receiptForm.payment_method,
      receivedBy: receiptForm.received_by || 'Rillcod Technologies Representative',
      items, totalAmount, payToAcc, notes: receiptForm.notes || '',
    });
  }, [receiptForm, schools, accounts]);
"""

# ── New preview columns ───────────────────────────────────────────────────────
NEW_SI_COL = """                {/* Preview column */}
                <div className="w-full lg:w-[460px] lg:flex-shrink-0 border-t lg:border-t-0 lg:border-l border-primary/20 bg-white/[0.02] p-4 sm:p-5 lg:self-start lg:sticky lg:top-6">
                  <ScaledIframePreview html={schoolInvPreviewHTML} label="Live Invoice Preview" />
                </div>
"""

NEW_RC_COL = """                {/* Preview column */}
                <div className="w-full lg:w-[460px] lg:flex-shrink-0 border-t lg:border-t-0 lg:border-l border-primary/20 bg-white/[0.02] p-4 sm:p-5 lg:self-start lg:sticky lg:top-6">
                  <ScaledIframePreview html={receiptPreviewHTML} label="Live Receipt Preview" />
                </div>
"""

# ── Apply changes from bottom to top ─────────────────────────────────────────
# Replace receipt preview column (lines 2202-2207, 0-indexed 2201-2206)
lines[2201:2207] = NEW_RC_COL.splitlines(keepends=True)

# Replace school invoice preview column (lines 2046-2051, 0-indexed 2045-2050)
lines[2045:2051] = NEW_SI_COL.splitlines(keepends=True)

# Replace receipt useMemo (lines 1234-1260, 0-indexed 1233-1259)
lines[1233:1260] = NEW_RC_MEMO.splitlines(keepends=True)

# Replace school invoice useMemo (lines 1208-1232, 0-indexed 1207-1231)
lines[1207:1232] = NEW_SI_MEMO.splitlines(keepends=True)

# Replace school invoice HTML template with function call (lines 649-838, 0-indexed 648-837)
si_call = "    const html = buildSchoolInvHTML({ sch: sch!, isFixed, count, ratePerChild, fixedPrice, quotaPct, subtotal, deposit, rillcodShare, schoolShare, balance, revenueShareOn, dateStr, dueStr, docRef, payToAcc, showRevenueShare: schoolInvForm.show_revenue_share, showWhatsapp: schoolInvForm.show_whatsapp_option, notes: schoolInvForm.notes || '' });\n"
lines[648:838] = [si_call]

# Receipt block indices shift. Original: 956-1084. Shift: -(838-648-1) = -189
# New: 956-189=767 to 1084-189=895  -> so lines[767:896]
rc_call = "    const html = buildReceiptHTML({ docRef, dateStr, payDateStr, payerLabel, payerType: receiptForm.payer_type, paymentMethod: receiptForm.payment_method, receivedBy: receiptForm.received_by || 'Rillcod Technologies Representative', items, totalAmount, payToAcc, notes: receiptForm.notes || '' });\n"
lines[767:896] = [rc_call]

# Insert helpers before the component
comp_idx = next(i for i, l in enumerate(lines) if l.strip().startswith('export default function PaymentsPage()'))
lines[comp_idx:comp_idx] = HELPERS.splitlines(keepends=True)

# Fix imports
for i, line in enumerate(lines):
    if "import { useState, useEffect, useMemo } from 'react';" in line:
        lines[i] = line.replace(
            "import { useState, useEffect, useMemo } from 'react';",
            "import { useState, useEffect, useMemo, useRef } from 'react';"
        )
        break

for i, line in enumerate(lines):
    if "import SmartDocument from '@/components/finance/SmartDocument';" in line:
        lines[i] = ''
        break

# Write output
with open('src/app/dashboard/payments/page.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done! New line count:", len(lines))
