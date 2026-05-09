/**
 * Rillcod branded transactional email template.
 * Table-based layout — renders correctly in Gmail, Outlook, Apple Mail, and mobile.
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
            ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
          <tr>
            <td style="background:#1a1a1d;border:1px solid #33363a;padding:16px 18px;">
              <p style="margin:0 0 10px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">Details</p>
              ${args.summaryRows.map(r =>
                  `<p style="margin:0 0 8px;font-size:14px;color:#ffffff;"><strong style="color:#f59e0b;">${escapeHtml(r.label)}:</strong>&nbsp;${escapeHtml(r.value)}</p>`
              ).join('')}
            </td>
          </tr>
        </table>`
            : '';

    const ctaBlock = args.cta
        ? `
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
          <tr>
            <td style="background:#f59e0b;padding:0;">
              <a href="${escapeHtml(args.cta.href)}"
                 style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;
                        padding:12px 28px;font-size:12px;font-weight:800;letter-spacing:0.8px;
                        text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;">
                ${escapeHtml(args.cta.label)} &rarr;
              </a>
            </td>
          </tr>
        </table>`
        : '';

    const footerNote = args.footerNote
        ? `<p style="margin:0 0 10px;font-size:12px;color:#a1a1aa;">${args.footerNote}</p>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(args.title)}</title>
</head>
<body style="margin:0;padding:0;background:#0b0b0c;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!--[if mso]><table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0b0c"><tr><td><![endif]-->
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:#0b0b0c;min-height:100%;font-family:Arial,Helvetica,sans-serif;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;background:#141416;border:1px solid #2b2b2f;">

          <!-- Header: logo + title -->
          <tr>
            <td style="background:#141416;border-bottom:2px solid #f59e0b;padding:24px 28px;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="52" valign="middle" style="padding-right:14px;">
                    <img src="${escapeHtml(logoUrl)}" alt="Rillcod"
                         width="44" height="44"
                         style="display:block;width:44px;height:44px;object-fit:contain;
                                background:#ffffff;padding:4px;border-radius:4px;" />
                  </td>
                  <td valign="middle">
                    <p style="margin:0 0 3px;font-size:10px;color:#f59e0b;font-weight:800;
                               letter-spacing:1.8px;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
                    <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;line-height:1.25;">
                      ${escapeHtml(args.title)}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 28px 8px;">
              <div style="font-size:14px;color:#d4d4d8;line-height:1.65;">
                ${args.bodyHtml}
              </div>
            </td>
          </tr>

          <!-- Summary rows -->
          ${summaryBlock ? `<tr><td style="padding:0 28px;">${summaryBlock}</td></tr>` : ''}

          <!-- CTA -->
          ${ctaBlock ? `<tr><td style="padding:4px 28px 0;">${ctaBlock}</td></tr>` : ''}

          <!-- Divider -->
          <tr>
            <td style="padding:0 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #2f2f35;padding-top:20px;"></td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 28px 28px;">
              ${footerNote}
              <p style="margin:0 0 6px;font-size:12px;color:#71717a;">
                Need help?&nbsp;
                <a href="mailto:support@rillcod.com"
                   style="color:#f59e0b;text-decoration:none;font-weight:700;">
                  support@rillcod.com
                </a>
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
                <tr>
                  <td width="24" valign="middle" style="padding-right:8px;">
                    <img src="${escapeHtml(logoUrl)}" alt="" width="20" height="20"
                         style="display:block;width:20px;height:20px;object-fit:contain;opacity:0.5;" />
                  </td>
                  <td valign="middle">
                    <p style="margin:0;font-size:11px;color:#52525b;line-height:1.4;">
                      &copy; ${new Date().getFullYear()} Rillcod Academy &middot; Nigerian STEM &amp; Coding Platform<br/>
                      This is an automated message. Please retain it for your records.
                    </p>
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
