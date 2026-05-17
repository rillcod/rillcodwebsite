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
  { value: 'junior_coders',    label: 'Junior Coders :: PRY',    sub: 'Ages 5–10 · Basic programming through fun & games' },
  { value: 'teen_developers',  label: 'Teen Developers :: SEC',  sub: 'Ages 11–19 · Advanced coding & project development' },
] as const;

const DEVICES = [
  { value: 'computer',  label: 'Computer / Laptop' },
  { value: 'tablet',    label: 'Tablet' },
  { value: 'phone',     label: 'Smartphone' },
  { value: 'none',      label: 'None yet' },
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
  'Online search',
  'Event / exhibition',
  'Other',
];

const SCHEDULES = ['Weekdays', 'Weekends', 'Either works'];

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
    program_category: '' as 'junior_coders' | 'teen_developers' | '',
    parent_name: '',
    parent_whatsapp: '',
    parent_email: '',
    // Assessment extras
    prior_coding: '' as 'yes' | 'no' | '',
    prior_platform: '',
    devices: [] as string[],
    learning_goal: '',
    referral_source: '',
    preferred_schedule: '',
    special_notes: '',
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
    data.parent_whatsapp.trim();

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
      <div className="space-y-6">
        {/* Confirmation card */}
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
              Thank you, <strong className="text-white">{data.parent_name}</strong>. We've received{' '}
              <strong className="text-white">{data.child_name}</strong>'s{' '}
              {isAssessment ? 'assessment' : 'registration'}.
            </p>
          </div>

          {/* Summary */}
          <div className="bg-[#1c1e22] rounded-xl p-4 text-left space-y-2 mt-2">
            {[
              { label: 'Child',     value: `${data.child_name}, Age ${data.child_age} · ${data.child_class}` },
              { label: 'Programme', value: data.program_category === 'junior_coders' ? 'Junior Coders (PRY)' : 'Teen Developers (SEC)' },
              { label: 'Contact',   value: data.parent_whatsapp },
              ...(data.parent_email ? [{ label: 'Email', value: data.parent_email }] : []),
            ].map(r => (
              <div key={r.label} className="flex justify-between gap-3 text-sm">
                <span className="text-[#71717a] font-bold w-24 shrink-0">{r.label}</span>
                <span className="text-white text-right">{r.value}</span>
              </div>
            ))}
          </div>

          {data.parent_email && (
            <p className="text-xs text-[#71717a]">
              A confirmation email has been sent to <strong className="text-amber-400">{data.parent_email}</strong>
            </p>
          )}
        </div>

        {/* What's next */}
        <div className="bg-[#141618] border border-[#2a2d33] rounded-2xl p-6 space-y-4">
          <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">What Happens Next</p>
          <div className="space-y-3">
            {(isAssessment ? [
              'Our team reviews your child\'s assessment responses',
              'We\'ll contact you within 24 hours to discuss the best programme fit',
              'A personalised learning plan is prepared for your child',
            ] : [
              'Your registration details have been received',
              'Our team confirms your child\'s placement within 24 hours',
              'You\'ll receive class schedule and onboarding details via WhatsApp',
            ]).map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-black font-black text-xs shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm text-[#d4d4d8]">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div className="bg-[#141618] border border-[#2a2d33] rounded-2xl p-5 text-center space-y-1">
          <p className="text-xs text-[#71717a]">Questions? We're here to help.</p>
          <p className="font-black text-white">+234 811 660 0091</p>
          <p className="text-xs text-[#71717a]">support@rillcod.com · @rillcod</p>
        </div>
      </div>
    );
  }

  /* ── Registration / Assessment form ───────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Form header */}
      <div className="space-y-2">
        <h1 className="text-2xl font-black text-white leading-tight">{form.title}</h1>
        {form.due_date && (
          <p className="text-xs text-amber-400 font-bold">
            Deadline: {new Date(form.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        )}
        {/* Consent statement */}
        <div className="bg-[#141618] border border-[#2a2d33] rounded-xl p-4 mt-3">
          <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-2">Consent Statement</p>
          <p className="text-sm text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">{form.body}</p>
        </div>
      </div>

      {/* Section: Child */}
      <section className="space-y-3">
        <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Child's Information</p>
        <input
          required value={data.child_name}
          onChange={e => set('child_name', e.target.value)}
          placeholder="Child's full name *"
          className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            required value={data.child_age} type="number" min="4" max="19"
            onChange={e => set('child_age', e.target.value)}
            placeholder="Age *"
            className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]"
          />
          <input
            required value={data.child_class}
            onChange={e => set('child_class', e.target.value)}
            placeholder="Class / Grade *"
            className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]"
          />
        </div>
        <input
          value={data.child_current_school}
          onChange={e => set('child_current_school', e.target.value)}
          placeholder="Child's current school (optional)"
          className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]"
        />
      </section>

      {/* Section: Programme */}
      <section className="space-y-3">
        <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Programme Category *</p>
        <div className="space-y-2">
          {PROGRAMS.map(p => (
            <button
              key={p.value} type="button"
              onClick={() => set('program_category', p.value)}
              className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                data.program_category === p.value
                  ? 'border-amber-500 bg-amber-500/10 text-white'
                  : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
              }`}
            >
              <p className="font-black text-sm">{p.label}</p>
              <p className="text-xs mt-0.5 opacity-70">{p.sub}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Section: Assessment extras */}
      {isAssessment && (
        <>
          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Prior Coding Experience</p>
            <div className="grid grid-cols-2 gap-3">
              {(['yes', 'no'] as const).map(v => (
                <button
                  key={v} type="button"
                  onClick={() => set('prior_coding', v)}
                  className={`py-3 rounded-xl border font-black text-sm transition-all ${
                    data.prior_coding === v
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
                  }`}
                >
                  {v === 'yes' ? 'Yes' : 'No'}
                </button>
              ))}
            </div>
            {data.prior_coding === 'yes' && (
              <input
                value={data.prior_platform}
                onChange={e => set('prior_platform', e.target.value)}
                placeholder="Which platform or language? (e.g. Scratch, Python)"
                className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]"
              />
            )}
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Available Device(s)</p>
            <div className="grid grid-cols-2 gap-2">
              {DEVICES.map(d => (
                <button
                  key={d.value} type="button"
                  onClick={() => toggleDevice(d.value)}
                  className={`py-2.5 px-3 rounded-xl border text-sm font-bold transition-all text-left ${
                    data.devices.includes(d.value)
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Primary Learning Goal</p>
            <div className="space-y-2">
              {GOALS.map(g => (
                <button
                  key={g} type="button"
                  onClick={() => set('learning_goal', g)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                    data.learning_goal === g
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Preferred Schedule</p>
            <div className="grid grid-cols-3 gap-2">
              {SCHEDULES.map(s => (
                <button
                  key={s} type="button"
                  onClick={() => set('preferred_schedule', s)}
                  className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                    data.preferred_schedule === s
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">How Did You Hear About Us?</p>
            <div className="space-y-2">
              {REFERRALS.map(r => (
                <button
                  key={r} type="button"
                  onClick={() => set('referral_source', r)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                    data.referral_source === r
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Special Notes (optional)</p>
            <textarea
              value={data.special_notes}
              onChange={e => set('special_notes', e.target.value)}
              placeholder="Any special needs, medical conditions, or learning accommodations we should know about…"
              rows={3}
              className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 resize-none transition-colors placeholder:text-[#52525b]"
            />
          </section>
        </>
      )}

      {/* Section: Parent */}
      <section className="space-y-3">
        <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Parent / Guardian Information</p>
        <input
          required value={data.parent_name}
          onChange={e => set('parent_name', e.target.value)}
          placeholder="Your full name *"
          className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]"
        />
        <input
          required value={data.parent_whatsapp}
          onChange={e => set('parent_whatsapp', e.target.value)}
          placeholder="WhatsApp / contact number *"
          className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]"
        />
        <input
          type="email" value={data.parent_email}
          onChange={e => set('parent_email', e.target.value)}
          placeholder="Email address (optional — for confirmation)"
          className="w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]"
        />
      </section>

      {/* Consent notice */}
      <p className="text-xs text-[#52525b] leading-relaxed">
        By submitting this form I confirm that the information provided is accurate and I agree to the consent statement above.
      </p>

      {error && (
        <p className="text-rose-400 text-xs font-bold">{error}</p>
      )}

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="w-full py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-black rounded-xl text-sm transition-all"
      >
        {submitting
          ? 'Submitting…'
          : isAssessment
          ? 'Submit Assessment →'
          : 'Complete Registration →'}
      </button>

      {/* QR code */}
      <div className="pt-4 border-t border-[#2a2d33]">
        <button
          type="button"
          onClick={() => setShowQr(v => !v)}
          className="text-xs text-[#71717a] hover:text-amber-400 font-bold transition-colors flex items-center gap-1.5 mx-auto"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          {showQr ? 'Hide QR code' : 'Show QR code to share'}
        </button>
        {showQr && (
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="bg-white p-4 rounded-2xl">
              <QRCode value={publicUrl} size={180} />
            </div>
            <p className="text-xs text-[#52525b]">Scan to open this form on any device</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-center text-[10px] text-[#52525b] pb-4">
        Rillcod Technologies · Empowering Young Minds Through Code · +234 811 660 0091
      </p>
    </form>
  );
}
