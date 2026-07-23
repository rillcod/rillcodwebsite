import { brandContact } from '@/config/brand';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');

/** Plain-language highlights of what Rillcod runs right now — warm, not technical. */
export function programSpotlightPlain(): string {
  return [
    '☀️ Summer School — coding, robotics & fun projects during the holidays',
    '🌱 Young Innovators (ages 5–10) — playful coding for primary pupils',
    '🚀 Teen Developers (ages 11–19) — real apps, Python & web skills',
    '🏫 Partner school programmes — in-school coding clubs',
  ].join('\n');
}

/** HTML block for emails — what's on at Rillcod this season. */
export function programSpotlightHtml(): string {
  return `
    <div style="background:#1c1e22;border-left:4px solid #f59e0b;padding:16px 20px;margin:20px 0;border-radius:0 8px 8px 0;">
      <p style="margin:0 0 10px;font-size:10px;color:#f59e0b;text-transform:uppercase;letter-spacing:1.2px;font-weight:800;">What's happening at Rillcod</p>
      <ul style="margin:0;padding-left:18px;color:#d4d4d8;font-size:14px;line-height:1.85;">
        <li><strong style="color:#fff;">Summer School</strong> — holiday coding & robotics (places filling up)</li>
        <li><strong style="color:#fff;">Young Innovators</strong> — ages 5–10, creative coding for primary children</li>
        <li><strong style="color:#fff;">Teen Developers</strong> — ages 11–19, apps, Python & real projects</li>
        <li><strong style="color:#fff;">School programmes</strong> — coding clubs in partner schools</li>
      </ul>
      <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;">
        Questions? Reply to this email or call <strong style="color:#fff;">${brandContact.phone}</strong> — a real person will help.
      </p>
    </div>`;
}

export function programSpotlightLinks() {
  return {
    summerSchool: `${APP_URL}/summer-school`,
    registration: `${APP_URL}/student-registration`,
    home: APP_URL,
  };
}

/** Short WhatsApp-friendly program reminder. */
export function programSpotlightWhatsApp(childName: string): string {
  return `We also have Summer School and term-time classes running — great for ${childName} to keep learning. Ask us anytime: ${brandContact.phone}`;
}
