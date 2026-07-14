/** WhatsApp mini-intake: shared keys + helpers for the floating conversion widget. */

import { formatWhatsApp } from '@/lib/form-helpers';

export const WA_DISMISS_KEY = 'rillcod-wa-dismissed';
export const WA_INTAKE_DRAFT_KEY = 'rillcod-wa-intake-draft';
export const WA_STUDENT_PREFILL_KEY = 'rillcod-wa-student-prefill';

export type WaIntent = 'summer' | 'enrol' | 'school' | 'help';

export type WaIntakeDraft = {
  intent: WaIntent;
  parentName: string;
  phone: string;
  studentName: string;
  age: string;
  track: string;
};

export const EMPTY_WA_DRAFT: WaIntakeDraft = {
  intent: 'summer',
  parentName: '',
  phone: '',
  studentName: '',
  age: '',
  track: 'all',
};

export const SUMMER_TRACK_OPTIONS = [
  { value: 'all', label: 'Not sure / All tracks' },
  { value: 'coding', label: 'Coding & Programming' },
  { value: 'ai', label: 'AI & Machine Learning' },
  { value: 'robotics', label: 'Robotics' },
  { value: 'design', label: 'Design / Creative' },
] as const;

export function loadWaIntakeDraft(): WaIntakeDraft | null {
  try {
    const raw = sessionStorage.getItem(WA_INTAKE_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_WA_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

export function saveWaIntakeDraft(draft: WaIntakeDraft) {
  try {
    sessionStorage.setItem(WA_INTAKE_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function clearWaIntakeDraft() {
  try {
    sessionStorage.removeItem(WA_INTAKE_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function buildWaBrief(
  draft: WaIntakeDraft,
  opts: { programmeTitle?: string | null; pagePath?: string },
): string {
  const phone = formatWhatsApp(draft.phone);
  const lines = [
    'Hello Rillcod Team! 👋',
    '',
    `Intent: ${intentLabel(draft.intent)}`,
  ];
  if (draft.parentName.trim()) lines.push(`Parent / contact: ${draft.parentName.trim()}`);
  if (phone) lines.push(`WhatsApp: ${phone}`);
  if (draft.studentName.trim()) lines.push(`Learner: ${draft.studentName.trim()}`);
  if (draft.age.trim()) lines.push(`Age: ${draft.age.trim()}`);
  if (draft.intent === 'summer') {
    const track =
      SUMMER_TRACK_OPTIONS.find((t) => t.value === draft.track)?.label || draft.track;
    lines.push(`Programme: ${opts.programmeTitle || 'AI Summer School'}`);
    if (track) lines.push(`Track interest: ${track}`);
  }
  if (opts.pagePath) lines.push(`From page: ${opts.pagePath}`);
  lines.push('', 'Please help me with the next steps. Thank you!');
  return lines.join('\n');
}

function intentLabel(intent: WaIntent): string {
  switch (intent) {
    case 'summer':
      return 'Secure a Summer / Special programme seat';
    case 'enrol':
      return 'Term enrolment (school / online / centre)';
    case 'school':
      return 'School partnership';
    case 'help':
      return 'General enquiry';
  }
}

/** Merge intake into the special-programme localStorage draft so #register restores it. */
export function applyIntakeToSpecialDraft(slug: string | null | undefined, draft: WaIntakeDraft) {
  const phone = formatWhatsApp(draft.phone);
  const patch = {
    parentName: draft.parentName.trim(),
    phone,
    studentName: draft.studentName.trim(),
    age: draft.age.trim(),
    trackInterest: draft.track || 'all',
  };

  const mergeInto = (storageKey: string) => {
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(localStorage.getItem(storageKey) || '{}') || {};
    } catch {
      existing = {};
    }
    const merged = {
      ...existing,
      parentName: patch.parentName || existing.parentName || '',
      phone: patch.phone || existing.phone || '',
      studentName: patch.studentName || existing.studentName || '',
      age: patch.age || existing.age || '',
      trackInterest: patch.trackInterest || existing.trackInterest || 'all',
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(merged));
    } catch {
      /* ignore */
    }
  };

  if (slug) mergeInto(`rillcod_special_${slug}_draft`);
  // Homepage popup draft fallback
  mergeInto('rillcod_summer_school_popup_draft');
}

/** Prefill for /student-registration (consumed once on mount). */
export function stashStudentPrefill(draft: WaIntakeDraft) {
  try {
    sessionStorage.setItem(
      WA_STUDENT_PREFILL_KEY,
      JSON.stringify({
        parentName: draft.parentName.trim(),
        parentPhone: formatWhatsApp(draft.phone),
        fullName: draft.studentName.trim(),
        age: draft.age.trim(),
      }),
    );
  } catch {
    /* ignore */
  }
}

export function consumeStudentPrefill(): {
  parentName?: string;
  parentPhone?: string;
  fullName?: string;
  age?: string;
} | null {
  try {
    const raw = sessionStorage.getItem(WA_STUDENT_PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(WA_STUDENT_PREFILL_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function openWhatsAppChat(message: string, phoneE164: string) {
  const cleanPhone = phoneE164.replace(/\D/g, '');
  window.open(
    `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`,
    '_blank',
    'noopener,noreferrer',
  );
}
