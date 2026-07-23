'use client';

import { useCallback, useEffect, useRef } from 'react';

export type ContactCapturePayload = {
  fullName?: string;
  parentName?: string;
  email?: string;
  phone?: string;
  studentName?: string;
  childName?: string;
  school?: string;
  schoolName?: string;
  currentClass?: string;
  className?: string;
  grade?: string;
  enrollmentType?: string;
  courseInterest?: string;
  preferredSchedule?: string;
  hearAboutUs?: string;
  age?: string;
  gender?: string;
  studentPhone?: string;
  paymentMethod?: string;
  paymentPlan?: string;
  formSnapshot?: Record<string, unknown>;
};

type Options = {
  formType: 'portal_registration' | 'special_program' | 'consent_form' | 'general';
  programSlug?: string;
  programTitle?: string;
  formId?: string;
  formTitle?: string;
  getPayload: () => ContactCapturePayload;
  debounceMs?: number;
  enabled?: boolean;
};

const CAPTURE_FIELDS = new Set([
  'fullName', 'parentName', 'email', 'phone', 'studentName', 'childName',
  'parent_name', 'parent_email', 'parent_whatsapp', 'child_name',
  'school', 'schoolName', 'currentClass', 'className', 'grade',
]);

/**
 * Debounced progressive capture — fires when name + (email or phone) are present.
 * Silent fail: never blocks the form.
 */
export function useContactCapture({
  formType,
  programSlug,
  programTitle,
  formId,
  formTitle,
  getPayload,
  debounceMs = 900,
  enabled = true,
}: Options) {
  const lastSentRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sendCapture = useCallback(
    async (captureStage: 'partial' | 'submitted' | 'payment_started') => {
      if (!enabled) return;
      const p = getPayload();
      const fullName = (p.fullName || p.parentName || '').trim();
    const email = (p.email || '').trim().toLowerCase();
    const phone = (p.phone || '').trim();
    if (!fullName || (!email && !phone)) return;

    const fingerprint = `${captureStage}|${fullName}|${email}|${phone}|${p.studentName || p.childName || ''}`;
    if (fingerprint === lastSentRef.current) return;
    lastSentRef.current = fingerprint;

    const payload = {
      ...p,
      fullName,
      email,
      phone,
      formType,
      captureStage,
      programSlug,
      programTitle,
      formId,
      formTitle,
      childName: p.childName || p.studentName,
      schoolName: p.schoolName || p.school,
      className: p.className || p.currentClass || p.grade,
    };

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch('/api/customer-book/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok || res.status === 429) return;
      } catch {
        if (attempt === 1) return;
        await new Promise((r) => setTimeout(r, 450));
      }
    }
    },
    [enabled, formType, formId, formTitle, getPayload, programSlug, programTitle],
  );

  const scheduleCapture = useCallback(
    (fieldName?: string) => {
      if (!enabled) return;
      if (fieldName && !CAPTURE_FIELDS.has(fieldName)) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void sendCapture('partial');
      }, debounceMs);
    },
    [debounceMs, enabled, sendCapture],
  );

  const captureOnBlur = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void sendCapture('partial');
  }, [sendCapture]);

  const captureSubmitted = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void sendCapture('submitted');
  }, [sendCapture]);

  const capturePaymentStarted = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    void sendCapture('payment_started');
  }, [sendCapture]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { scheduleCapture, captureOnBlur, captureSubmitted, capturePaymentStarted };
}
