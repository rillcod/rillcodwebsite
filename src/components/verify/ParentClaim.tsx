'use client';

import { useState, useEffect } from 'react';
import { suggestEmailFix } from '@/lib/email-typo';

const RESEND_COOLDOWN = 30; // seconds before a code can be resent

// Verification is on by default; set NEXT_PUBLIC_PARENT_CLAIM_SKIP_OTP=true to use the
// frictionless (no-code) flow instead — the toggle between "verified" and "fast".
const SKIP_OTP = process.env.NEXT_PUBLIC_PARENT_CLAIM_SKIP_OTP === 'true';

type Step = 'cta' | 'form' | 'otp' | 'done';

// Self-service parent link shown on the verify page. Default: enter details → 6-digit
// code by email + WhatsApp → verify → account auto-created + child (and siblings) linked.
export default function ParentClaim({ code, needsGender, onLinked }: { code: string; needsGender?: boolean; onLinked?: () => void }) {
  const [step, setStep] = useState<Step>('cta');
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', relationship: 'Guardian', childName: '', childGender: '' as '' | 'male' | 'female' });
  const [claimId, setClaimId] = useState('');
  const [otp, setOtp] = useState('');
  const [sentVia, setSentVia] = useState<{ email: boolean; whatsapp: boolean } | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    childName: string | null;
    accountCreated: boolean;
    siblingsLinked: number;
    credentials?: {
      email?: boolean;
      whatsapp?: boolean;
      parentPasswordSent?: boolean;
      studentPasswordSent?: boolean;
      parentEmail?: string;
      studentEmail?: string;
    } | null;
    genderRecorded?: boolean;
  } | null>(null);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Seamless: auto-verify as soon as all 6 digits are in — no extra tap.
  useEffect(() => {
    if (step === 'otp' && otp.length === 6 && !loading) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step]);

  const emailFix = suggestEmailFix(form.email);
  const isParent = form.relationship === 'Father' || form.relationship === 'Mother';
  const field = 'w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors';
  const box = 'bg-card border border-border rounded-2xl p-6 space-y-4';

  function applyDone(j: any) {
    setDone({
      childName: j.childName ?? null,
      accountCreated: !!j.accountCreated,
      siblingsLinked: j.siblingsLinked ?? 0,
      credentials: j.credentials ?? null,
      genderRecorded: !!j.genderRecorded,
    });
    setStep('done');
    onLinked?.(); // unlock the gated result on the verify page
  }

  async function sendCode(): Promise<boolean> {
    const res = await fetch('/api/parent-claim/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, ...form }),
    });
    const j = await res.json();
    if (!res.ok) { setError(j.error || 'Could not send code'); return false; }
    setClaimId(j.claimId); setSentVia(j.sentVia || null); setCooldown(RESEND_COOLDOWN);
    return true;
  }

  async function resend() {
    if (cooldown > 0) return;
    setError(null); setLoading(true);
    try { await sendCode(); } catch { setError('Network error — please try again.'); }
    finally { setLoading(false); }
  }

  async function startOrSubmit() {
    setError(null); setLoading(true);
    try {
      if (SKIP_OTP) {
        const res = await fetch('/api/parent-claim/intake', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, ...form }),
        });
        const j = await res.json();
        if (!res.ok) { setError(j.error || 'Something went wrong'); return; }
        applyDone(j);
      } else {
        if (await sendCode()) setStep('otp');
      }
    } catch { setError('Network error — please try again.'); }
    finally { setLoading(false); }
  }

  async function verify() {
    setError(null); setLoading(true);
    try {
      const res = await fetch('/api/parent-claim/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimId, otp }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error || 'Verification failed'); return; }
      applyDone(j);
    } catch { setError('Network error — please try again.'); }
    finally { setLoading(false); }
  }

  const genderRequired = !!needsGender;
  const formValid = form.fullName && form.email && form.phone && (isParent ? form.childName : true) && (!genderRequired || form.childGender);

  if (step === 'done' && done) {
    const creds = done.credentials;
    const deliveryNote = creds?.email || creds?.whatsapp
      ? `Login details sent${creds.email && creds.whatsapp ? ' by email and WhatsApp' : creds.email ? ' by email' : ' via WhatsApp'}.`
      : 'We could not deliver login details automatically — use the button below or contact the school.';

    return (
      <div className={box}>
        <p className="text-sm font-black text-emerald-400">✓ Done{done.childName ? ` — ${done.childName} is linked to your account` : ''}.</p>
        {done.siblingsLinked > 0 && (
          <p className="text-xs text-foreground">We also linked {done.siblingsLinked} sibling{done.siblingsLinked !== 1 ? 's' : ''} on record with your contact.</p>
        )}

        {done.genderRecorded && (
          <p className="text-xs text-muted-foreground">Child&apos;s gender was saved to their school record — thank you.</p>
        )}

        <div className="rounded-xl border border-border bg-background p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Your portal access</p>
          <p className="text-xs text-muted-foreground">{deliveryNote}</p>

          {creds?.parentEmail && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Parent portal</p>
              <p className="text-xs font-mono text-foreground mt-1">{creds.parentEmail}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {creds.parentPasswordSent
                  ? 'Temporary password included in your email/WhatsApp.'
                  : 'Use your existing password or reset at login.'}
              </p>
            </div>
          )}

          {creds?.studentEmail && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary">Student portal</p>
              <p className="text-xs font-mono text-foreground mt-1">{creds.studentEmail}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {creds.studentPasswordSent
                  ? 'Temporary password included in your email/WhatsApp.'
                  : 'Your child should use their existing password or reset at login.'}
              </p>
            </div>
          )}

        </div>

        <a
          href={`/login?type=parent&email=${encodeURIComponent(form.email)}`}
          className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all"
        >
          Sign in to my parent portal
        </a>
      </div>
    );
  }

  if (step === 'cta') {
    return (
      <div className={box}>
        <div className="space-y-1">
          <p className="text-sm font-black text-foreground">Are you the parent / guardian?</p>
          <p className="text-xs text-muted-foreground">
            {SKIP_OTP
              ? 'Enter your details once to unlock the full result — we’ll create & link your parent account automatically.'
              : 'Confirm it’s you with a quick code to unlock the full result — your parent account is then created & linked automatically.'}
          </p>
        </div>
        <button onClick={() => setStep('form')} className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all">
          Link this child to my account
        </button>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className={box}>
        <p className="text-sm font-black text-foreground">Enter your code</p>
        <p className="text-xs text-muted-foreground">
          We sent a 6-digit code{sentVia?.whatsapp ? ' via WhatsApp' : ''}{sentVia?.whatsapp && sentVia?.email ? ' and' : ''}{sentVia?.email ? ' by email' : ''}. Enter it to unlock the result — it links automatically.
        </p>
        {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}
        <input autoFocus className={`${field} tracking-[0.5em] text-center text-lg font-black`} inputMode="numeric" maxLength={6}
          placeholder="••••••" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        <div className="flex gap-2">
          <button onClick={() => setStep('form')} className="px-4 py-2.5 border border-border rounded-xl text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">Back</button>
          <button onClick={verify} disabled={loading || otp.length !== 6}
            className="flex-1 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50">
            {loading ? 'Verifying…' : 'Verify & link'}
          </button>
        </div>
        <button onClick={resend} disabled={loading || cooldown > 0}
          className="text-[11px] font-bold text-primary hover:text-primary/80 disabled:text-muted-foreground disabled:cursor-default transition-colors">
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Didn’t get it? Resend code'}
        </button>
      </div>
    );
  }

  // step === 'form'
  return (
    <div className={box}>
      <p className="text-sm font-black text-foreground">Your details</p>
      {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}
      <input className={field} placeholder="Your full name" value={form.fullName}
        onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} />
      <div>
        <input className={field} type="email" placeholder="Your email" value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        {emailFix && (
          <button type="button" onClick={() => setForm(f => ({ ...f, email: emailFix }))}
            className="mt-1.5 text-[10px] font-bold text-amber-500 hover:text-amber-400">
            Did you mean <span className="underline">{emailFix}</span>? — tap to fix
          </button>
        )}
      </div>
      <input className={field} type="tel" placeholder="Your phone (WhatsApp)" value={form.phone}
        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      <select className={field} value={form.relationship}
        onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}>
        {['Guardian', 'Father', 'Mother', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {isParent ? (
        <div>
          <input className={field} placeholder="Child’s name (as on the card)" value={form.childName}
            onChange={e => setForm(f => ({ ...f, childName: e.target.value }))} />
          <p className="text-[10px] text-muted-foreground mt-1">A rough spelling is fine — we just confirm it’s the right child.</p>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">As a guardian, your role is enough — no name needed.</p>
      )}
      {genderRequired && (
        <div>
          <select
            className={field}
            value={form.childGender}
            onChange={e => setForm(f => ({ ...f, childGender: e.target.value as '' | 'male' | 'female' }))}
          >
            <option value="">Child&apos;s gender (required for records)</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">Helps us keep accurate school records — same as the consent form.</p>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => setStep('cta')} className="px-4 py-2.5 border border-border rounded-xl text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">Back</button>
        <button onClick={startOrSubmit} disabled={loading || !formValid}
          className="flex-1 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all disabled:opacity-50">
          {loading ? (SKIP_OTP ? 'Linking…' : 'Sending…') : (SKIP_OTP ? 'Create & link my account' : 'Send verification code')}
        </button>
      </div>
    </div>
  );
}
