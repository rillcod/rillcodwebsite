import { buildRillcodTransactionalEmailHtml } from '@/lib/email/rillcod-transactional-email';
import { programSpotlightHtml, programSpotlightLinks } from '@/lib/communication/program-spotlight';

export type MonthlyStudentSummary = {
  name: string;
  lessons: number;
  assignments: number;
  attendanceRate: number | null;
  xp: number;
};

export function buildMonthlyParentUpdateEmail(input: {
  parentFirstName: string;
  monthLabel: string;
  students: MonthlyStudentSummary[];
}): { subject: string; html: string } {
  const links = programSpotlightLinks();
  const hasActivity = input.students.some((s) => s.lessons > 0 || s.assignments > 0 || s.xp > 0);

  const progressBlock = input.students.map((s) => `
    <p style="margin:0 0 12px;font-size:14px;color:#d4d4d8;line-height:1.65;">
      <strong style="color:#fff;">${s.name}</strong><br/>
      Lessons this month: ${s.lessons} · Homework handed in: ${s.assignments}<br/>
      Attendance: ${s.attendanceRate != null ? `${s.attendanceRate}%` : '—'} · Points earned: ${s.xp}
    </p>`).join('');

  const bodyHtml = hasActivity
    ? `<p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">Hi ${input.parentFirstName}, here is a gentle monthly check-in on how your child(ren) are doing at Rillcod.</p>${progressBlock}`
    : `<p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">Hi ${input.parentFirstName}, we did not see much activity on the portal this month — that's okay. Log in anytime to see reports, or reply if you need help getting started.</p>`;

  const html = buildRillcodTransactionalEmailHtml({
    title: `Your Rillcod update — ${input.monthLabel}`,
    bodyHtml: `${bodyHtml}${programSpotlightHtml()}`,
    cta: { href: links.summerSchool, label: 'See Summer School & programmes →', color: '#f59e0b' },
    footerNote: 'You receive this once a month because you opted in. Turn off anytime in notification settings.',
  });

  const primaryChild = input.students[0]?.name ?? 'your child';
  return {
    subject: `How ${primaryChild} is doing at Rillcod — ${input.monthLabel}`,
    html,
  };
}
