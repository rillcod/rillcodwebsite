import { describe, expect, it } from 'vitest';
import {
  buildTermRegistrationGatewayMeta,
  resolveTermRegistrationCharge,
  resolveTermBalancePaymentCharge,
  normalizeTermPaymentPlan,
  validateTermRegistrationIntake,
} from '@/lib/registration/term-registration-intake';

describe('term-registration-intake', () => {
  it('resolves paystack full charge', () => {
    const r = resolveTermRegistrationCharge({
      paymentMethod: 'paystack',
      paymentPlan: 'full',
      totalTuition: 50000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.charge.chargeAmount).toBe(50000);
      expect(r.charge.balanceDue).toBe(0);
    }
  });

  it('resolves bank transfer instalment deposit', () => {
    const r = resolveTermRegistrationCharge({
      paymentMethod: 'bank_transfer',
      paymentPlan: 'instalment',
      totalTuition: 50000,
      transferAmount: 25000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.charge.chargeAmount).toBe(25000);
      expect(r.charge.balanceDue).toBe(25000);
    }
  });

  it('resolves term balance bank transfer', () => {
    const r = resolveTermBalancePaymentCharge({
      paymentMethod: 'bank_transfer',
      outstandingBalance: 20000,
      totalTuition: 50000,
      amountPaidSoFar: 30000,
      transferAmount: 15000,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.charge.chargeAmount).toBe(15000);
      expect(r.charge.balanceDue).toBe(5000);
    }
  });

  it('normalizes payment plan aliases', () => {
    expect(normalizeTermPaymentPlan('installment')).toBe('instalment');
    expect(normalizeTermPaymentPlan('full')).toBe('full');
  });
  const validIntake = {
    enrollmentType: 'school',
    fullName: 'Ada Student',
    dateOfBirth: '2014-04-12',
    gender: 'female',
    gradeLevel: 'Basic 5',
    parentName: 'Grace Parent',
    parentPhone: '08012345678',
    courseInterest: 'Young Innovators',
    preferredSchedule: 'Termly Programme',
    termsAgreement: true,
  };

  it('accepts complete school and online registration gates', () => {
    expect(validateTermRegistrationIntake(validIntake)).toBeNull();
    expect(validateTermRegistrationIntake({
      ...validIntake,
      enrollmentType: 'online',
      preferredSchedule: 'Online Live Classes',
    })).toBeNull();
  });

  it('rejects missing consent and cross-path schedules', () => {
    expect(validateTermRegistrationIntake({ ...validIntake, termsAgreement: false }))
      .toContain('accept the registration terms');
    expect(validateTermRegistrationIntake({
      ...validIntake,
      enrollmentType: 'online',
      preferredSchedule: 'Termly Programme',
    })).toContain('available for this enrollment pathway');
  });

  it('rejects invalid phone numbers and future birth dates', () => {
    expect(validateTermRegistrationIntake({ ...validIntake, parentPhone: '123' }))
      .toContain('valid parent or guardian phone');
    expect(validateTermRegistrationIntake({ ...validIntake, dateOfBirth: '2999-01-01' }))
      .toContain('valid date of birth');
  });

  it('records versioned consent evidence in payment metadata', () => {
    const metadata = buildTermRegistrationGatewayMeta({
      studentId: 'student-1',
      studentName: 'Ada Student',
      parentEmail: 'parent@example.com',
      enrollmentType: 'school',
      charge: {
        chargeAmount: 30000,
        balanceDue: 0,
        effectivePaymentPlan: 'full',
        totalTuition: 30000,
      },
      termsAcceptedAt: '2026-07-29T10:00:00.000Z',
    });
    expect(metadata).toMatchObject({
      terms_accepted_at: '2026-07-29T10:00:00.000Z',
      terms_version: 'registration-2026-07',
    });
  });
});
