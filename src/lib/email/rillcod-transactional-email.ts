/**
 * Shared dark transactional layout (matches billing reminder / cron email style).
 * Use for registration receipts, ops alerts, and admin test sends.
 */
export function escapeHtml(text: string): string {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export type TransactionalSummaryRow = { label: string; value: string };

export type RillcodTransactionalEmailArgs = {
    appUrl?: string;
    /** Small uppercase line under logo (e.g. "Rillcod Academy") */
    eyebrow?: string;
    /** Main headline */
    title: string;
    /** One or more HTML paragraphs (already safe or use escapeHtml on inputs) */
    bodyHtml: string;
    summaryRows?: TransactionalSummaryRow[];
    cta?: { href: string; label: string };
    footerNote?: string;
};

export function buildRillcodTransactionalEmailHtml(args: RillcodTransactionalEmailArgs): string {
    const appUrl = (args.appUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://rillcod.com').replace(/\/$/, '');
    const logoUrl = `${appUrl}/images/logo.png`;
    const eyebrow = args.eyebrow ?? 'Rillcod Academy';
    const summaryBlock =
        args.summaryRows && args.summaryRows.length > 0
            ? `<div style="background:#1a1a1d;border:1px solid #33363a;padding:14px 16px;margin:0 0 14px;">
          <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Details</p>
          ${args.summaryRows
              .map(
                  (r) =>
                      `<p style="margin:0 0 6px;font-size:15px;color:#fff;"><strong>${escapeHtml(r.label)}:</strong> ${escapeHtml(r.value)}</p>`,
              )
              .join('')}
        </div>`
            : '';
    const ctaBlock = args.cta
        ? `<div style="margin:0 0 16px;">
          <a href="${escapeHtml(args.cta.href)}" style="background:#f59e0b;color:#111827;text-decoration:none;padding:10px 14px;font-size:12px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;display:inline-block;">
            ${escapeHtml(args.cta.label)}
          </a>
        </div>`
        : '';
    const footer = args.footerNote
        ? `<p style="margin:0 0 8px;font-size:12px;color:#a1a1aa;">${args.footerNote}</p>`
        : '';

    return `
  <div style="margin:0;padding:0;background:#0b0b0c;font-family:Arial,Helvetica,sans-serif;color:#f5f5f5;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
      <div style="background:#141416;border:1px solid #2b2b2f;padding:20px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <img src="${escapeHtml(logoUrl)}" alt="Rillcod" style="width:42px;height:42px;object-fit:contain;background:#fff;padding:4px;" />
          <div>
            <p style="margin:0;font-size:11px;letter-spacing:1.4px;color:#f59e0b;font-weight:800;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
            <h2 style="margin:4px 0 0;font-size:18px;line-height:1.3;color:#fff;">${escapeHtml(args.title)}</h2>
          </div>
        </div>
        <div style="font-size:14px;color:#d4d4d8;line-height:1.55;">
          ${args.bodyHtml}
        </div>
        ${summaryBlock}
        ${ctaBlock}
        <div style="border-top:1px solid #2f2f35;padding-top:14px;">
          ${footer}
          <p style="margin:0;font-size:11px;color:#71717a;">
            <strong>Contact:</strong> <a href="mailto:support@rillcod.com" style="color:#f59e0b;">support@rillcod.com</a>
          </p>
          <p style="margin:8px 0 0;font-size:11px;color:#52525b;">
            Automated message from Rillcod Academy. Please retain this email for your records.
          </p>
        </div>
      </div>
    </div>
  </div>`;
}
