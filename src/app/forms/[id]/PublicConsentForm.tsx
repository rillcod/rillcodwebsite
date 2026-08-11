'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { HdQrCode } from '@/components/qr/HdQrCode';
import { HD_QR_DISPLAY_PX } from '@/lib/qr/hd-qr';
import { brandContact } from '@/config/brand';
import { enrollmentTypeLabel } from '@/lib/registration/enrollment-types';
import { useContactCapture } from '@/hooks/useContactCapture';
import { fetchActionJson } from '@/lib/async-timeout';

interface FormData {
  id: string;
  title: string;
  body: string;
  form_type: string;
  due_date: string | null;
  enrollment_type: string;
  schools: { name: string } | null;
}

// ── Fee helpers ──────────────────────────────────────────────────────────────
function parseBodyFee(body: string): number {
  const m = body.match(/₦([\d,]+)/);
  if (!m) return 15_000;
  return Math.max(parseInt(m[1].replace(/,/g, ''), 10) || 15_000, 15_000);
}
function fmtNaira(n: number): string {
  return '₦' + n.toLocaleString('en-NG');
}

// ── WhatsApp helpers ─────────────────────────────────────────────────────────
function formatWhatsApp(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('234') && digits.length >= 4) return '+' + digits;
  if (digits.startsWith('0') && digits.length >= 2)  return '+234' + digits.slice(1);
  return '+234' + digits;
}
function isValidWhatsApp(v: string): boolean {
  const digits = v.replace(/\D/g, '');
  return digits.startsWith('234') && digits.length === 13;
}

// ── Email typo helpers ───────────────────────────────────────────────────────
const EMAIL_TYPOS: Record<string, string> = {
  'gmail.con': 'gmail.com',  'gmail.cm': 'gmail.com',   'gmial.com': 'gmail.com',
  'gmal.com':  'gmail.com',  'gmail.co': 'gmail.com',   'gmaill.com': 'gmail.com',
  'yaoo.com':  'yahoo.com',  'yaho.com': 'yahoo.com',   'yahoo.con': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',  'yaho.co':  'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmal.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'icolud.com':  'icloud.com',  'icoud.com':  'icloud.com',
};
function suggestEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1).toLowerCase();
  const fix = EMAIL_TYPOS[domain];
  if (!fix) return null;
  return email.slice(0, at + 1) + fix;
}

// ── Programme suggestion from age ────────────────────────────────────────────
function programFromAge(age: string): 'young_innovators' | 'teen_developers' | '' {
  const n = parseInt(age, 10);
  if (n >= 4 && n <= 10) return 'young_innovators';
  if (n >= 11 && n <= 19) return 'teen_developers';
  return '';
}

const PROGRAMS = [
  { value: 'young_innovators', label: 'Young Innovators :: PRY', sub: 'Ages 5–10 · Basic programming through fun & games' },
  { value: 'teen_developers',  label: 'Teen Developers :: SEC',  sub: 'Ages 11–19 · Advanced coding & project development' },
] as const;

const DEVICES = [
  { value: 'computer', label: 'Computer / Laptop' },
  { value: 'tablet',   label: 'Tablet' },
  { value: 'phone',    label: 'Smartphone' },
  { value: 'none',     label: 'None yet' },
];

const GOALS = [
  'Fun & creativity',
  'Academic improvement',
  'Career preparation',
  'Parent / guardian recommendation',
  'Other',
];

const REFERRALS = [
  'School (teacher / announcement)',
  'Parent WhatsApp group / PTA',
  'Friend or family',
  'Walk-in / physical visit',
  'Rillcod event or demo',
  'Social media',
  'Other',
];

type ChildEntry = {
  name: string;
  gender: 'male' | 'female' | '';
  age: string;
  class_: string;
  program: 'young_innovators' | 'teen_developers' | '';
  school: string;
};

const emptyChild = (): ChildEntry => ({ name: '', gender: '', age: '', class_: '', program: '', school: '' });

export default function PublicConsentForm({ form, publicUrl, schoolsList = [] }: { form: FormData; publicUrl: string; schoolsList?: string[] }) {
  const isAssessment = form.form_type === 'assessment';
  const LS_KEY       = `rillcod_form_${form.id}`;
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo?.startsWith('/') ? returnTo : null;

  // ── Fee ─────────────────────────────────────────────────────────────────────
  const bodyHasFee  = /₦[\d,]+/.test(form.body);
  const feePerChild = bodyHasFee ? parseBodyFee(form.body) : 0;

  // ── Due-date countdown ───────────────────────────────────────────────────────
  const daysLeft = (() => {
    if (!form.due_date) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const due = new Date(form.due_date); due.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - now.getTime()) / 86_400_000);
  })();

  // ── Core state ───────────────────────────────────────────────────────────────
  const [step,       setStep]       = useState<'form' | 'thanks'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [showQr,     setShowQr]     = useState(false);
  const [attempted,  setAttempted]  = useState(false);   // highlight missing fields
  const [restored,   setRestored]   = useState(false);   // show "session restored" banner

  const [childCount, setChildCount] = useState(1);
  const [children,   setChildren]   = useState<ChildEntry[]>([emptyChild()]);
  const [focusedSchoolIdx, setFocusedSchoolIdx] = useState<number | null>(null);

  const [data, setData] = useState({
    parent_name:      '',
    parent_whatsapp:  '',
    parent_email:     '',
    prior_coding:     '' as 'yes' | 'no' | '',
    prior_platform:   '',
    devices:          [] as string[],
    learning_goal:    '',
    referral_source:  '',
    is_returning:     '' as 'yes' | 'no' | '',
    special_notes:    '',
    consent_acknowledged: false,
    marketing_email_consent: false,
    whatsapp_consent: false,
  });

  // ── Email typo suggestion state ──────────────────────────────────────────────
  const [emailHint, setEmailHint] = useState<string | null>(null);

  const getCapturePayload = useCallback(() => ({
    fullName: data.parent_name,
    parentName: data.parent_name,
    email: data.parent_email,
    phone: data.parent_whatsapp,
    childName: children[0]?.name || '',
    studentName: children[0]?.name || '',
    schoolName: children[0]?.school || '',
    className: children[0]?.class_ || '',
    grade: children[0]?.class_ || '',
    formSnapshot: {
      form_id: form.id,
      form_title: form.title,
      child_count: childCount,
      program: children[0]?.program || '',
    },
  }), [childCount, children, data.parent_email, data.parent_name, data.parent_whatsapp, form.id, form.title]);

  const { scheduleCapture, captureOnBlur, captureSubmitted } = useContactCapture({
    formType: 'consent_form',
    formId: form.id,
    formTitle: form.title,
    getPayload: getCapturePayload,
    enabled: step === 'form',
  });

  // ── localStorage — restore on mount ─────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.children)   { setChildren(saved.children); setChildCount(saved.children.length); }
      if (saved.data)       setData(prev => ({ ...prev, ...saved.data, consent_acknowledged: false }));
      setRestored(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── localStorage — auto-save on change ──────────────────────────────────────
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (step === 'thanks') return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ children, data })); } catch {}
    }, 600);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, data, step]);

  // ── Derived values ───────────────────────────────────────────────────────────
  const totalAmount = bodyHasFee ? feePerChild * childCount : 0;

  // Sibling duplicate names
  const duplicateChildNames = (() => {
    if (childCount < 2) return new Set<string>();
    const seen = new Set<string>(), dupes = new Set<string>();
    for (const c of children) {
      const n = c.name.trim().toLowerCase();
      if (!n) continue;
      if (seen.has(n)) dupes.add(n); else seen.add(n);
    }
    return dupes;
  })();

  // Validation
  const allChildrenValid = children.every(c => c.name.trim() && c.gender && c.age && c.class_.trim() && c.program);
  const canSubmit =
    allChildrenValid &&
    duplicateChildNames.size === 0 &&
    data.parent_name.trim() &&
    isValidWhatsApp(data.parent_whatsapp) &&
    data.parent_email.trim() &&
    data.consent_acknowledged &&
    (daysLeft === null || daysLeft > 0);

  // Count missing required groups for error summary
  const missingCount = (() => {
    let n = 0;
    children.forEach(c => {
      if (!c.name.trim()) n++;
      if (!c.gender)      n++;
      if (!c.age)         n++;
      if (!c.class_.trim()) n++;
      if (!c.program)     n++;
    });
    if (!data.parent_name.trim())     n++;
    if (!data.parent_whatsapp.trim()) n++;
    if (!data.parent_email.trim())    n++;
    if (!data.consent_acknowledged)   n++;
    return n;
  })();

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function updateChildCount(n: number) {
    setChildCount(n);
    setChildren(prev => {
      const next = [...prev];
      while (next.length < n) next.push(emptyChild());
      return next.slice(0, n);
    });
  }

  function updateChild(idx: number, field: keyof ChildEntry, value: string) {
    setChildren(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      const updated = { ...c, [field]: value };
      // Smart: auto-suggest programme from age when not yet chosen
      if (field === 'age' && !c.program) {
        const sug = programFromAge(value);
        if (sug) updated.program = sug;
      }
      return updated;
    }));
    if (field === 'name') scheduleCapture('child_name');
  }

  function set(key: string, value: unknown) {
    setData(d => ({ ...d, [key]: value }));
    scheduleCapture(key);
  }

  function toggleDevice(v: string) {
    setData(d => ({
      ...d,
      devices: d.devices.includes(v) ? d.devices.filter(x => x !== v) : [...d.devices, v],
    }));
  }

  function handleWhatsAppBlur() {
    if (!data.parent_whatsapp) return;
    const formatted = formatWhatsApp(data.parent_whatsapp);
    set('parent_whatsapp', formatted);
    captureOnBlur();
  }

  function handleEmailBlur() {
    const hint = suggestEmail(data.parent_email);
    setEmailHint(hint);
    captureOnBlur();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      setAttempted(true);
      // Scroll to first visible error
      const el = document.querySelector('[data-field-error]');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    setError('');
    captureSubmitted();
    try {
      const { response, data: json } = await fetchActionJson<{ error: string }>(`/api/public/consent-forms/${form.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_current_school: children[0].school || undefined,
          email: data.parent_email || undefined,
          response_data: {
            child_name:           children[0].name,
            child_age:            children[0].age,
            child_gender:         children[0].gender,
            child_class:          children[0].class_,
            program_category:     children[0].program,
            child_current_school: children[0].school || undefined,
            child_count:          children.length,
            children: children.map(c => ({
              name:   c.name,
              gender: c.gender,
              age:    c.age,
              class:  c.class_,
              program: c.program,
              school:  c.school || undefined,
            })),
            parent_name:     data.parent_name,
            parent_whatsapp: data.parent_whatsapp,
            parent_email:    data.parent_email,
            marketing_email_consent: data.marketing_email_consent,
            whatsapp_consent: data.whatsapp_consent,
            is_returning:    data.is_returning || undefined,
            referral_source: data.referral_source || undefined,
            ...(bodyHasFee && { fee_per_child: feePerChild, total_amount: totalAmount, child_count: children.length }),
            ...(isAssessment && {
              prior_coding:    data.prior_coding,
              prior_platform:  data.prior_platform,
              devices:         data.devices,
              learning_goal:   data.learning_goal,
              special_notes:   data.special_notes,
            }),
          },
        }),
      }, 'Submission is taking longer than expected. Your progress is saved, so please try again.');
      if (!response.ok) {
        if (response.status >= 500) console.error('Consent submission failed', { status: response.status, json });
        setError(response.status < 500 && typeof json.error === 'string'
          ? json.error
          : 'We could not submit the form just now. Your progress is saved; please try again.');
        return;
      }
      // Clear saved session
      try { localStorage.removeItem(LS_KEY); } catch {}
      setStep('thanks');
    } catch (submissionError) {
      console.error('Consent submission request failed', submissionError);
      setError(submissionError instanceof Error && submissionError.message.includes('taking longer')
        ? submissionError.message
        : 'We could not reach the service. Your progress is saved; check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Style helpers ────────────────────────────────────────────────────────────
  const inputCls = (hasError = false) =>
    `w-full bg-[#141618] border ${hasError ? 'border-rose-500 ring-1 ring-rose-500/30' : 'border-[#2a2d33]'} text-white px-4 py-3.5 sm:py-3 rounded-xl text-base sm:text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]`;

  const btnCls = (active: boolean, hasError = false) =>
    `py-3 rounded-xl border font-black text-sm transition-all ${active
      ? 'border-amber-500 bg-amber-500/10 text-white'
      : hasError
        ? 'border-rose-500/60 bg-[#141618] text-[#71717a]'
        : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`;

  /* ── Thank-you screen ─────────────────────────────────────────────────────── */
  if (step === 'thanks') {
    return (
      <div className="space-y-6">
        <div className="bg-[#141618] border border-emerald-500/30 rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">
              {isAssessment ? 'Assessment Received!' : 'Registration Confirmed!'}
            </h1>
            <p className="text-[#a1a1aa] mt-1 text-sm">
              Thank you, <strong className="text-white">{data.parent_name}</strong>.{' '}
              {children.length === 1
                ? <>We've received <strong className="text-white">{children[0].name}</strong>'s {isAssessment ? 'assessment' : 'registration'}.</>
                : <>We've received the {isAssessment ? 'assessment' : 'registration'} for <strong className="text-white">{children.length} children</strong>.</>
              }
            </p>
          </div>
          <div className="bg-[#1c1e22] rounded-xl p-4 text-left space-y-2 mt-2">
            {children.map((child, idx) => (
              <div key={idx} className="flex justify-between gap-3 text-sm">
                <span className="text-[#71717a] font-bold w-24 shrink-0">{children.length > 1 ? `Child ${idx + 1}` : 'Child'}</span>
                <span className="text-white text-right">
                  {child.name}{child.gender ? `, ${child.gender.charAt(0).toUpperCase() + child.gender.slice(1)}` : ''}{child.age ? `, Age ${child.age}` : ''}{child.class_ ? ` · ${child.class_}` : ''}
                </span>
              </div>
            ))}
            {children.length === 1 && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-[#71717a] font-bold w-24 shrink-0">Programme</span>
                <span className="text-white text-right">{children[0].program === 'young_innovators' ? 'Young Innovators (PRY)' : 'Teen Developers (SEC)'}</span>
              </div>
            )}
            {bodyHasFee && (
              <div className="flex justify-between gap-3 text-sm pt-2 mt-1 border-t border-[#2a2d33]">
                <span className="text-[#71717a] font-bold w-24 shrink-0">Fee estimate</span>
                <span className="text-amber-400 font-black text-right text-base">{fmtNaira(totalAmount)}</span>
              </div>
            )}
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-[#71717a] font-bold w-24 shrink-0">Contact</span>
              <span className="text-white text-right">{data.parent_whatsapp}</span>
            </div>
            {data.parent_email && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-[#71717a] font-bold w-24 shrink-0">Email</span>
                <span className="text-white text-right">{data.parent_email}</span>
              </div>
            )}
          </div>
          {data.parent_email && (
            <p className="text-xs text-[#71717a]">
              A confirmation email has been sent to <strong className="text-amber-400">{data.parent_email}</strong>
            </p>
          )}
        </div>

        {isAssessment && (
          <div className="bg-[#141618] border border-amber-500/30 rounded-2xl p-6 space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto text-xl">📅</div>
            <div>
              <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Instant Booking Slot Available</p>
              <h3 className="text-base font-black text-white mt-1">Book Your Child's Coding Consultation</h3>
              <p className="text-xs text-[#a1a1aa] mt-1">Select a 15-minute slot below to speak with an instructor on WhatsApp/Google Meet.</p>
            </div>
            
            {/* Cal.com embedded iframe */}
            <div className="border border-[#2a2d33] rounded-xl overflow-hidden bg-black/40 h-[480px]">
              {(() => {
                const baseUrl = process.env.NEXT_PUBLIC_CAL_COM_URL || 'https://cal.com/rillcod/assessment-consultation';
                const embedUrl = baseUrl.includes('?') ? `${baseUrl}&embed=true` : `${baseUrl}?embed=true`;
                return (
                  <iframe
                    src={embedUrl}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="Schedule consultation"
                  />
                );
              })()}
            </div>
          </div>
        )}

        <div className="bg-[#141618] border border-[#2a2d33] rounded-2xl p-6 space-y-4">
          <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">What Happens Next</p>
          <div className="space-y-3">
            {(isAssessment ? [
              "Our team reviews your child's assessment responses",
              "We'll contact you within 24 hours to discuss the best programme fit",
              'A personalised learning plan is prepared for your child',
            ] : [
              'Your registration details have been received',
              "Our team confirms your child's placement within 24 hours",
              ...(bodyHasFee ? ['Your official payment step is sent only after placement is confirmed'] : []),
              "You'll receive class schedule and onboarding details via WhatsApp",
            ]).map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-black font-black text-xs shrink-0 mt-0.5">{i + 1}</div>
                <p className="text-sm text-[#d4d4d8]">{s}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#141618] border border-[#2a2d33] rounded-2xl p-5 text-center space-y-1">
          <p className="text-xs text-[#71717a]">Questions? We're here to help.</p>
          <p className="font-black text-white">{brandContact.phone}</p>
          <p className="text-xs text-[#71717a]">{brandContact.email} · @rillcod</p>
        </div>

        {safeReturnTo && (
          <a
            href={safeReturnTo}
            className="block w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-3 rounded-xl transition-colors text-center"
          >
            Return to Result Check
          </a>
        )}
      </div>
    );
  }

  /* ── Form ─────────────────────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* ── Header ── */}
      <div className="space-y-2">
        <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">{form.title}</h1>
        <p className="inline-flex rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-300">
          {enrollmentTypeLabel(form.enrollment_type)} pathway
        </p>

        {/* Due date countdown */}
        {form.due_date && daysLeft !== null && (
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black ${
            daysLeft <= 0  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' :
            daysLeft <= 3  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
            daysLeft <= 7  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                             'bg-[#141618] text-[#71717a] border border-[#2a2d33]'
          }`}>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {daysLeft <= 0 ? 'Deadline passed' :
             daysLeft === 1 ? 'Last day to register!' :
             daysLeft <= 7 ? `${daysLeft} days left — register now` :
             `Deadline: ${new Date(form.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
          </div>
        )}
      </div>

      {/* ── Restored session banner ── */}
      {restored && (
        <div className="flex items-center justify-between gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3">
          <p className="text-xs text-blue-400 font-bold">Your previous progress has been restored.</p>
          <button type="button" onClick={() => {
            try { localStorage.removeItem(LS_KEY); } catch {}
            setChildren([emptyChild()]); setChildCount(1);
            setData({ parent_name: '', parent_whatsapp: '', parent_email: '', prior_coding: '', prior_platform: '', devices: [], learning_goal: '', referral_source: '', is_returning: '', special_notes: '', consent_acknowledged: false, marketing_email_consent: false, whatsapp_consent: false });
            setRestored(false);
          }} className="text-[10px] font-black text-blue-400 hover:text-white transition-colors shrink-0">Clear & start over</button>
        </div>
      )}

      {/* ── How many children ── */}
      <section className="space-y-3">
        <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">How Many Children Are You Registering?</p>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(n => (
            <button key={n} type="button" onClick={() => updateChildCount(n)}
              className={`py-3 rounded-xl border font-black text-base transition-all ${childCount === n
                ? 'border-amber-500 bg-amber-500/10 text-white'
                : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`}>
              {n}
            </button>
          ))}
        </div>
      </section>

      {/* ── Fee calculator ── */}
      {bodyHasFee && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Programme fee estimate</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#a1a1aa]">{fmtNaira(feePerChild)} × {childCount} {childCount === 1 ? 'child' : 'children'}</span>
            <span className="text-white font-black text-xl">{fmtNaira(totalAmount)}</span>
          </div>
          {childCount > 1 && <p className="text-[10px] text-[#71717a]">Total programme fee for {childCount} children</p>}
          <p className="text-[10px] leading-relaxed text-[#a1a1aa]">No payment is taken on this form. The official payment step is issued after placement is confirmed.</p>
        </div>
      )}

      {/* ── Per-child panels ── */}
      {children.map((child, idx) => {
        const isDuplicate = duplicateChildNames.has(child.name.trim().toLowerCase()) && child.name.trim() !== '';
        const sugProg = child.age ? programFromAge(child.age) : '';
        const nameErr    = attempted && !child.name.trim();
        const genderErr  = attempted && !child.gender;
        const ageErr     = attempted && !child.age;
        const classErr   = attempted && !child.class_.trim();
        const programErr = attempted && !child.program;

        return (
          <section key={idx} className={`space-y-3 border rounded-2xl p-4 transition-colors ${
            (nameErr || genderErr || ageErr || classErr || programErr) ? 'border-rose-500/40' : 'border-[#2a2d33]'
          }`}>
            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
              {childCount > 1 ? `Child ${idx + 1}` : "Child's Information"}
            </p>

            {/* Name */}
            <div data-field-error={nameErr || undefined}>
              <input
                required value={child.name}
                onChange={e => updateChild(idx, 'name', e.target.value)}
                placeholder="Child's full name *"
                className={inputCls(nameErr)}
              />
              {isDuplicate && (
                <p className="text-amber-400 text-xs font-bold mt-1.5 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                  Same name as another child — please double-check
                </p>
              )}
              {nameErr && <p className="text-rose-400 text-xs mt-1">Child's name is required</p>}
            </div>

            {/* Gender */}
            <div data-field-error={genderErr || undefined}>
              <p className={`text-[10px] font-bold mb-2 ${genderErr ? 'text-rose-400' : 'text-[#71717a]'}`}>Gender *</p>
              <div className="grid grid-cols-2 gap-3">
                {(['male', 'female'] as const).map(g => (
                  <button key={g} type="button" onClick={() => updateChild(idx, 'gender', g)}
                    className={btnCls(child.gender === g, genderErr && !child.gender)}>
                    {g === 'male' ? '👦 Male' : '👧 Female'}
                  </button>
                ))}
              </div>
            </div>

            {/* Age + Class */}
            <div className="grid grid-cols-2 gap-3">
              <div data-field-error={ageErr || undefined}>
                <input
                  required value={child.age} type="number" min="4" max="19"
                  onChange={e => updateChild(idx, 'age', e.target.value)}
                  placeholder="Age *"
                  className={inputCls(ageErr)}
                />
                {/* Auto-suggest badge */}
                {sugProg && child.program === sugProg && child.age && (
                  <p className="text-[10px] text-emerald-400 font-bold mt-1 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Programme suggested from age
                  </p>
                )}
              </div>
              <div data-field-error={classErr || undefined}>
                <input
                  required value={child.class_}
                  onChange={e => updateChild(idx, 'class_', e.target.value)}
                  placeholder="Class / Grade *"
                  className={inputCls(classErr)}
                />
              </div>
            </div>

            {/* Programme */}
            <div data-field-error={programErr || undefined}>
              <p className={`text-[10px] font-bold mb-2 ${programErr ? 'text-rose-400' : 'text-[#71717a]'}`}>Programme *</p>
              <div className="space-y-2">
                {PROGRAMS.map(p => (
                  <button key={p.value} type="button" onClick={() => updateChild(idx, 'program', p.value)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${child.program === p.value
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : programErr ? 'border-rose-500/40 bg-[#141618] text-[#71717a]'
                      : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`}>
                    <p className="font-black text-sm">{p.label}</p>
                    <p className="text-xs mt-0.5 opacity-70">{p.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <input
                value={child.school}
                onChange={e => {
                  updateChild(idx, 'school', e.target.value);
                  setFocusedSchoolIdx(idx);
                }}
                onFocus={() => setFocusedSchoolIdx(idx)}
                onBlur={() => {
                  // Slight delay so the onMouseDown click on suggestion triggers first
                  setTimeout(() => setFocusedSchoolIdx(null), 250);
                }}
                placeholder="Child's current school (optional)"
                className={inputCls()}
              />
              {focusedSchoolIdx === idx && schoolsList && schoolsList.length > 0 && (() => {
                const filtered = schoolsList.filter(s =>
                  s.toLowerCase().includes((child.school || '').toLowerCase())
                ).slice(0, 5);
                if (filtered.length === 0) return null;
                return (
                  <div className="absolute left-0 right-0 mt-1 bg-[#141618] border border-[#2a2d33] rounded-xl shadow-2xl z-50 overflow-hidden max-h-48 overflow-y-auto">
                    {filtered.map(schoolName => (
                      <button
                        key={schoolName}
                        type="button"
                        onMouseDown={() => {
                          updateChild(idx, 'school', schoolName);
                          setFocusedSchoolIdx(null);
                        }}
                        className="w-full text-left px-4 py-2 text-xs font-bold text-[#d4d4d8] hover:bg-amber-500 hover:text-black transition-colors"
                      >
                        🏫 {schoolName}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </section>
        );
      })}

      {/* ── Assessment extras ── */}
      {isAssessment && (
        <>
          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Prior Coding Experience</p>
            <div className="grid grid-cols-2 gap-3">
              {(['yes', 'no'] as const).map(v => (
                <button key={v} type="button" onClick={() => set('prior_coding', v)}
                  className={`py-3 rounded-xl border font-black text-sm transition-all ${data.prior_coding === v
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`}>
                  {v === 'yes' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
            {data.prior_coding === 'yes' && (
              <input value={data.prior_platform} onChange={e => set('prior_platform', e.target.value)}
                placeholder="Which platform or language? (e.g. Scratch, Python)" className={inputCls()} />
            )}
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Available Device(s)</p>
            <div className="grid grid-cols-2 gap-2">
              {DEVICES.map(d => (
                <button key={d.value} type="button" onClick={() => toggleDevice(d.value)}
                  className={`py-2.5 px-3 rounded-xl border text-sm font-bold transition-all text-left ${data.devices.includes(d.value)
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Primary Learning Goal</p>
            <div className="space-y-2">
              {GOALS.map(g => (
                <button key={g} type="button" onClick={() => set('learning_goal', g)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${data.learning_goal === g
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`}>
                  {g}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">First Time with Rillcod?</p>
            <div className="grid grid-cols-2 gap-3">
              {([['no', "↩ Returning — we've been here before"], ['yes', '✨ New — first time registering']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => set('is_returning', v === 'no' ? 'no' : 'yes')}
                  className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all text-left ${data.is_returning === (v === 'no' ? 'no' : 'yes')
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">How Did You Hear About Us?</p>
            <div className="space-y-2">
              {REFERRALS.map(r => (
                <button key={r} type="button" onClick={() => set('referral_source', r)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${data.referral_source === r
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`}>
                  {r}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Special Notes (optional)</p>
            <textarea value={data.special_notes} onChange={e => set('special_notes', e.target.value)}
              placeholder="Any special needs, medical conditions, or learning accommodations we should know about…"
              rows={3} className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 resize-none transition-colors placeholder:text-[#52525b]" />
          </section>
        </>
      )}

      {/* ── First time + Referral — registration forms ── */}
      {!isAssessment && (
        <>
          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">First Time at Rillcod?</p>
            <div className="grid grid-cols-2 gap-3">
              {([['yes', '✨ New — first time registering'], ['no', "↩ Returning — we've been here before"]] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => set('is_returning', v === 'no' ? 'no' : 'yes')}
                  className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all text-left ${data.is_returning === (v === 'no' ? 'no' : 'yes')
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">How Did You Hear About Us?</p>
            <div className="space-y-2">
              {REFERRALS.map(r => (
                <button key={r} type="button" onClick={() => set('referral_source', r)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${data.referral_source === r
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'}`}>
                  {r}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ── Parent information ── */}
      <section className="space-y-3">
        <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Parent / Guardian Information</p>

        <div data-field-error={(attempted && !data.parent_name.trim()) || undefined}>
          <input required value={data.parent_name} onChange={e => set('parent_name', e.target.value)} onBlur={captureOnBlur}
            placeholder="Your full name *" className={inputCls(attempted && !data.parent_name.trim())} />
          {attempted && !data.parent_name.trim() && <p className="text-rose-400 text-xs mt-1">Your name is required</p>}
        </div>

        {/* WhatsApp with auto-format + validation */}
        <div data-field-error={(attempted && !data.parent_whatsapp.trim()) || undefined}>
          <div className="relative">
            <input required type="tel" inputMode="tel" value={data.parent_whatsapp}
              onChange={e => set('parent_whatsapp', e.target.value)}
              onBlur={handleWhatsAppBlur}
              placeholder={`WhatsApp / contact number * (e.g. ${brandContact.phoneShort})`}
              className={inputCls(attempted && !data.parent_whatsapp.trim()) + ' pr-10'} />
            {data.parent_whatsapp && (
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-lg ${isValidWhatsApp(data.parent_whatsapp) ? 'text-emerald-400' : 'text-[#52525b]'}`}>
                {isValidWhatsApp(data.parent_whatsapp) ? '✓' : '…'}
              </span>
            )}
          </div>
          {data.parent_whatsapp && !isValidWhatsApp(data.parent_whatsapp) && (
            <p className="text-[10px] text-rose-400 font-bold mt-1">⚠ Must be exactly 13 digits (including +234 prefix) or a valid 11-digit local format.</p>
          )}
          {attempted && !data.parent_whatsapp.trim() && <p className="text-rose-400 text-xs mt-1">WhatsApp number is required</p>}
        </div>

        {/* Email with typo suggestion */}
        <div data-field-error={(attempted && !data.parent_email.trim()) || undefined}>
          <input required type="email" value={data.parent_email}
            onChange={e => { set('parent_email', e.target.value); setEmailHint(null); }}
            onBlur={handleEmailBlur}
            placeholder="Email address (for confirmation) *"
            className={inputCls(attempted && !data.parent_email.trim())} />
          {emailHint && (
            <div className="flex items-center justify-between mt-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-400">Did you mean <strong>{emailHint}</strong>?</p>
              <button type="button" onClick={() => { set('parent_email', emailHint); setEmailHint(null); }}
                className="text-[10px] font-black text-amber-400 hover:text-white transition-colors ml-3 shrink-0">Use this</button>
            </div>
          )}
          {attempted && !data.parent_email.trim() && <p className="text-rose-400 text-xs mt-1">Email address is required</p>}
        </div>
      </section>

      {/* ── Consent ── */}
      <div className="bg-[#141618] border border-[#2a2d33] rounded-xl p-5 mt-4 space-y-4">
        <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Consent Statement</p>
        <p className="text-sm text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">
          {(() => {
            let body = form.body;
            if (bodyHasFee && childCount > 1) body = body.replace(/₦[\d,]+/, fmtNaira(totalAmount));
            return body.replace(/_+(\s*\(parent\/guardian name\))?/gi, data.parent_name ? ` ${data.parent_name} ` : ' _____________ ');
          })()}
        </p>
        <label className={`flex items-start gap-3 pt-4 border-t cursor-pointer group ${attempted && !data.consent_acknowledged ? 'border-rose-500/40' : 'border-[#2a2d33]'}`}>
          <div className="pt-0.5">
            <input type="checkbox" required checked={data.consent_acknowledged}
              onChange={e => set('consent_acknowledged', e.target.checked)}
              className="w-4 h-4 rounded border-[#2a2d33] bg-[#0b0c0e] text-amber-500 focus:ring-amber-500/20 focus:ring-offset-0 cursor-pointer" />
          </div>
          <span className={`text-xs font-bold group-hover:text-white transition-colors ${attempted && !data.consent_acknowledged ? 'text-rose-400' : 'text-[#d4d4d8]'}`}>
            I confirm that the information provided is accurate and I acknowledge and agree to the consent statement above.
          </span>
        </label>

        <div className="pt-4 border-t border-[#2a2d33] space-y-3">
          <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Optional — stay in touch</p>
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="pt-0.5">
              <input type="checkbox" checked={data.marketing_email_consent}
                onChange={e => set('marketing_email_consent', e.target.checked)}
                className="w-4 h-4 rounded border-[#2a2d33] bg-[#0b0c0e] text-amber-500 focus:ring-amber-500/20 focus:ring-offset-0 cursor-pointer" />
            </div>
            <span className="text-xs font-bold text-[#a1a1aa] group-hover:text-white transition-colors">
              Email me once a month with programme news, Summer School updates, and gentle reminders about my registration.
            </span>
          </label>
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="pt-0.5">
              <input type="checkbox" checked={data.whatsapp_consent}
                onChange={e => set('whatsapp_consent', e.target.checked)}
                className="w-4 h-4 rounded border-[#2a2d33] bg-[#0b0c0e] text-amber-500 focus:ring-amber-500/20 focus:ring-offset-0 cursor-pointer" />
            </div>
            <span className="text-xs font-bold text-[#a1a1aa] group-hover:text-white transition-colors">
              Send helpful WhatsApp updates about classes and programmes. Reply STOP anytime to opt out.
            </span>
          </label>
        </div>
      </div>

      {/* ── Error summary ── */}
      {attempted && !canSubmit && (
        <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <p className="text-xs text-rose-400 font-bold">
            {missingCount} required {missingCount === 1 ? 'field is' : 'fields are'} still empty — highlighted above
          </p>
        </div>
      )}

      {error && <p className="text-rose-400 text-xs font-bold">{error}</p>}

      <button type="submit" disabled={submitting}
        className="w-full min-h-[52px] py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black rounded-xl text-sm sm:text-base transition-all sticky bottom-3 sm:static shadow-lg shadow-black/40 sm:shadow-none">
        {submitting ? 'Submitting…' : isAssessment ? 'Submit Assessment →' : 'Complete Registration →'}
      </button>

      {/* ── QR ── */}
      <div className="pt-4 border-t border-[#2a2d33]">
        <button type="button" onClick={() => setShowQr(v => !v)}
          className="text-xs text-[#71717a] hover:text-amber-400 font-bold transition-colors flex items-center gap-1.5 mx-auto">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          {showQr ? 'Hide QR code' : 'Show QR code to share'}
        </button>
        {showQr && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="bg-white p-4 rounded-2xl"><HdQrCode value={publicUrl} size={HD_QR_DISPLAY_PX} /></div>
            <p className="text-xs text-[#52525b]">Scan to open this form on any device</p>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-[#52525b] pb-4">
        Rillcod Technologies · Empowering Young Minds Through Code · {brandContact.phone}
      </p>
    </form>
  );
}
