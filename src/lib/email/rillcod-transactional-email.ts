/**
 * Rillcod Technologies — branded transactional email system.
 * Table-based layout: renders correctly in Gmail, Outlook, Apple Mail, Yahoo, and mobile clients.
 *
 * Exports:
 *   buildRillcodTransactionalEmailHtml  — generic branded wrapper (use for one-off emails)
 *   buildWelcomeEmail                  — new user onboarding
 *   buildPaymentConfirmationEmail       — payment received / receipt
 *   buildInvoiceEmail                  — invoice issued (with line items)
 *   buildAssignmentEmail               — new assignment notification
 *   buildReportEmail                   — term report card released
 *   buildSupportTicketEmail            — support ticket opened / updated
 *   buildAnnouncementEmail             — school-wide announcement
 *   buildSubscriptionEmail             — subscription status (activated / expiring / renewed)
 *   buildOptInConfirmationEmail        — WhatsApp opt-in/out confirmation
 */

import { brandContact } from '@/config/brand';

// ── Utilities ────────────────────────────────────────────────────────────────

/**
 * Returns true if the address is a @rillcod.com in-app handle that has no
 * real SMTP mailbox. These addresses must be delivered as in-app notifications
 * rather than sent via SendPulse/Resend.
 *
 * support@rillcod.com is the one exception — it is a real monitored inbox.
 */
export function isInAppEmail(email: string): boolean {
  const lower = String(email).trim().toLowerCase();
  return lower.endsWith('@rillcod.com') && lower !== brandContact.email;
}

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nl2p(text: string, style = 'margin:0 0 10px;color:#d4d4d8;font-size:15px;line-height:1.65;'): string {
  return text
    .split('\n')
    .map(line => `<p style="${style}">${escapeHtml(line) || '&nbsp;'}</p>`)
    .join('');
}

function currency(amount: number, code = 'NGN'): string {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: code, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

// ── Shared constants ─────────────────────────────────────────────────────────

const BRAND = {
  name:       brandContact.displayName,
  tagline:    brandContact.tagline.replace(/&/g, '&amp;'),
  address:    brandContact.address,
  phone:      brandContact.phone,
  primary:    '#f59e0b',   // amber
  primaryDark:'#d97706',
  success:    '#10b981',   // emerald
  info:       '#6366f1',   // indigo
  danger:     '#ef4444',   // red
  bg:         '#0b0c0e',
  card:       '#141618',
  cardAlt:    '#1c1e22',
  border:     '#2a2d33',
  text:       '#d4d4d8',
  textMuted:  '#71717a',
  textFaint:  '#52525b',
  white:      '#ffffff',
  supportEmail: brandContact.email,
  siteUrl:    brandContact.siteUrl,
};

// ── Base template ────────────────────────────────────────────────────────────

export type TransactionalSummaryRow = { label: string; value: string; highlight?: boolean };

export type RillcodTransactionalEmailArgs = {
  appUrl?:       string;
  /** Small uppercase eyebrow text under logo (e.g. school name) */
  eyebrow?:      string;
  title:         string;
  bodyHtml:      string;
  summaryRows?:  TransactionalSummaryRow[];
  cta?:          { href: string; label: string; color?: string };
  secondaryCta?: { href: string; label: string };
  footerNote?:   string;
  accentColor?:  string;
  /** Extra HTML block after the CTA (e.g. alert boxes, secondary info) */
  extraBlock?:   string;
};

export function buildRillcodTransactionalEmailHtml(args: RillcodTransactionalEmailArgs): string {
  const appUrl     = (args.appUrl || process.env.NEXT_PUBLIC_APP_URL || BRAND.siteUrl).replace(/\/$/, '');
  // Email image proxies (Gmail/Outlook) do NOT follow redirects, and the bare
  // domain (rillcod.com) 307-redirects to www — which silently breaks the logo.
  // Serve email images from a canonical, non-redirecting host.
  const assetBase  = (process.env.NEXT_PUBLIC_ASSET_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  const logoUrl    = `${assetBase}/images/logo.png`;
  const eyebrow    = escapeHtml(args.eyebrow ?? BRAND.name);
  const accent     = args.accentColor ?? BRAND.primary;

  // ── Summary table ──
  const summaryBlock = args.summaryRows && args.summaryRows.length > 0
    ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-collapse:collapse;">
        <tr><td style="background:${BRAND.cardAlt};border:1px solid ${BRAND.border};border-bottom:none;padding:10px 16px;">
          <p style="margin:0;font-size:10px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">Details</p>
        </td></tr>
        ${args.summaryRows.map((r, i) => `
        <tr>
          <td style="background:${i % 2 === 0 ? BRAND.cardAlt : BRAND.card};border:1px solid ${BRAND.border};border-top:none;padding:10px 16px 10px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="font-size:12px;color:${BRAND.textMuted};font-weight:700;width:38%;vertical-align:top;padding-right:8px;">${escapeHtml(r.label)}</td>
                <td style="font-size:13px;color:${r.highlight ? accent : BRAND.white};font-weight:${r.highlight ? '800' : '500'};text-align:right;">${escapeHtml(r.value)}</td>
              </tr>
            </table>
          </td>
        </tr>`).join('')}
      </table>`
    : '';

  // ── CTA button ──
  const ctaColor = args.cta?.color ?? accent;
  const ctaBlock = args.cta
    ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
        <tr>
          <td style="border-radius:6px;background:${ctaColor};">
            <a href="${escapeHtml(args.cta.href)}"
               style="display:inline-block;background:${ctaColor};color:#111827;text-decoration:none;
                      padding:13px 30px;font-size:13px;font-weight:800;letter-spacing:0.6px;
                      text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;border-radius:6px;">
              ${escapeHtml(args.cta.label)} &rarr;
            </a>
          </td>
        </tr>
      </table>`
    : '';

  const secondaryCtaBlock = args.secondaryCta
    ? `<p style="margin:0 0 20px;">
        <a href="${escapeHtml(args.secondaryCta.href)}"
           style="font-size:12px;color:${BRAND.textMuted};text-decoration:underline;">
          ${escapeHtml(args.secondaryCta.label)}
        </a>
      </p>`
    : '';

  const footerNote = args.footerNote
    ? `<p style="margin:0 0 10px;font-size:12px;color:${BRAND.textMuted};">${args.footerNote}</p>`
    : '';

  // Preheader: hidden preview text shown after subject in inbox — keeps spam filters happy
  const preheader = `${args.title} — Rillcod Technologies`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(args.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<!-- Preheader (hidden) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:${BRAND.bg};line-height:1px;">
  ${escapeHtml(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>

<!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.bg}"><tr><td><![endif]-->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:${BRAND.bg};min-height:100%;font-family:Arial,Helvetica,sans-serif;">
  <tr>
    <td align="center" style="padding:36px 16px 48px;">

      <!-- Card -->
      <table width="600" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:8px;overflow:hidden;">

        <!-- Accent bar -->
        <tr><td style="background:${accent};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- Header -->
        <tr>
          <td style="padding:24px 28px 20px;border-bottom:1px solid ${BRAND.border};">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td width="48" valign="middle" style="padding-right:12px;">
                  <img src="${logoUrl}" alt="Rillcod Technologies"
                       width="40" height="40"
                       style="display:block;width:40px;height:40px;object-fit:contain;
                              background:#fff;padding:3px;border-radius:6px;" />
                </td>
                <td valign="middle">
                  <p style="margin:0 0 2px;font-size:9px;color:${accent};font-weight:800;
                             letter-spacing:2px;text-transform:uppercase;">${eyebrow}</p>
                  <h1 style="margin:0;font-size:19px;font-weight:800;color:${BRAND.white};line-height:1.3;">
                    ${escapeHtml(args.title)}
                  </h1>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:26px 28px 10px;">
            <div style="font-size:14px;color:${BRAND.text};line-height:1.65;">
              ${args.bodyHtml}
            </div>
          </td>
        </tr>

        <!-- Summary -->
        ${summaryBlock ? `<tr><td style="padding:0 28px;">${summaryBlock}</td></tr>` : ''}

        <!-- Extra block -->
        ${args.extraBlock ? `<tr><td style="padding:0 28px;">${args.extraBlock}</td></tr>` : ''}

        <!-- CTA -->
        ${ctaBlock ? `<tr><td style="padding:4px 28px 0;">${ctaBlock}</td></tr>` : ''}
        ${secondaryCtaBlock ? `<tr><td style="padding:0 28px;">${secondaryCtaBlock}</td></tr>` : ''}

        <!-- Divider -->
        <tr>
          <td style="padding:20px 28px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr><td style="border-top:1px solid ${BRAND.border};"></td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 28px 26px;">
            ${footerNote}
            <p style="margin:0 0 4px;font-size:12px;color:${BRAND.textMuted};">
              Questions? Email
              <a href="mailto:${BRAND.supportEmail}"
                 style="color:${accent};text-decoration:none;font-weight:700;">${BRAND.supportEmail}</a>
            </p>
            <table cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;" width="100%">
              <tr>
                <td valign="middle" width="26" style="padding-right:8px;">
                  <img src="${logoUrl}" alt="" width="18" height="18"
                       style="display:block;width:18px;height:18px;object-fit:contain;opacity:0.45;" />
                </td>
                <td valign="middle">
                  <p style="margin:0;font-size:11px;color:${BRAND.textFaint};line-height:1.5;">
                    &copy; ${new Date().getFullYear()} Rillcod Technologies &middot; ${BRAND.tagline}<br/>
                    ${BRAND.address} &middot; ${BRAND.phone}<br/>
                    <a href="${BRAND.siteUrl}" style="color:${BRAND.textFaint};text-decoration:underline;">rillcod.com</a>
                  </p>
                </td>
                <td valign="middle" align="right" style="padding-left:8px;">
                  <a href="${appUrl}" style="font-size:10px;color:${BRAND.textFaint};text-decoration:underline;">Visit portal</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!-- / Card -->

    </td>
  </tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->

</body>
</html>`;
}

// ── Specific template builders ───────────────────────────────────────────────

/** Welcome / onboarding email for new students, parents, or staff. */
export function buildWelcomeEmail(opts: {
  recipientName: string;
  role: 'student' | 'parent' | 'teacher' | 'school' | 'admin';
  schoolName?: string;
  loginUrl: string;
  appUrl?: string;
}): string {
  const roleLabel: Record<string, string> = {
    student: 'Student',
    parent:  'Parent / Guardian',
    teacher: 'Teacher',
    school:  'School Administrator',
    admin:   'Platform Administrator',
  };

  const roleFeatures: Record<string, string[]> = {
    student: ['View and submit assignments', 'Access your course curriculum', 'Track your progress and grades', 'Message your teachers directly', 'Earn XP and unlock badges'],
    parent:  ['Monitor your child\'s progress in real time', 'Receive payment & assignment alerts', 'Communicate with teachers', 'View and pay invoices online', 'Access digital report cards'],
    teacher: ['Create and manage assignments', 'Grade student work with WAEC-aligned rubrics', 'Build lesson plans and curricula', 'Message students and parents', 'Generate AI-assisted content'],
    school:  ['Manage students, teachers, and classes', 'Configure billing and subscriptions', 'Track school-wide performance', 'Broadcast WhatsApp announcements', 'Access reports and analytics'],
    admin:   ['Full platform access and oversight', 'Manage all schools and users', 'Configure system-wide settings'],
  };

  const features = (roleFeatures[opts.role] || roleFeatures.student)
    .map(f => `<tr><td style="padding:4px 0;"><table cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="20" style="color:${BRAND.success};font-size:14px;vertical-align:top;padding-top:1px;">&#10003;</td>
      <td style="font-size:13px;color:${BRAND.text};line-height:1.5;">${escapeHtml(f)}</td>
    </tr></table></td></tr>`).join('');

  return buildRillcodTransactionalEmailHtml({
    appUrl:   opts.appUrl,
    eyebrow:  opts.schoolName ?? BRAND.name,
    title:    `Welcome to Rillcod Technologies, ${opts.recipientName.split(' ')[0]}!`,
    accentColor: BRAND.success,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        Your <strong style="color:${BRAND.white};">${roleLabel[opts.role] ?? opts.role}</strong> account has been successfully created on the Rillcod Technologies platform.
        ${opts.schoolName ? `You are enrolled with <strong style="color:${BRAND.white};">${escapeHtml(opts.schoolName)}</strong>.` : ''}
      </p>
      <p style="margin:0 0 14px;font-size:13px;color:${BRAND.textMuted};font-weight:800;text-transform:uppercase;letter-spacing:1px;">What you can do:</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">${features}</table>
    `,
    cta:        { href: opts.loginUrl, label: 'Access Your Dashboard', color: BRAND.success },
    footerNote: `<span style="color:${BRAND.textMuted};">If you didn't create this account, please contact us immediately.</span>`,
  });
}

/** Payment received / receipt confirmation. */
export function buildPaymentConfirmationEmail(opts: {
  recipientName: string;
  amount: number;
  currency?: string;
  reference: string;
  description: string;
  date?: string;
  schoolName?: string;
  portalUrl: string;
  appUrl?: string;
}): string {
  const dateStr = opts.date
    ? new Date(opts.date).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow:     opts.schoolName ?? BRAND.name,
    title:       'Payment Confirmed',
    accentColor: BRAND.success,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 20px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        We have successfully received your payment. Thank you! Your transaction details are below.
      </p>
      <!-- Amount highlight -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
        <tr>
          <td style="background:${BRAND.cardAlt};border:1px solid ${BRAND.border};border-left:4px solid ${BRAND.success};padding:18px 20px;border-radius:0 6px 6px 0;">
            <p style="margin:0 0 4px;font-size:11px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Amount Paid</p>
            <p style="margin:0;font-size:28px;font-weight:800;color:${BRAND.success};">${escapeHtml(currency(opts.amount, opts.currency ?? 'NGN'))}</p>
          </td>
        </tr>
      </table>
    `,
    summaryRows: [
      { label: 'Reference',   value: opts.reference,  highlight: true },
      { label: 'Description', value: opts.description },
      { label: 'Date',        value: dateStr },
      { label: 'Status',      value: '✓ Confirmed',   highlight: true },
    ],
    cta:        { href: opts.portalUrl, label: 'View Receipt', color: BRAND.success },
    footerNote: 'Please keep this email as proof of payment. Contact support if you have any questions about this transaction.',
  });
}

/** Invoice issued — with optional line items table. */
export type InvoiceLineItem = { description: string; qty?: number; unitPrice: number; currency?: string };
export type InvoiceBankAccount = { bank_name: string; account_number: string; account_name: string; label?: string | null; payment_note?: string | null };

export function buildInvoiceEmail(opts: {
  recipientName: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceLineItem[];
  currency?: string;
  notes?: string;
  schoolName?: string;
  isSchool?: boolean;
  paymentUrl: string;
  bankAccounts?: InvoiceBankAccount[];
  appUrl?: string;
  /** When set, adjusts intro copy, accent, and CTA for automated/staff reminders. */
  reminderLevel?: 1 | 2 | 3;
}): string {
  const curr = opts.currency ?? 'NGN';
  const total = opts.items.reduce((s, i) => s + (i.qty ?? 1) * i.unitPrice, 0);

  const itemRows = opts.items.map((item, idx) => `
    <tr style="background:${idx % 2 === 0 ? BRAND.card : BRAND.cardAlt};">
      <td style="padding:10px 14px;font-size:13px;color:${BRAND.text};border-bottom:1px solid ${BRAND.border};">${escapeHtml(item.description)}</td>
      <td style="padding:10px 14px;font-size:13px;color:${BRAND.textMuted};text-align:center;border-bottom:1px solid ${BRAND.border};">${item.qty ?? 1}</td>
      <td style="padding:10px 14px;font-size:13px;color:${BRAND.text};text-align:right;border-bottom:1px solid ${BRAND.border};">${currency(item.unitPrice, curr)}</td>
      <td style="padding:10px 14px;font-size:13px;color:${BRAND.white};font-weight:700;text-align:right;border-bottom:1px solid ${BRAND.border};">${currency((item.qty ?? 1) * item.unitPrice, curr)}</td>
    </tr>`).join('');

  const lineItemsTable = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;border-collapse:collapse;border:1px solid ${BRAND.border};border-radius:4px;overflow:hidden;">
      <tr style="background:${BRAND.cardAlt};">
        <th style="padding:10px 14px;font-size:10px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:1px;text-align:left;font-weight:800;border-bottom:1px solid ${BRAND.border};">Description</th>
        <th style="padding:10px 14px;font-size:10px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:1px;text-align:center;font-weight:800;border-bottom:1px solid ${BRAND.border};">Qty</th>
        <th style="padding:10px 14px;font-size:10px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:1px;text-align:right;font-weight:800;border-bottom:1px solid ${BRAND.border};">Unit Price</th>
        <th style="padding:10px 14px;font-size:10px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:1px;text-align:right;font-weight:800;border-bottom:1px solid ${BRAND.border};">Total</th>
      </tr>
      ${itemRows}
      <tr style="background:${BRAND.cardAlt};">
        <td colspan="3" style="padding:12px 14px;font-size:13px;color:${BRAND.textMuted};font-weight:800;text-transform:uppercase;letter-spacing:0.8px;">Total Due</td>
        <td style="padding:12px 14px;font-size:16px;color:${BRAND.primary};font-weight:800;text-align:right;">${currency(total, curr)}</td>
      </tr>
    </table>`;

  // ── Bank transfer section ──────────────────────────────────────────────────
  // Always show Providus Bank as fallback; append any extra accounts from DB
  const defaultAccount: InvoiceBankAccount = {
    bank_name: 'Providus Bank',
    account_number: '7901178957',
    account_name: 'Rillcod Ltd',
  };
  const accounts: InvoiceBankAccount[] = (opts.bankAccounts && opts.bankAccounts.length > 0)
    ? opts.bankAccounts
    : [defaultAccount];

  const accountRows = accounts.map(acc => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid ${BRAND.border};">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:12px;color:${BRAND.textMuted};width:38%;vertical-align:top;">${escapeHtml(acc.label ?? acc.bank_name)}</td>
            <td style="font-size:13px;color:${BRAND.white};font-weight:700;text-align:right;font-family:monospace,Arial;">
              ${escapeHtml(acc.account_number)}<br/>
              <span style="font-size:11px;color:${BRAND.textMuted};font-family:Arial;font-weight:400;">${escapeHtml(acc.account_name)}</span>
            </td>
          </tr>
        </table>
        ${acc.payment_note ? `<p style="margin:4px 0 0;font-size:11px;color:${BRAND.textMuted};">${escapeHtml(acc.payment_note)}</p>` : ''}
      </td>
    </tr>`).join('');

  const bankTransferBlock = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="margin:16px 0 6px;border-collapse:collapse;border:1px solid ${BRAND.border};border-radius:4px;overflow:hidden;">
      <tr style="background:${BRAND.cardAlt};">
        <td style="padding:10px 16px;border-bottom:1px solid ${BRAND.border};">
          <p style="margin:0;font-size:10px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:1.5px;font-weight:800;">
            Bank Transfer Details
          </p>
        </td>
      </tr>
      ${accountRows}
      <tr style="background:${BRAND.cardAlt};">
        <td style="padding:10px 16px;">
          <p style="margin:0;font-size:11px;color:${BRAND.textMuted};">
            After transferring, please reply to this email with your payment proof so we can confirm promptly.
          </p>
        </td>
      </tr>
    </table>`;

  const notesBlock = opts.notes
    ? `<p style="margin:8px 0 20px;font-size:12px;color:${BRAND.textMuted};">Note: ${escapeHtml(opts.notes)}</p>`
    : '';

  const dueStr   = new Date(opts.dueDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
  const issueStr = new Date(opts.issueDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });

  const schoolLabel = opts.schoolName ?? BRAND.name;
  const REMINDER_ACCENTS = { 1: '#2563eb', 2: '#d97706', 3: '#dc2626' } as const;
  const REMINDER_EYEBROWS = { 1: 'Invoice', 2: 'Payment Reminder', 3: 'Final Reminder — Overdue' } as const;

  let introCopy: string;
  let accentColor: string;
  let eyebrow: string;
  let title: string;
  let ctaLabel: string;

  if (opts.reminderLevel) {
    const level = opts.reminderLevel;
    accentColor = REMINDER_ACCENTS[level];
    eyebrow = `${REMINDER_EYEBROWS[level]} — ${schoolLabel}`;
    title = `Invoice #${opts.invoiceNumber}`;
    ctaLabel = 'View & Pay Invoice';
    const introByLevel = {
      1: `Please find your invoice from <strong style="color:${BRAND.white};">${escapeHtml(schoolLabel)}</strong> below. Payment is due by <strong style="color:${BRAND.white};">${dueStr}</strong>.`,
      2: `This is a friendly reminder that your invoice from <strong style="color:${BRAND.white};">${escapeHtml(schoolLabel)}</strong> is due on <strong style="color:${BRAND.white};">${dueStr}</strong>. Please make payment at your earliest convenience.`,
      3: `This is a <strong style="color:#fca5a5;">final reminder</strong> that your invoice from <strong style="color:${BRAND.white};">${escapeHtml(schoolLabel)}</strong> was due on <strong style="color:#fca5a5;">${dueStr}</strong> and is now <strong style="color:#fca5a5;">overdue</strong>. Please settle immediately to avoid service interruption.`,
    } as const;
    introCopy = `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 20px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        ${introByLevel[level]}
      </p>`;
  } else if (opts.isSchool) {
    accentColor = '#4338ca';
    eyebrow = `School Invoice — ${schoolLabel}`;
    title = `Invoice #${opts.invoiceNumber}`;
    ctaLabel = 'Pay via Portal';
    introCopy = `<p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Dear <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong> Team,
      </p>
      <p style="margin:0 0 20px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        Please find your school's invoice from <strong style="color:${BRAND.white};">Rillcod Technologies</strong> below.
        Kindly arrange payment by the due date to avoid any service interruption for your students.
      </p>`;
  } else {
    accentColor = BRAND.primary;
    eyebrow = schoolLabel;
    title = `Invoice #${opts.invoiceNumber}`;
    ctaLabel = 'Pay Now via Paystack';
    introCopy = `<p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 20px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        Please find your invoice details below. Kindly settle the balance by the due date to avoid any service interruption.
      </p>`;
  }

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow,
    title,
    accentColor,
    bodyHtml: introCopy,
    summaryRows: [
      { label: 'Invoice No.',  value: opts.invoiceNumber, highlight: true },
      { label: 'Issue Date',   value: issueStr },
      { label: 'Due Date',     value: dueStr,  highlight: true },
      { label: 'Amount Due',   value: currency(total, curr), highlight: true },
    ],
    extraBlock: lineItemsTable + bankTransferBlock + notesBlock,
    cta:        { href: opts.paymentUrl, label: ctaLabel, color: accentColor },
    footerNote: `Invoice issued by Rillcod Technologies · ${BRAND.address} · ${BRAND.phone}. Late payments may result in service suspension.`,
  });
}

/** New assignment notification for students or parents. */
export function buildAssignmentEmail(opts: {
  recipientName: string;
  studentName?: string;
  assignmentTitle: string;
  courseName?: string;
  className?: string;
  dueDate?: string;
  maxPoints?: number;
  instructions?: string;
  schoolName?: string;
  portalUrl: string;
  appUrl?: string;
}): string {
  const dueStr = opts.dueDate
    ? new Date(opts.dueDate).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : 'Check your portal';

  const summaryRows: TransactionalSummaryRow[] = [
    { label: 'Assignment', value: opts.assignmentTitle, highlight: true },
  ];
  if (opts.courseName)  summaryRows.push({ label: 'Course',    value: opts.courseName });
  if (opts.className)   summaryRows.push({ label: 'Class',     value: opts.className });
  if (opts.dueDate)     summaryRows.push({ label: 'Due Date',  value: dueStr, highlight: true });
  if (opts.maxPoints)   summaryRows.push({ label: 'Max Points',value: String(opts.maxPoints) });

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow:     opts.schoolName ?? BRAND.name,
    title:       'New Assignment Posted',
    accentColor: BRAND.info,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        ${opts.studentName
          ? `A new assignment has been posted for <strong style="color:${BRAND.white};">${escapeHtml(opts.studentName)}</strong>.`
          : 'A new assignment has been posted for you.'}
        Please log in to view the full instructions and submit your work before the deadline.
      </p>
      ${opts.instructions ? `
      <div style="background:${BRAND.cardAlt};border-left:3px solid ${BRAND.info};padding:14px 18px;margin:0 0 16px;border-radius:0 6px 6px 0;">
        <p style="margin:0 0 6px;font-size:10px;color:${BRAND.info};font-weight:800;text-transform:uppercase;letter-spacing:1px;">Instructions</p>
        <p style="margin:0;font-size:13px;color:${BRAND.text};line-height:1.6;">${escapeHtml(opts.instructions.slice(0, 400))}${opts.instructions.length > 400 ? '…' : ''}</p>
      </div>` : ''}
    `,
    summaryRows,
    cta:        { href: opts.portalUrl, label: 'View Assignment', color: BRAND.info },
    footerNote: `Submit on time to avoid late penalties. Log in to your Rillcod dashboard for full details.`,
  });
}

/** School performance report book — PDF attached for leadership review. */
export function buildSchoolPerformanceReportEmail(opts: {
  recipientName: string;
  schoolName: string;
  reportTitle: string;
  termLabel: string;
  academicYear?: string;
  senderName: string;
  message?: string;
  portalUrl: string;
  appUrl?: string;
}): string {
  const summaryRows: TransactionalSummaryRow[] = [
    { label: 'School', value: opts.schoolName, highlight: true },
    { label: 'Report', value: opts.reportTitle },
    { label: 'Term', value: opts.termLabel },
  ];
  if (opts.academicYear) summaryRows.push({ label: 'Academic year', value: opts.academicYear });

  const note = opts.message?.trim()
    ? `<p style="margin:0 0 16px;color:${BRAND.text};font-size:14px;line-height:1.65;">${escapeHtml(opts.message.trim())}</p>`
    : '';

  return buildRillcodTransactionalEmailHtml({
    appUrl: opts.appUrl,
    eyebrow: 'School performance report',
    title: 'Performance report attached',
    accentColor: BRAND.primary,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        <strong style="color:${BRAND.white};">${escapeHtml(opts.senderName)}</strong> from Rillcod Technologies has shared the
        <strong style="color:${BRAND.white};">${escapeHtml(opts.termLabel)}</strong> performance report for
        <strong style="color:${BRAND.white};">${escapeHtml(opts.schoolName)}</strong>.
        The full report book is attached as a PDF.
      </p>
      ${note}
      <p style="margin:0;color:${BRAND.textMuted};font-size:12px;line-height:1.6;">
        You can also open the live report in the Rillcod portal using the button below.
      </p>
    `,
    summaryRows,
    cta: { href: opts.portalUrl, label: 'Open in Rillcod', color: BRAND.primary },
    footerNote: 'This report was generated from verified school data on the Rillcod platform.',
  });
}

/** Term report card / results released notification. */
export function buildReportEmail(opts: {
  recipientName: string;
  studentName: string;
  term: string;
  academicYear?: string;
  schoolName?: string;
  overallGrade?: string;
  position?: string;
  portalUrl: string;
  appUrl?: string;
  /** URL for a 1×1 tracking pixel — generated by buildEmailTrackingPixelUrl() */
  trackingPixelUrl?: string;
}): string {
  const summaryRows: TransactionalSummaryRow[] = [
    { label: 'Student',  value: opts.studentName,    highlight: true },
    { label: 'Term',     value: opts.term },
  ];
  if (opts.academicYear)  summaryRows.push({ label: 'Academic Year', value: opts.academicYear });
  if (opts.overallGrade)  summaryRows.push({ label: 'Overall Grade', value: opts.overallGrade, highlight: true });
  if (opts.position)      summaryRows.push({ label: 'Position',      value: opts.position });

  const pixel = opts.trackingPixelUrl
    ? `<img src="${opts.trackingPixelUrl}" width="1" height="1" alt="" style="display:block;border:0;line-height:0;font-size:0;" />`
    : '';

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow:     opts.schoolName ?? BRAND.name,
    title:       'Report Card Released',
    accentColor: BRAND.primary,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        The <strong style="color:${BRAND.white};">${escapeHtml(opts.term)}</strong> report card for
        <strong style="color:${BRAND.white};">${escapeHtml(opts.studentName)}</strong> is now available on the Rillcod platform.
        Log in to view the full performance breakdown, subject grades, and teacher comments.
      </p>${pixel}
    `,
    summaryRows,
    cta:        { href: opts.portalUrl, label: 'View Report Card', color: BRAND.primary },
    footerNote: `Report cards are digitally verified. Share the QR code link with third parties for instant verification.`,
  });
}

/** Support ticket opened or updated. */
export function buildSupportTicketEmail(opts: {
  recipientName: string;
  ticketId: string;
  subject: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  message?: string;
  staffNote?: string;
  portalUrl: string;
  appUrl?: string;
}): string {
  const statusLabel: Record<string, { text: string; color: string }> = {
    open:        { text: '🟡 Open',        color: BRAND.primary },
    in_progress: { text: '🔵 In Progress', color: BRAND.info },
    resolved:    { text: '🟢 Resolved',    color: BRAND.success },
    closed:      { text: '⚫ Closed',      color: BRAND.textMuted },
  };
  const st = statusLabel[opts.status] ?? statusLabel.open;
  const isResolved = opts.status === 'resolved' || opts.status === 'closed';

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow:     BRAND.name,
    title:       isResolved ? 'Support Ticket Resolved' : `Support Ticket #${opts.ticketId}`,
    accentColor: st.color,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 20px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        ${isResolved
          ? `Your support ticket has been <strong style="color:${BRAND.success};">resolved</strong>. Thank you for your patience!`
          : `Your support ticket has been received and is being reviewed by our team. We aim to respond within <strong style="color:${BRAND.white};">2–4 hours</strong> during business hours.`}
      </p>
      ${opts.staffNote ? `
      <div style="background:${BRAND.cardAlt};border-left:3px solid ${st.color};padding:14px 18px;margin:0 0 16px;border-radius:0 6px 6px 0;">
        <p style="margin:0 0 6px;font-size:10px;color:${st.color};font-weight:800;text-transform:uppercase;letter-spacing:1px;">Staff Response</p>
        <p style="margin:0;font-size:13px;color:${BRAND.text};line-height:1.6;">${escapeHtml(opts.staffNote)}</p>
      </div>` : ''}
      ${opts.message ? `
      <div style="background:${BRAND.cardAlt};border:1px solid ${BRAND.border};padding:14px 18px;margin:0 0 16px;border-radius:6px;">
        <p style="margin:0 0 6px;font-size:10px;color:${BRAND.textMuted};font-weight:800;text-transform:uppercase;letter-spacing:1px;">Your Message</p>
        <p style="margin:0;font-size:13px;color:${BRAND.textMuted};line-height:1.6;">${escapeHtml(opts.message.slice(0, 500))}${opts.message.length > 500 ? '…' : ''}</p>
      </div>` : ''}
    `,
    summaryRows: [
      { label: 'Ticket ID', value: `#${opts.ticketId}`, highlight: true },
      { label: 'Subject',   value: opts.subject },
      { label: 'Category',  value: opts.category },
      { label: 'Status',    value: st.text, highlight: true },
    ],
    cta:        { href: opts.portalUrl, label: 'View Ticket', color: st.color },
    footerNote: `Reply to this email or log in to the portal to respond. Our team is available Mon–Fri 9 AM–5 PM WAT.`,
  });
}

/** School-wide announcement broadcast. */
export function buildAnnouncementEmail(opts: {
  recipientName: string;
  schoolName: string;
  announcementTitle: string;
  body: string;
  urgency?: 'normal' | 'important' | 'urgent';
  portalUrl: string;
  appUrl?: string;
}): string {
  const urgencyConfig = {
    normal:    { color: BRAND.info,    label: 'Announcement' },
    important: { color: BRAND.primary, label: '⚡ Important Notice' },
    urgent:    { color: '#ef4444',     label: '🚨 Urgent Notice' },
  };
  const urg = urgencyConfig[opts.urgency ?? 'normal'];

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow:     opts.schoolName,
    title:       opts.announcementTitle,
    accentColor: urg.color,
    bodyHtml: `
      <p style="margin:0 0 6px;font-size:10px;color:${urg.color};font-weight:800;text-transform:uppercase;letter-spacing:1.5px;">${escapeHtml(urg.label)}</p>
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <div style="background:${BRAND.cardAlt};border-left:3px solid ${urg.color};padding:16px 20px;margin:0 0 16px;border-radius:0 6px 6px 0;">
        ${nl2p(opts.body)}
      </div>
    `,
    cta:        { href: opts.portalUrl, label: 'View in Portal', color: urg.color },
    footerNote: `This announcement was sent by ${escapeHtml(opts.schoolName)} via Rillcod Technologies.`,
  });
}

/** Subscription status email (activated, expiring soon, renewed, suspended). */
export function buildSubscriptionEmail(opts: {
  recipientName: string;
  plan: string;
  status: 'activated' | 'expiring' | 'renewed' | 'suspended' | 'cancelled';
  renewalDate?: string;
  expiryDate?: string;
  amount?: number;
  currency?: string;
  schoolName?: string;
  portalUrl: string;
  appUrl?: string;
}): string {
  const statusConfig: Record<string, { color: string; title: string; message: string }> = {
    activated:  {
      color:   BRAND.success,
      title:   'Subscription Activated',
      message: `Your <strong style="color:${BRAND.white};">${escapeHtml(opts.plan)}</strong> subscription is now active. All platform features are unlocked and ready to use.`,
    },
    expiring: {
      color:   BRAND.primary,
      title:   'Subscription Expiring Soon',
      message: `Your <strong style="color:${BRAND.white};">${escapeHtml(opts.plan)}</strong> subscription is expiring soon. Renew now to avoid any interruption to your students' learning.`,
    },
    renewed: {
      color:   BRAND.success,
      title:   'Subscription Renewed',
      message: `Your <strong style="color:${BRAND.white};">${escapeHtml(opts.plan)}</strong> subscription has been successfully renewed. Thank you for your continued trust in Rillcod Technologies.`,
    },
    suspended: {
      color:   '#ef4444',
      title:   'Subscription Suspended',
      message: `Your <strong style="color:${BRAND.white};">${escapeHtml(opts.plan)}</strong> subscription has been suspended due to an outstanding balance. Please settle your invoice to restore access.`,
    },
    cancelled: {
      color:   BRAND.textMuted,
      title:   'Subscription Cancelled',
      message: `Your <strong style="color:${BRAND.white};">${escapeHtml(opts.plan)}</strong> subscription has been cancelled. Your access will remain until the end of the current billing period.`,
    },
  };
  const cfg = statusConfig[opts.status] ?? statusConfig.activated;

  const summaryRows: TransactionalSummaryRow[] = [{ label: 'Plan', value: opts.plan, highlight: true }];
  if (opts.amount)      summaryRows.push({ label: 'Amount',       value: currency(opts.amount, opts.currency ?? 'NGN') });
  if (opts.renewalDate) summaryRows.push({ label: 'Renewal Date', value: new Date(opts.renewalDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }), highlight: true });
  if (opts.expiryDate)  summaryRows.push({ label: 'Expiry Date',  value: new Date(opts.expiryDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }), highlight: opts.status === 'expiring' });
  summaryRows.push({ label: 'Status', value: opts.status.charAt(0).toUpperCase() + opts.status.slice(1), highlight: true });

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow:     opts.schoolName ?? BRAND.name,
    title:       cfg.title,
    accentColor: cfg.color,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 20px;color:${BRAND.text};font-size:15px;line-height:1.65;">${cfg.message}</p>
    `,
    summaryRows,
    cta:        { href: opts.portalUrl, label: 'Manage Subscription', color: cfg.color },
    footerNote: `For billing queries, contact finance@rillcod.com or call our support line.`,
  });
}

/** WhatsApp opt-in / opt-out confirmation email. */
export function buildOptInConfirmationEmail(opts: {
  recipientName: string;
  direction: 'in' | 'out';
  phoneNumber?: string;
  portalUrl: string;
  appUrl?: string;
}): string {
  const isIn = opts.direction === 'in';
  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow:     BRAND.name,
    title:       isIn ? 'WhatsApp Notifications Enabled' : 'Unsubscribed from WhatsApp Notifications',
    accentColor: isIn ? BRAND.success : BRAND.textMuted,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(opts.recipientName)}</strong>,
      </p>
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        ${isIn
          ? `You have successfully <strong style="color:${BRAND.success};">opted in</strong> to Rillcod Technologies WhatsApp notifications.
             You will now receive assignment reminders, payment confirmations, and important school updates via WhatsApp.`
          : `You have successfully <strong style="color:${BRAND.white};">unsubscribed</strong> from Rillcod Technologies WhatsApp notifications.
             You will no longer receive automated messages from us on WhatsApp.`}
      </p>
      ${opts.phoneNumber ? `<p style="margin:0 0 16px;font-size:13px;color:${BRAND.textMuted};">Registered number: <strong style="color:${BRAND.white};">+${escapeHtml(opts.phoneNumber)}</strong></p>` : ''}
      ${isIn ? '' : `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:14px;line-height:1.65;">
        To re-enable WhatsApp notifications, simply reply <strong style="color:${BRAND.white};">START</strong> to any Rillcod WhatsApp message,
        or update your preferences in the portal.
      </p>`}
    `,
    cta:        { href: opts.portalUrl, label: 'Manage Preferences', color: isIn ? BRAND.success : BRAND.primary },
    footerNote: `If you did not perform this action, please contact support immediately.`,
  });
}

/** Feedback form auto-response (acknowledged receipt, expected reply time). */
export function buildFeedbackAutoResponseEmail(opts: {
  recipientName?: string;
  feedbackText?: string;
  category?: string;
  appUrl?: string;
}): string {
  const name = opts.recipientName || 'there';
  const preview = opts.feedbackText ? opts.feedbackText.slice(0, 300) + (opts.feedbackText.length > 300 ? '…' : '') : null;

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow:     BRAND.name,
    title:       'We received your feedback',
    accentColor: BRAND.info,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Hello <strong style="color:${BRAND.white};">${escapeHtml(name)}</strong>,
      </p>
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        Thank you for reaching out to Rillcod Technologies! We've received your feedback and our team
        will review it carefully. We aim to respond within <strong style="color:${BRAND.white};">2–4 business hours</strong>.
      </p>
      ${opts.category ? `
      <p style="margin:0 0 14px;font-size:13px;color:${BRAND.textMuted};">
        Category: <strong style="color:${BRAND.white};">${escapeHtml(opts.category)}</strong>
      </p>` : ''}
      ${preview ? `
      <div style="background:${BRAND.cardAlt};border-left:3px solid ${BRAND.info};padding:14px 18px;margin:0 0 16px;border-radius:0 6px 6px 0;">
        <p style="margin:0 0 6px;font-size:10px;color:${BRAND.info};font-weight:800;text-transform:uppercase;letter-spacing:1px;">Your Message</p>
        <p style="margin:0;font-size:13px;color:${BRAND.textMuted};line-height:1.6;">${escapeHtml(preview)}</p>
      </div>` : ''}
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:14px;line-height:1.65;">
        In the meantime, you can also reach us at
        <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.info};text-decoration:none;font-weight:700;">${BRAND.supportEmail}</a>
        or through the Rillcod platform.
      </p>
    `,
    cta:        { href: opts.appUrl || BRAND.siteUrl, label: 'Back to Portal', color: BRAND.info },
    footerNote: `This is an automated acknowledgement. You will receive a personal reply from our team shortly.`,
  });
}

/** Generic outbound inbox message wrapper (used by the inbox email API route). */
export function buildInboxOutboundEmail(opts: {
  senderName: string;
  senderRole: string;
  senderOrg: string;
  senderClass?: string;
  subject: string;
  body: string;
  appUrl?: string;
}): string {
  return buildRillcodTransactionalEmailHtml({
    appUrl:   opts.appUrl,
    eyebrow:  opts.senderOrg || BRAND.name,
    title:    opts.subject,
    bodyHtml: `
      <p style="margin:0 0 12px;color:${BRAND.text};">
        <strong style="color:${BRAND.white};">From:</strong> ${escapeHtml(opts.senderName)} via Rillcod Technologies
      </p>
      <p style="margin:0 0 14px;color:${BRAND.textMuted};font-size:12px;">
        <strong style="color:${BRAND.white};">Role:</strong> ${escapeHtml(opts.senderRole.toUpperCase())}
        &nbsp;&middot;&nbsp;${escapeHtml(opts.senderOrg)}
        ${opts.senderClass ? `&nbsp;&middot;&nbsp;${escapeHtml(opts.senderClass)}` : ''}
      </p>
      <div style="background:${BRAND.cardAlt};border-left:3px solid ${BRAND.primary};padding:16px 20px;margin:0 0 16px;border-radius:0 6px 6px 0;">
        ${nl2p(opts.body)}
      </div>
    `,
    footerNote: `Sent via Rillcod Technologies Unified Inbox &middot; Reply to this email to respond directly to the sender.`,
  });
}

/** Confirmation email sent to a parent after submitting a public form lead. */
export function buildFormLeadConfirmationEmail(opts: {
  parentName: string;
  childName: string;
  programCategory?: string;
  formTitle: string;
  schoolName?: string;
  formType?: string;
  appUrl?: string;
}): string {
  const program = opts.programCategory === 'young_innovators'
    ? 'Young Innovators (PRY · Ages 5–10)'
    : opts.programCategory === 'teen_developers'
    ? 'Teen Developers (SEC · Ages 11–19)'
    : opts.programCategory ?? 'To be confirmed';

  const isAssessment = opts.formType === 'assessment';

  const nextSteps = isAssessment
    ? [
        'Our team will review your child\'s assessment responses',
        'We\'ll reach out within 24 hours to discuss the best programme fit',
        'A personalised learning plan will be prepared for your child',
      ]
    : [
        'Your registration details have been received',
        'Our team will confirm your child\'s placement within 24 hours',
        'You\'ll receive a welcome message with next steps and class schedule',
      ];

  const stepsHtml = nextSteps.map((step, i) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid ${BRAND.border};">
        <table cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="width:28px;vertical-align:top;">
              <div style="width:22px;height:22px;border-radius:50%;background:${BRAND.primary};
                          color:#111;font-size:11px;font-weight:800;text-align:center;
                          line-height:22px;font-family:Arial,sans-serif;">${i + 1}</div>
            </td>
            <td style="font-size:13px;color:${BRAND.text};padding-left:10px;line-height:1.5;">
              ${escapeHtml(step)}
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.appUrl,
    eyebrow:     opts.schoolName ?? BRAND.name,
    title:       isAssessment ? 'Assessment Received ✓' : 'Registration Confirmed ✓',
    accentColor: BRAND.success,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        Dear <strong style="color:${BRAND.white};">${escapeHtml(opts.parentName)}</strong>,
      </p>
      <p style="margin:0 0 20px;color:${BRAND.text};font-size:15px;line-height:1.65;">
        Thank you for ${isAssessment ? 'completing the assessment' : 'registering'}
        <strong style="color:${BRAND.white};">${escapeHtml(opts.childName)}</strong>
        with <strong style="color:${BRAND.white};">${escapeHtml(opts.schoolName ?? 'Rillcod Technologies')}</strong>.
        We are excited to welcome your child to our coding family!
      </p>
    `,
    summaryRows: [
      { label: 'Child',    value: opts.childName,  highlight: true },
      { label: 'Form',     value: opts.formTitle },
      { label: 'Programme', value: program, highlight: true },
    ],
    extraBlock: `
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
             style="margin:0 0 20px;border-collapse:collapse;border:1px solid ${BRAND.border};border-radius:4px;overflow:hidden;">
        <tr style="background:${BRAND.cardAlt};">
          <td style="padding:10px 16px;border-bottom:1px solid ${BRAND.border};">
            <p style="margin:0;font-size:10px;color:${BRAND.textMuted};text-transform:uppercase;
                      letter-spacing:1.5px;font-weight:800;">What happens next</p>
          </td>
        </tr>
        ${stepsHtml}
      </table>`,
    footerNote: `${BRAND.name} · ${BRAND.address} · ${BRAND.phone}. Empowering Young Minds Through Code.`,
  });
}

// ── Staff lead notification ───────────────────────────────────────────────────

export function buildLeadNotificationEmail(opts: {
  schoolName: string;
  formTitle: string;
  childName: string;
  childAge?: string;
  childClass?: string;
  programCategory?: string;
  parentName?: string;
  parentWhatsapp?: string;
  parentEmail?: string;
  currentSchool?: string;
  matchedSchoolName?: string;
  dashboardUrl?: string;
}): string {
  const program = opts.programCategory === 'young_innovators'
    ? 'Young Innovators (Ages 5–10)'
    : opts.programCategory === 'teen_developers'
    ? 'Teen Developers (Ages 11–19)'
    : opts.programCategory ?? '—';

  const waLink = opts.parentWhatsapp
    ? `https://wa.me/${opts.parentWhatsapp.replace(/\D/g, '')}`
    : null;

  const rows = [
    ['Child', opts.childName],
    ['Age', opts.childAge || '—'],
    ['Class / Year', opts.childClass || '—'],
    ['Programme', program],
    ['Parent / Guardian', opts.parentName || '—'],
    ['WhatsApp', opts.parentWhatsapp || '—'],
    ['Email', opts.parentEmail || '—'],
    ['Current School', opts.currentSchool
      ? `${opts.currentSchool}${opts.matchedSchoolName ? ` (matched: ${opts.matchedSchoolName})` : ''}`
      : '—'],
  ].map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;font-size:12px;font-weight:700;color:${BRAND.textMuted};
                 white-space:nowrap;border-bottom:1px solid ${BRAND.border};">${escapeHtml(label)}</td>
      <td style="padding:8px 12px;font-size:13px;color:${BRAND.text};
                 border-bottom:1px solid ${BRAND.border};">${escapeHtml(String(value))}</td>
    </tr>`).join('');

  return buildRillcodTransactionalEmailHtml({
    appUrl:      opts.dashboardUrl,
    eyebrow:     opts.schoolName,
    title:       '🔔 New Enquiry Received',
    accentColor: BRAND.primary,
    bodyHtml: `
      <p style="margin:0 0 16px;color:${BRAND.text};font-size:15px;">
        A parent just submitted an enquiry via your public form
        <strong style="color:${BRAND.white};">${escapeHtml(opts.formTitle)}</strong>.
        Here are their details:
      </p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%"
             style="border:1px solid ${BRAND.border};border-radius:10px;overflow:hidden;margin-bottom:20px;">
        ${rows}
      </table>
      ${waLink ? `
      <p style="margin:0 0 6px;color:${BRAND.textMuted};font-size:12px;font-weight:700;">QUICK CONTACT</p>
      <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
          <td style="padding-right:10px;">
            <a href="${waLink}" style="display:inline-block;background:#25d366;color:#fff;
               font-size:13px;font-weight:800;padding:10px 20px;border-radius:8px;
               text-decoration:none;">💬 WhatsApp Now</a>
          </td>
          ${opts.parentEmail ? `<td>
            <a href="mailto:${escapeHtml(opts.parentEmail)}" style="display:inline-block;
               background:${BRAND.card};color:${BRAND.text};border:1px solid ${BRAND.border};
               font-size:13px;font-weight:800;padding:10px 20px;border-radius:8px;
               text-decoration:none;">✉️ Send Email</a>
          </td>` : ''}
        </tr>
      </table>` : ''}`,
    cta: opts.dashboardUrl
      ? { href: `${opts.dashboardUrl}/dashboard/consent-forms`, label: 'View in Dashboard →', color: BRAND.primary }
      : undefined,
    footerNote: `${BRAND.name} · ${BRAND.address}. You are receiving this because you manage a consent form on the platform.`,
  });
}

// ── Parent enrolled confirmation (consent lead — non-credential) ─────────────

export function buildLeadEnrolledParentEmail(opts: {
  parentName: string;
  childName: string;
  programLabel: string;
  phone?: string;
}): string {
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:15px;color:${BRAND.text};">
      Dear <strong style="color:${BRAND.white};">${escapeHtml(opts.parentName)}</strong>,
    </p>
    <p style="margin:0 0 16px;font-size:15px;color:${BRAND.text};line-height:1.65;">
      We are thrilled to officially welcome <strong style="color:${BRAND.white};">${escapeHtml(opts.childName)}</strong>
      to the Rillcod Technologies family! Your child is now enrolled in the
      <strong style="color:${BRAND.primary};">${escapeHtml(opts.programLabel)}</strong> programme.
    </p>
    <div style="background:${BRAND.cardAlt};border-left:4px solid ${BRAND.success};padding:16px 20px;margin:0 0 20px;border-radius:0 6px 6px 0;">
      <p style="margin:0 0 8px;font-size:10px;color:${BRAND.success};text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">What happens next</p>
      <ul style="margin:0;padding-left:18px;color:${BRAND.text};font-size:14px;line-height:1.9;">
        <li>Our team will send you the class schedule and onboarding details via WhatsApp shortly</li>
        <li>Payment details (if applicable) will be shared in your onboarding message</li>
        <li>You'll receive a portal login to track ${escapeHtml(opts.childName)}'s progress</li>
      </ul>
    </div>
    <p style="margin:0 0 16px;font-size:15px;color:${BRAND.text};line-height:1.65;">
      For any questions, please reach us at <strong style="color:${BRAND.white};">${escapeHtml(opts.phone || brandContact.phone)}</strong>
      or reply to this email.
    </p>
    <p style="margin:0;font-size:14px;color:${BRAND.textMuted};">
      Warm regards,<br/>
      <strong style="color:${BRAND.text};">The Rillcod Technologies Team</strong>
    </p>
  `;

  return buildRillcodTransactionalEmailHtml({
    title: `Welcome to Rillcod, ${opts.childName}! 🎉`,
    bodyHtml,
    cta: { href: 'https://rillcod.com', label: 'Visit Our Portal', color: BRAND.success },
    footerNote: `${BRAND.name} · ${brandContact.address} · ${brandContact.phone}`,
  });
}

/**
 * A partnership proposal, sent to a prospective school.
 *
 * This is the only builder here that is marketing rather than transactional, and
 * it is written accordingly: the email has to earn the attachment being opened.
 * So it leads with what the school gets rather than what we are sending, carries
 * the one number worked from their own roll, and asks for a demonstration rather
 * than a signature — nobody signs from an inbox.
 *
 * Everything quoted comes from the issued document. The email never recomputes a
 * fee, because two numbers for one deal is the failure the whole partnership
 * record exists to prevent.
 */
export function buildPartnershipProposalEmail(opts: {
  schoolName: string;
  contactName?: string | null;
  reference: string;
  /** Headline figure for the school, already formatted, e.g. "₦1,050,000". */
  schoolShareLabel?: string | null;
  sharePercent?: number | null;
  /** How many years the quote covers, e.g. "Basic 1 to SS 3". */
  coverage?: string | null;
  partnerSchools?: string | null;
  validUntil?: string | null;
  appUrl?: string;
  /**
   * Which document is attached.
   *
   * The copy was written for a proposal and sent for both, so a school that had
   * already agreed terms received its contract under the headline "Coding,
   * Robotics & AI in your school" and an invitation to book the
   * demonstration it had already had. Defaults to 'proposal', which is what
   * every caller before this meant.
   */
  kind?: 'proposal' | 'mou';
  /**
   * The public link to read — and for an MoU, to sign — the document online.
   *
   * Attachments get lost, forwarded and opened on phones that will not render
   * them. The link is the reliable copy, and it is the only way to sign.
   */
  shareUrl?: string | null;
}): string {
  const isMou = opts.kind === 'mou';
  const greeting = opts.contactName
    ? `Dear ${escapeHtml(opts.contactName)},`
    : `Dear ${escapeHtml(opts.schoolName)},`;

  const rows: TransactionalSummaryRow[] = [
    { label: isMou ? 'Agreement reference' : 'Proposal reference', value: opts.reference },
    ...(opts.coverage ? [{ label: 'Covers', value: opts.coverage }] : []),
    ...(opts.schoolShareLabel
      ? [
          {
            label: `Your ${opts.sharePercent ?? 30}% share, per term`,
            value: opts.schoolShareLabel,
            highlight: true,
          },
        ]
      : []),
    ...(opts.validUntil ? [{ label: 'Fees held until', value: opts.validUntil }] : []),
  ];

  const bodyHtml = isMou
    ? `
    <p style="margin:0 0 14px;">${greeting}</p>
    <p style="margin:0 0 14px;">
      Attached is the Memorandum of Understanding between
      ${escapeHtml(brandContact.registeredName)} and ${escapeHtml(opts.schoolName)}, setting out the
      agreed fee, what each side provides, and the years it covers. Nothing in it differs from what
      we discussed.
    </p>
    <p style="margin:0 0 6px;">
      ${
        opts.shareUrl
          ? 'You can read it and sign it online — no account, no printing. Signing records your name and the date against this reference.'
          : 'Please review it and return a signed copy at your convenience.'
      }
    </p>`
    : `
    <p style="margin:0 0 14px;">${greeting}</p>
    <p style="margin:0 0 14px;">
      Parents are choosing schools on whether their children will be ready for work that does not
      exist yet. We run the coding, robotics and AI programme that answers that — taught on your
      site, on your timetable, by our facilitators, with your teachers taking it on over time.
    </p>
    <p style="margin:0 0 14px;">
      The attached proposal is written for ${escapeHtml(opts.schoolName)} specifically. It sets out the
      full year-by-year curriculum, what each side provides, how a rollout runs in its first two
      weeks, and what the programme is worth to you at your own enrolment${
        opts.partnerSchools
          ? ` — the same programme already running in ${escapeHtml(opts.partnerSchools)} schools`
          : ''
      }.
    </p>
    <p style="margin:0 0 6px;">
      We are not asking you to commit to anything from an email. The next step is a live
      demonstration for your students and a short session with your leadership and PTA — after
      which you will know whether this belongs in your school.
    </p>`;

  return buildRillcodTransactionalEmailHtml({
    appUrl: opts.appUrl,
    eyebrow: opts.schoolName,
    title: isMou
      ? 'Memorandum of Understanding'
      // Names the years actually quoted when we know them. A fixed "Basic 1 to
      // SS 3" is wrong the moment a proposal is scoped to one section.
      : opts.coverage
        ? `Coding, Robotics & AI — ${escapeHtml(opts.coverage)}`
        : 'Coding, Robotics & AI in your school',
    bodyHtml,
    summaryRows: rows,
    // The link is the primary action whenever there is one: it opens on a phone,
    // survives forwarding, and for an MoU it is the only way to sign.
    cta: opts.shareUrl
      ? {
          href: opts.shareUrl,
          label: isMou ? 'Read and sign online' : 'Open the proposal',
        }
      : {
          href: `mailto:${brandContact.email}?subject=${encodeURIComponent(`Demonstration request — ${opts.schoolName}`)}`,
          label: 'Book a demonstration',
        },
    extraBlock: `
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-collapse:collapse;">
        <tr><td style="background:${BRAND.cardAlt};border:1px solid ${BRAND.border};padding:14px 16px;">
          <p style="margin:0 0 4px;font-size:11px;color:${BRAND.textMuted};text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">${
            opts.shareUrl ? 'Your copy' : 'The attachment'
          }</p>
          <p style="margin:0;font-size:13px;color:${BRAND.white};line-height:1.6;">
            ${
              opts.shareUrl
                ? `Reference <b>${escapeHtml(opts.reference)}</b>. The link above always shows the current version and offers a PDF download. The attached copy is yours to keep.`
                : `Open <b>${escapeHtml(opts.reference)}</b> in any browser. To keep a PDF copy, use your browser's Print option and choose “Save as PDF”.`
            }
          </p>
        </td></tr>
      </table>`,
    footerNote: `${brandContact.legalName} · ${brandContact.address} · ${brandContact.phone}`,
  });
}
