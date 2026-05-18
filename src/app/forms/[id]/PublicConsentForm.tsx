'use client';

import { useState } from 'react';
import QRCode from 'react-qr-code';

interface FormData {
  id: string;
  title: string;
  body: string;
  form_type: string;
  due_date: string | null;
  schools: { name: string } | null;
}

const PROGRAMS = [
  { value: 'young_innovators', label: 'Young Innovators :: PRY', sub: 'Ages 5–10 · Basic programming through fun & games' },
  { value: 'teen_developers',  label: 'Teen Developers :: SEC',  sub: 'Ages 11–19 · Advanced coding & project development' },
] as const;

const DEVICES = [
  { value: 'computer', label: '💻 Computer / Laptop' },
  { value: 'tablet',   label: '📱 Tablet / iPad' },
  { value: 'phone',    label: '📲 Smartphone' },
  { value: 'none',     label: '— None yet' },
];

const GOALS = [
  'Fun & creativity',
  'Academic improvement',
  'Career preparation',
  'Parent / guardian recommendation',
  'Other',
];

const REFERRALS = [
  'Social media (Instagram / Facebook / TikTok)',
  'Friend or family referral',
  'School announcement',
  'Walk-in / physical visit',
  'Online search (Google etc.)',
  'Event / exhibition',
  'Other',
];

const SCHEDULES = ['Weekdays', 'Weekends', 'Either works'];

// ── Section label component ──────────────────────────────────────────────────

function SectionHeading({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-black font-black text-xs shrink-0">
        {n}
      </div>
      <p className="text-[11px] font-black text-[#71717a] uppercase tracking-widest">{label}</p>
      <div className="flex-1 h-px bg-[#2a2d33]" />
    </div>
  );
}

// ── Input helpers ────────────────────────────────────────────────────────────

const inputCls = 'w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]';

function SelectBtn({
  active, onClick, children, className = '',
}: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left border rounded-xl transition-all ${
        active
          ? 'border-amber-500 bg-amber-500/10 text-white'
          : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3f4147] hover:text-[#a1a1aa]'
      } ${className}`}
    >
      {children}
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function PublicConsentForm({
  form,
  publicUrl,
}: {
  form: FormData;
  publicUrl: string;
}) {
  const isAssessment = form.form_type === 'assessment';

  const [step, setStep] = useState<'form' | 'thanks'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showQr, setShowQr] = useState(false);

  const [data, setData] = useState({
    child_name: '',
    child_age: '',
    child_class: '',
    child_current_school: '',
    program_category: '' as 'young_innovators' | 'teen_developers' | '',
    parent_name: '',
    parent_whatsapp: '',
    parent_email: '',
    prior_coding: '' as 'yes' | 'no' | '',
    prior_platform: '',
    devices: [] as string[],
    learning_goal: '',
    referral_source: '',
    preferred_schedule: '',
    special_notes: '',
    consent_acknowledged: false,
  });

  function set(key: string, value: unknown) {
    setData(d => ({ ...d, [key]: value }));
  }

  function toggleDevice(v: string) {
    setData(d => ({
      ...d,
      devices: d.devices.includes(v) ? d.devices.filter(x => x !== v) : [...d.devices, v],
    }));
  }

  const canSubmit =
    data.child_name.trim() &&
    data.child_age &&
    data.child_class.trim() &&
    data.program_category &&
    data.parent_name.trim() &&
    data.parent_whatsapp.trim() &&
    data.parent_email.trim() &&
    data.consent_acknowledged;

  // Progress: count filled required fields
  const requiredFields = ['child_name', 'child_age', 'child_class', 'program_category', 'parent_name', 'parent_whatsapp', 'parent_email', 'consent_acknowledged'];
  const filledCount = requiredFields.filter(k => {
    const v = (data as Record<string, unknown>)[k];
    return v !== '' && v !== false && v != null;
  }).length;
  const progress = Math.round((filledCount / requiredFields.length) * 100);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/public/consent-forms/${form.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          child_current_school: data.child_current_school || undefined,
          email: data.parent_email || undefined,
          response_data: {
            child_name:        data.child_name,
            child_age:         data.child_age,
            child_class:       data.child_class,
            program_category:  data.program_category,
            parent_name:       data.parent_name,
            parent_whatsapp:   data.parent_whatsapp,
            parent_email:      data.parent_email,
            ...(isAssessment && {
              prior_coding:       data.prior_coding,
              prior_platform:     data.prior_platform,
              devices:            data.devices,
              learning_goal:      data.learning_goal,
              referral_source:    data.referral_source,
              preferred_schedule: data.preferred_schedule,
              special_notes:      data.special_notes,
            }),
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error || 'Submission failed. Please try again.'); return; }
      setStep('thanks');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Thank-you screen ─────────────────────────────────────────────────── */
  if (step === 'thanks') {
    return (
      <div className="space-y-5 pb-8">
        <div className="bg-[#141618] border border-emerald-500/30 rounded-2xl p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white">
              {isAssessment ? 'Assessment Received!' : 'Registration Confirmed!'}
            </h1>
            <p className="text-[#a1a1aa] mt-2 text-sm leading-relaxed">
              Thank you, <strong className="text-white">{data.parent_name}</strong>. We've received{' '}
              <strong className="text-white">{data.child_name}</strong>'s{' '}
              {isAssessment ? 'assessment' : 'registration'}.
            </p>
          </div>
          <div className="bg-[#1c1e22] rounded-xl p-4 text-left space-y-2.5">
            {[
              { label: 'Child', value: `${data.child_name}, Age ${data.child_age} · ${data.child_class}` },
              { label: 'Programme', value: data.program_category === 'young_innovators' ? 'Young Innovators (PRY · Ages 5–10)' : 'Teen Developers (SEC · Ages 11–19)' },
              { label: 'Contact', value: data.parent_whatsapp },
              ...(data.parent_email ? [{ label: 'Email', value: data.parent_email }] : []),
              ...(data.child_current_school ? [{ label: 'School', value: data.child_current_school }] : []),
            ].map(r => (
              <div key={r.label} className="flex justify-between gap-3 text-sm">
                <span className="text-[#71717a] font-bold w-20 shrink-0">{r.label}</span>
                <span className="text-white text-right">{r.value}</span>
              </div>
            ))}
          </div>
          {data.parent_email && (
            <p className="text-xs text-[#71717a]">
              Confirmation email sent to <strong className="text-amber-400">{data.parent_email}</strong>
            </p>
          )}
        </div>

        <div className="bg-[#141618] border border-[#2a2d33] rounded-2xl p-6 space-y-3">
          <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">What Happens Next</p>
          {(isAssessment ? [
            'Our team reviews your child\'s assessment responses',
            'We\'ll contact you within 24 hours to discuss the best programme fit',
            'A personalised learning plan is prepared for your child',
          ] : [
            'Your registration details have been received and logged',
            'Our team confirms your child\'s class placement within 24 hours',
            'You\'ll receive class schedule and onboarding details via WhatsApp',
          ]).map((s, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-black font-black text-xs shrink-0 mt-0.5">{i + 1}</div>
              <p className="text-sm text-[#d4d4d8]">{s}</p>
            </div>
          ))}
        </div>

        <div className="bg-[#141618] border border-[#2a2d33] rounded-2xl p-5 text-center space-y-1">
          <p className="text-xs text-[#71717a]">Questions? We're happy to help.</p>
          <p className="font-black text-white text-lg">+234 811 660 0091</p>
          <p className="text-xs text-[#71717a]">support@rillcod.com · @rillcod</p>
          <a
            href="https://wa.me/2348116600091"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-3 px-5 py-2.5 bg-[#25d366] text-white font-black text-sm rounded-xl hover:opacity-90 transition-opacity"
          >
            💬 Chat on WhatsApp
          </a>
        </div>
      </div>
    );
  }

  /* ── Form ─────────────────────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} className="space-y-8 pb-28">

      {/* Title + deadline */}
      <div className="space-y-2">
        <h1 className="text-2xl font-black text-white leading-tight">{form.title}</h1>
        {form.due_date && (
          <p className="text-xs text-amber-400 font-bold inline-flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Deadline: {new Date(form.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
        <p className="text-xs text-[#71717a]">Fields marked <span className="text-rose-400 font-bold">*</span> are required.</p>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] text-[#71717a] font-bold">
          <span>Form progress</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 bg-[#2a2d33] rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* ── Section 1: Child ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading n={1} label="Child's Information" />
        <input
          required value={data.child_name}
          onChange={e => set('child_name', e.target.value)}
          placeholder="Child's full name *"
          className={inputCls}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            required value={data.child_age} type="number" min="4" max="19"
            onChange={e => set('child_age', e.target.value)}
            placeholder="Age *"
            className={inputCls}
          />
          <input
            required value={data.child_class}
            onChange={e => set('child_class', e.target.value)}
            placeholder="Class / Grade *"
            className={inputCls}
          />
        </div>
        <input
          value={data.child_current_school}
          onChange={e => set('child_current_school', e.target.value)}
          placeholder="Current school (optional)"
          className={inputCls}
        />
      </section>

      {/* ── Section 2: Programme ────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading n={2} label="Programme Category *" />
        <div className="space-y-2">
          {PROGRAMS.map(p => (
            <SelectBtn
              key={p.value}
              active={data.program_category === p.value}
              onClick={() => set('program_category', p.value)}
              className="w-full px-4 py-3"
            >
              <p className="font-black text-sm">{p.label}</p>
              <p className="text-xs mt-0.5 opacity-70">{p.sub}</p>
            </SelectBtn>
          ))}
        </div>
      </section>

      {/* ── Assessment extras ────────────────────────────────────────────── */}
      {isAssessment && (
        <>
          <section className="space-y-3">
            <SectionHeading n={3} label="Prior Coding Experience" />
            <div className="grid grid-cols-2 gap-3">
              {(['yes', 'no'] as const).map(v => (
                <SelectBtn
                  key={v} active={data.prior_coding === v}
                  onClick={() => set('prior_coding', v)}
                  className="py-3 text-center font-black text-sm"
                >
                  {v === 'yes' ? '✓ Yes' : '✗ No'}
                </SelectBtn>
              ))}
            </div>
            {data.prior_coding === 'yes' && (
              <input
                value={data.prior_platform}
                onChange={e => set('prior_platform', e.target.value)}
                placeholder="Platform or language used (e.g. Scratch, Python)"
                className={inputCls}
              />
            )}
          </section>

          <section className="space-y-3">
            <SectionHeading n={4} label="Available Device(s) — tick all that apply" />
            <div className="grid grid-cols-2 gap-2">
              {DEVICES.map(d => (
                <SelectBtn
                  key={d.value} active={data.devices.includes(d.value)}
                  onClick={() => toggleDevice(d.value)}
                  className="py-3 px-3 text-sm font-bold"
                >
                  {d.label}
                </SelectBtn>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeading n={5} label="Primary Learning Goal" />
            <div className="space-y-2">
              {GOALS.map(g => (
                <SelectBtn
                  key={g} active={data.learning_goal === g}
                  onClick={() => set('learning_goal', g)}
                  className="w-full px-4 py-2.5 text-sm font-bold"
                >
                  {g}
                </SelectBtn>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeading n={6} label="Preferred Schedule" />
            <div className="grid grid-cols-3 gap-2">
              {SCHEDULES.map(s => (
                <SelectBtn
                  key={s} active={data.preferred_schedule === s}
                  onClick={() => set('preferred_schedule', s)}
                  className="py-3 text-center text-xs font-bold"
                >
                  {s}
                </SelectBtn>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeading n={7} label="How Did You Hear About Us?" />
            <div className="space-y-2">
              {REFERRALS.map(r => (
                <SelectBtn
                  key={r} active={data.referral_source === r}
                  onClick={() => set('referral_source', r)}
                  className="w-full px-4 py-2.5 text-sm font-bold"
                >
                  {r}
                </SelectBtn>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <SectionHeading n={8} label="Special Notes (optional)" />
            <textarea
              value={data.special_notes}
              onChange={e => set('special_notes', e.target.value)}
              placeholder="Any special needs, medical conditions, or accommodations we should know about…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </section>
        </>
      )}

      {/* ── Parent section ───────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionHeading n={isAssessment ? 9 : 3} label="Parent / Guardian Information" />
        <input
          required value={data.parent_name}
          onChange={e => set('parent_name', e.target.value)}
          placeholder="Your full name *"
          className={inputCls}
        />
        <input
          required value={data.parent_whatsapp}
          onChange={e => set('parent_whatsapp', e.target.value)}
          placeholder="WhatsApp / contact number *"
          type="tel"
          className={inputCls}
        />
        <input
          required type="email" value={data.parent_email}
          onChange={e => set('parent_email', e.target.value)}
          placeholder="Email address (for confirmation) *"
          className={inputCls}
        />
      </section>

      {/* ── Consent ──────────────────────────────────────────────────────── */}
      <section>
        <SectionHeading n={isAssessment ? 10 : 4} label="Consent Statement" />
        <div className="bg-[#141618] border border-[#2a2d33] rounded-xl p-5 space-y-4">
          <p className="text-sm text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">
            {form.body.replace(/_+(\s*\(parent\/guardian name\))?/gi,
              data.parent_name ? ` ${data.parent_name} ` : ' _____________ ')}
          </p>
          <label className="flex items-start gap-3 pt-4 border-t border-[#2a2d33] cursor-pointer group">
            <div className="pt-0.5">
              <input
                type="checkbox"
                required
                checked={data.consent_acknowledged}
                onChange={e => set('consent_acknowledged', e.target.checked)}
                className="w-4 h-4 rounded border-[#2a2d33] bg-[#0b0c0e] text-amber-500 focus:ring-amber-500/20 focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <span className="text-xs text-[#d4d4d8] font-bold leading-relaxed group-hover:text-white transition-colors">
              I confirm all information provided is accurate, and I agree to the consent statement above.
            </span>
          </label>
        </div>
      </section>

      {/* QR share */}
      <div className="border-t border-[#2a2d33] pt-4">
        <button
          type="button"
          onClick={() => setShowQr(v => !v)}
          className="text-xs text-[#52525b] hover:text-amber-400 font-bold transition-colors flex items-center gap-1.5 mx-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          {showQr ? 'Hide QR code' : 'Share this form via QR code'}
        </button>
        {showQr && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="bg-white p-4 rounded-2xl shadow-xl">
              <QRCode value={publicUrl} size={160} />
            </div>
            <p className="text-[10px] text-[#52525b]">Scan to open on any device</p>
          </div>
        )}
      </div>

      <p className="text-center text-[10px] text-[#52525b]">
        Rillcod Technologies · Empowering Young Minds Through Code · +234 811 660 0091
      </p>

      {/* ── Sticky submit bar ─────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0b0c0e]/95 backdrop-blur-md border-t border-[#2a2d33] px-4 py-3 safe-bottom">
        <div className="max-w-xl mx-auto space-y-2">
          {error && (
            <p className="text-rose-400 text-xs font-bold text-center">{error}</p>
          )}
          {/* Mini progress in sticky bar */}
          <div className="h-1 bg-[#2a2d33] rounded-full overflow-hidden">
            <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full py-4 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-40 text-black font-black rounded-xl text-sm transition-all shadow-lg shadow-amber-500/20"
          >
            {submitting
              ? 'Submitting…'
              : !canSubmit
              ? `Complete required fields (${filledCount}/${requiredFields.length})`
              : isAssessment
              ? 'Submit Assessment →'
              : 'Complete Registration →'}
          </button>
        </div>
      </div>
    </form>
  );
}
