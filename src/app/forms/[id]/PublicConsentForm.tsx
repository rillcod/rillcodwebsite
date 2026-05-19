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

// Parse the per-child fee from the form body (e.g. "₦20,000") — defaults to 15,000 minimum
function parseBodyFee(body: string): number {
  const m = body.match(/₦([\d,]+)/);
  if (!m) return 15_000;
  return Math.max(parseInt(m[1].replace(/,/g, ''), 10) || 15_000, 15_000);
}

function fmtNaira(n: number): string {
  return '₦' + n.toLocaleString('en-NG');
}

const PROGRAMS = [
  { value: 'young_innovators', label: 'Young Innovators :: PRY', sub: 'Ages 5–10 · Basic programming through fun & games' },
  { value: 'teen_developers',  label: 'Teen Developers :: SEC',  sub: 'Ages 11–19 · Advanced coding & project development' },
] as const;

const DEVICES = [
  { value: 'computer', label: 'Computer / Laptop' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'phone', label: 'Smartphone' },
  { value: 'none', label: 'None yet' },
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

export default function PublicConsentForm({
  form,
  publicUrl,
}: {
  form: FormData;
  publicUrl: string;
}) {
  const isAssessment = form.form_type === 'assessment';

  // Fee — only active when the form body contains a ₦ amount
  const bodyHasFee = /₦[\d,]+/.test(form.body);
  const feePerChild = bodyHasFee ? parseBodyFee(form.body) : 0;

  const [step, setStep] = useState<'form' | 'thanks'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showQr, setShowQr] = useState(false);

  const [childCount, setChildCount] = useState(1);
  const [children, setChildren] = useState<ChildEntry[]>([emptyChild()]);

  const [data, setData] = useState({
    parent_name: '',
    parent_whatsapp: '',
    parent_email: '',
    // Assessment extras
    prior_coding: '' as 'yes' | 'no' | '',
    prior_platform: '',
    devices: [] as string[],
    learning_goal: '',
    referral_source: '',
    is_returning: '' as 'yes' | 'no' | '',
    special_notes: '',
    consent_acknowledged: false,
  });

  function updateChildCount(n: number) {
    setChildCount(n);
    setChildren(prev => {
      const next = [...prev];
      while (next.length < n) next.push(emptyChild());
      return next.slice(0, n);
    });
  }

  function updateChild(idx: number, field: keyof ChildEntry, value: string) {
    setChildren(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c));
  }

  function set(key: string, value: unknown) {
    setData(d => ({ ...d, [key]: value }));
  }

  function toggleDevice(v: string) {
    setData(d => ({
      ...d,
      devices: d.devices.includes(v) ? d.devices.filter(x => x !== v) : [...d.devices, v],
    }));
  }

  const totalAmount = bodyHasFee ? feePerChild * childCount : 0;

  const allChildrenValid = children.every(
    c => c.name.trim() && c.gender && c.age && c.class_.trim() && c.program
  );
  const canSubmit =
    allChildrenValid &&
    data.parent_name.trim() &&
    data.parent_whatsapp.trim() &&
    data.parent_email.trim() &&
    data.consent_acknowledged;

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
          child_current_school: children[0].school || undefined,
          email: data.parent_email || undefined,
          response_data: {
            // Legacy primary-child fields (backward compat)
            child_name:    children[0].name,
            child_age:     children[0].age,
            child_gender:  children[0].gender,
            child_class:   children[0].class_,
            program_category: children[0].program,
            child_current_school: children[0].school || undefined,
            // Multi-child full data
            child_count: children.length,
            children: children.map(c => ({
              name:    c.name,
              gender:  c.gender,
              age:     c.age,
              class:   c.class_,
              program: c.program,
              school:  c.school || undefined,
            })),
            parent_name:     data.parent_name,
            parent_whatsapp: data.parent_whatsapp,
            parent_email:    data.parent_email,
            ...(bodyHasFee && {
              fee_per_child: feePerChild,
              total_amount:  totalAmount,
              child_count:   children.length,
            }),
            ...(isAssessment && {
              prior_coding:    data.prior_coding,
              prior_platform:  data.prior_platform,
              devices:         data.devices,
              learning_goal:   data.learning_goal,
              referral_source: data.referral_source,
              is_returning:    data.is_returning,
              special_notes:   data.special_notes,
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

  const inputCls = 'w-full bg-[#141618] border border-[#2a2d33] text-white px-4 py-3 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-[#52525b]';

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
              Thank you, <strong className="text-white">{data.parent_name}</strong>.{' '}
              {children.length === 1
                ? <>We've received <strong className="text-white">{children[0].name}</strong>'s {isAssessment ? 'assessment' : 'registration'}.</>
                : <>We've received the {isAssessment ? 'assessment' : 'registration'} for <strong className="text-white">{children.length} children</strong>.</>
              }
            </p>
          </div>

          {/* Summary */}
          <div className="bg-[#1c1e22] rounded-xl p-4 text-left space-y-2 mt-2">
            {children.map((child, idx) => (
              <div key={idx} className="flex justify-between gap-3 text-sm">
                <span className="text-[#71717a] font-bold w-24 shrink-0">
                  {children.length > 1 ? `Child ${idx + 1}` : 'Child'}
                </span>
                <span className="text-white text-right">
                  {child.name}
                  {child.gender ? `, ${child.gender.charAt(0).toUpperCase() + child.gender.slice(1)}` : ''}
                  {child.age ? `, Age ${child.age}` : ''}
                  {child.class_ ? ` · ${child.class_}` : ''}
                </span>
              </div>
            ))}
            {children.length === 1 && (
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-[#71717a] font-bold w-24 shrink-0">Programme</span>
                <span className="text-white text-right">
                  {children[0].program === 'young_innovators' ? 'Young Innovators (PRY)' : 'Teen Developers (SEC)'}
                </span>
              </div>
            )}
            {bodyHasFee && (
              <div className="flex justify-between gap-3 text-sm pt-2 mt-1 border-t border-[#2a2d33]">
                <span className="text-[#71717a] font-bold w-24 shrink-0">Total Fee</span>
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
            ]).map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center text-black font-black text-xs shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm text-[#d4d4d8]">{s}</p>
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
      </div>

      {/* How many children */}
      <section className="space-y-3">
        <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">How Many Children Are You Registering?</p>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map(n => (
            <button
              key={n} type="button"
              onClick={() => updateChildCount(n)}
              className={`py-3 rounded-xl border font-black text-base transition-all ${childCount === n
                ? 'border-amber-500 bg-amber-500/10 text-white'
                : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      {/* Fee calculator — only shown when form body specifies a fee */}
      {bodyHasFee && (
        <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Programme Fee</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-[#a1a1aa]">
              {fmtNaira(feePerChild)} × {childCount} {childCount === 1 ? 'child' : 'children'}
            </span>
            <span className="text-white font-black text-xl">{fmtNaira(totalAmount)}</span>
          </div>
          {childCount > 1 && (
            <p className="text-[10px] text-[#71717a]">Total programme fee for {childCount} children</p>
          )}
        </div>
      )}

      {/* Per-child panels */}
      {children.map((child, idx) => (
        <section key={idx} className="space-y-3 border border-[#2a2d33] rounded-2xl p-4">
          <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
            {childCount > 1 ? `Child ${idx + 1}` : "Child's Information"}
          </p>

          <input
            required value={child.name}
            onChange={e => updateChild(idx, 'name', e.target.value)}
            placeholder="Child's full name *"
            className={inputCls}
          />

          <div>
            <p className="text-[10px] font-bold text-[#71717a] mb-2">Gender *</p>
            <div className="grid grid-cols-2 gap-3">
              {(['male', 'female'] as const).map(g => (
                <button
                  key={g} type="button"
                  onClick={() => updateChild(idx, 'gender', g)}
                  className={`py-3 rounded-xl border font-black text-sm transition-all ${child.gender === g
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
                  }`}
                >
                  {g === 'male' ? '👦 Male' : '👧 Female'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              required value={child.age} type="number" min="4" max="19"
              onChange={e => updateChild(idx, 'age', e.target.value)}
              placeholder="Age *"
              className={inputCls}
            />
            <input
              required value={child.class_}
              onChange={e => updateChild(idx, 'class_', e.target.value)}
              placeholder="Class / Grade *"
              className={inputCls}
            />
          </div>

          <div>
            <p className="text-[10px] font-bold text-[#71717a] mb-2">Programme *</p>
            <div className="space-y-2">
              {PROGRAMS.map(p => (
                <button
                  key={p.value} type="button"
                  onClick={() => updateChild(idx, 'program', p.value)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${child.program === p.value
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
                  }`}
                >
                  <p className="font-black text-sm">{p.label}</p>
                  <p className="text-xs mt-0.5 opacity-70">{p.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <input
            value={child.school}
            onChange={e => updateChild(idx, 'school', e.target.value)}
            placeholder="Child's current school (optional)"
            className={inputCls}
          />
        </section>
      ))}

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
                  className={`py-3 rounded-xl border font-black text-sm transition-all ${data.prior_coding === v
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
                className={inputCls}
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
                  className={`py-2.5 px-3 rounded-xl border text-sm font-bold transition-all text-left ${data.devices.includes(d.value)
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
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${data.learning_goal === g
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
            <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">First Time with Rillcod?</p>
            <div className="grid grid-cols-2 gap-3">
              {([['no', '↩ Returning — we\'ve been here before'], ['yes', '✨ New — first time registering']] as const).map(([v, label]) => (
                <button
                  key={v} type="button"
                  onClick={() => set('is_returning', v === 'no' ? 'no' : 'yes')}
                  className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all text-left ${data.is_returning === (v === 'no' ? 'no' : 'yes')
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
                    }`}
                >
                  {label}
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
                  className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm font-bold transition-all ${data.referral_source === r
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

      {/* First time at Rillcod? — registration forms only (assessment already asks this) */}
      {!isAssessment && (
        <section className="space-y-3">
          <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">First Time at Rillcod?</p>
          <div className="grid grid-cols-2 gap-3">
            {([['yes', '✨ New — first time registering'], ['no', '↩ Returning — we\'ve been here before']] as const).map(([v, label]) => (
              <button
                key={v} type="button"
                onClick={() => set('is_returning', v === 'no' ? 'no' : 'yes')}
                className={`py-3 px-4 rounded-xl border text-xs font-bold transition-all text-left ${data.is_returning === (v === 'no' ? 'no' : 'yes')
                  ? 'border-amber-500 bg-amber-500/10 text-white'
                  : 'border-[#2a2d33] bg-[#141618] text-[#71717a] hover:border-[#3a3d43]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Section: Parent */}
      <section className="space-y-3">
        <p className="text-[10px] font-black text-[#71717a] uppercase tracking-widest">Parent / Guardian Information</p>
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
          className={inputCls}
        />
        <input
          required type="email" value={data.parent_email}
          onChange={e => set('parent_email', e.target.value)}
          placeholder="Email address (for confirmation) *"
          className={inputCls}
        />
      </section>

      {/* Consent notice */}
      <div className="bg-[#141618] border border-[#2a2d33] rounded-xl p-5 mt-4 space-y-4">
        <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Consent Statement</p>
        <p className="text-sm text-[#a1a1aa] leading-relaxed whitespace-pre-wrap">
          {(() => {
            let body = form.body;
            // Replace the ₦ fee in the body with computed total when >1 child
            if (bodyHasFee && childCount > 1) body = body.replace(/₦[\d,]+/, fmtNaira(totalAmount));
            // Fill in parent name placeholder
            return body.replace(/_+(\s*\(parent\/guardian name\))?/gi, data.parent_name ? ` ${data.parent_name} ` : ' _____________ ');
          })()}
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
          <span className="text-xs text-[#d4d4d8] font-bold group-hover:text-white transition-colors">
            I confirm that the information provided is accurate and I acknowledge and agree to the consent statement above.
          </span>
        </label>
      </div>

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
