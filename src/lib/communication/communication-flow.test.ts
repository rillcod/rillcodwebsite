import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildConsentSubmitWhatsAppAck,
  buildFormFollowupWhatsAppWeek1,
  buildFormFollowupWhatsAppWeek3,
  buildLeadEnrolledWhatsApp,
} from '@/lib/communication/parent-whatsapp-templates';
import { buildMonthlyParentUpdateEmail } from '@/lib/communication/monthly-parent-email';
import {
  monthlyPeriodKey,
  monthlySendGuardKey,
  MONTHLY_SEND_TTL_SEC,
} from '@/lib/communication/monthly-send-guard';
import { programSpotlightHtml, programSpotlightPlain } from '@/lib/communication/program-spotlight';
import { NURTURE_STEPS } from '@/lib/crm/lead-nurture';

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsApp: vi.fn(),
}));

import { sendWhatsApp } from '@/lib/whatsapp/send';
import { deliverConsentParentWhatsAppAck, type ConsentLeadResponseData } from '@/lib/consent/lead-notifications';

describe('communication templates', () => {
  it('program spotlight mentions Summer School and age bands', () => {
    expect(programSpotlightPlain()).toContain('Summer School');
    expect(programSpotlightPlain()).toContain('Young Innovators');
    expect(programSpotlightHtml()).toContain('Teen Developers');
  });

  it('builds monthly parent email with progress and programmes', () => {
    const { subject, html } = buildMonthlyParentUpdateEmail({
      parentFirstName: 'Ada',
      monthLabel: 'July 2026',
      students: [{ name: 'Chidi', lessons: 3, assignments: 2, attendanceRate: 90, xp: 40 }],
    });
    expect(subject).toContain('Chidi');
    expect(subject).toContain('July 2026');
    expect(html).toContain('Lessons this month: 3');
    expect(html).toContain('Summer School');
  });

  it('WhatsApp templates are warm and programme-focused', () => {
    const ack = buildConsentSubmitWhatsAppAck({
      parentName: 'Ada',
      childName: 'Chidi',
      programCategory: 'young_innovators',
    });
    expect(ack).toContain('Chidi');
    expect(ack).toContain('Young Innovators');
    expect(ack).toContain('STOP');

    const w1 = buildFormFollowupWhatsAppWeek1({
      parentName: 'Ada',
      childName: 'Chidi',
      programLabel: 'Young Innovators',
    });
    expect(w1).toContain('Summer School');

    const w3 = buildFormFollowupWhatsAppWeek3({
      parentName: 'Ada',
      childName: 'Chidi',
      programLabel: 'Teen Developers',
    });
    expect(w3).toContain('Summer School');

    const enrolled = buildLeadEnrolledWhatsApp({
      parentName: 'Ada',
      childName: 'Chidi',
      programCategory: 'teen_developers',
    });
    expect(enrolled).toContain('enrolled');
    expect(enrolled).toContain('Teen Developers');
  });

  it('lead nurture is paced monthly-style (days 7, 21, 28)', () => {
    expect(NURTURE_STEPS.map((s) => s.dayThreshold)).toEqual([7, 21, 28]);
    const body = NURTURE_STEPS[1].body({
      parentName: 'Ada Okoro',
      childName: 'Chidi',
      programme: 'young_innovators',
      schoolName: 'Rillcod',
      appUrl: 'https://www.rillcod.com',
      formTitle: 'Registration',
    });
    expect(body).toContain('Summer School');
  });

  it('monthly send guard uses 28-day TTL and stable keys', () => {
    expect(MONTHLY_SEND_TTL_SEC).toBe(28 * 24 * 60 * 60);
    const period = monthlyPeriodKey(new Date('2026-07-15'));
    expect(period).toBe('2026-07');
    expect(monthlySendGuardKey('monthly_summary', 'Parent@Example.com', period))
      .toBe('monthly_send:monthly_summary:parent@example.com:2026-07');
  });
});

describe('WhatsApp consent gating', () => {
  beforeEach(() => {
    vi.mocked(sendWhatsApp).mockClear();
  });

  it('skips submit ack when whatsapp_consent is false', async () => {
    await deliverConsentParentWhatsAppAck({
      responseData: {
        parent_name: 'Ada',
        parent_whatsapp: '+2348012345678',
        child_name: 'Chidi',
        whatsapp_consent: false,
      } as ConsentLeadResponseData,
    });
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it('sends submit ack when whatsapp_consent is true', async () => {
    await deliverConsentParentWhatsAppAck({
      responseData: {
        parent_name: 'Ada',
        parent_whatsapp: '+2348012345678',
        child_name: 'Chidi',
        program_category: 'young_innovators',
        whatsapp_consent: true,
      } as ConsentLeadResponseData,
    });
    expect(sendWhatsApp).toHaveBeenCalledOnce();
    const msg = vi.mocked(sendWhatsApp).mock.calls[0][1] as string;
    expect(msg).toContain('Chidi');
    expect(msg).toContain('Young Innovators');
  });
});
