'use client';

import { useState, useEffect, useRef } from 'react';
import { suggestEmailFix } from '@/lib/email-typo';
import { PortalAccessBar } from './PortalAccessBar';
import type { ParentClaimLinkedResult } from '@/lib/parent-claim/linked-result';
import { formatAccessCardCodeDisplay } from '@/lib/access-card-code';
import { isValidParentPhone, isValidParentName, isValidParentRelationship } from '@/lib/parents/contact';

const RESEND_COOLDOWN = 30; // seconds before a code can be resent

// The form is handed to Google and must survive the OAuth round-trip. Session
// storage (not local) so it dies with the tab and never outlives the claim.
const GOOGLE_CLAIM_STASH = 'rc:parent-claim:google';

// Verification is on by default. Frictionless intake only works when BOTH
// NEXT_PUBLIC_PARENT_CLAIM_SKIP_OTP=true (UI) and PARENT_CLAIM_ALLOW_SKIP_OTP=true (server).
const SKIP_OTP = process.env.NEXT_PUBLIC_PARENT_CLAIM_SKIP_OTP === 'true';

type Step = 'cta' | 'form' | 'otp' | 'done';

function otpDeliveryHint(sentVia: { email: boolean; whatsapp: boolean } | null): string {
  if (!sentVia) return 'Check your email for a 6-digit code.';
  if (sentVia.email && sentVia.whatsapp) return 'We sent a 6-digit code to your email and WhatsApp.';
  if (sentVia.email) return 'We sent a 6-digit code to your email — check your inbox (and spam folder).';
  return 'We sent a 6-digit code via WhatsApp.';
}

function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalised = path.startsWith('/') ? path : `/${path}`;
  if (typeof window !== 'undefined') return `${window.location.origin}${normalised}`;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.rillcod.com').replace(/\/$/, '');
  return `${base}${normalised}`;
}

function CopyLinkRow({ label, url, accent = 'text-foreground' }: { label: string; url: string; accent?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-2">
      <p className={`text-[10px] font-black uppercase tracking-widest ${accent}`}>{label}</p>
      <div className="flex items-start gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 break-all text-xs font-mono text-primary underline underline-offset-2">
          {url}
        </a>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

// Self-service parent link on result-check. Student number identifies the child; parent
// enters their details once → email code → child linked automatically + login details sent.
export default function ParentClaim({
  code,
  recordGaps,
  autoOpen = true,
  onLinked,
}: {
  code: string;
  recordGaps?: { needsGender?: boolean; needsAge?: boolean };
  /** When true (default), open the details form immediately — no extra “Set up” tap. */
  autoOpen?: boolean;
  onLinked?: (result: ParentClaimLinkedResult) => void;
}) {
  const [step, setStep] = useState<Step>(autoOpen ? 'form' : 'cta');
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', relationship: 'Guardian',
    childGender: '' as '' | 'male' | 'female', childAge: '', childDob: '', whatsappOptIn: true,
  });
  const [claimId, setClaimId] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleReturnHandled = useRef(false);
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
      parentLoginUrl?: string;
      studentLoginUrl?: string;
    } | null;
    genderRecorded?: boolean;
    enrichment?: { genderRecorded?: boolean; ageRecorded?: boolean; dobRecorded?: boolean; whatsappOptInSet?: boolean } | null;
  } | null>(null);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Bring the details form into view as soon as the gate appears.
  useEffect(() => {
    if (step !== 'form') return;
    const el = document.getElementById('parent-claim-form');
    if (!el) return;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
    return () => window.clearTimeout(t);
  }, [step, code]);

  // Seamless: auto-verify as soon as all 6 digits are in — no extra tap.
  useEffect(() => {
    if (step === 'otp' && otp.length === 6 && !loading) void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step]);

  // Returning from Google. Runs once: the query params and the stash are both
  // cleared immediately so a refresh cannot replay the claim.
  useEffect(() => {
    if (googleReturnHandled.current) return;
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    const googleError = params.get('google_error');
    const googleVerified = params.get('google') === 'verified';
    if (!googleError && !googleVerified) return;

    googleReturnHandled.current = true;

    const clearQuery = () => {
      params.delete('google');
      params.delete('google_error');
      const qs = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    };

    if (googleError) {
      setError(googleError);
      clearQuery();
      return;
    }

    let stashed: { code?: string; form?: typeof form } | null = null;
    try {
      const raw = window.sessionStorage.getItem(GOOGLE_CLAIM_STASH);
      stashed = raw ? JSON.parse(raw) : null;
    } catch { stashed = null; }
    window.sessionStorage.removeItem(GOOGLE_CLAIM_STASH);
    clearQuery();

    // Guard against a stash left over from a different child's card.
    if (!stashed?.form || (stashed.code && stashed.code !== code)) {
      setError('Your details were not carried over. Please re-enter them and try again.');
      return;
    }

    setForm(stashed.form);
    setStep('form');
    void completeWithGoogle(stashed.form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const emailFix = suggestEmailFix(form.email);
  const field = 'w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors';
  const box = 'bg-card border border-border rounded-2xl p-6 space-y-4';

  function applyDone(j: {
    childName?: string | null;
    accountCreated?: boolean;
    siblingsLinked?: number;
    credentials?: ParentClaimLinkedResult['credentials'];
    enrichment?: { genderRecorded?: boolean; ageRecorded?: boolean; dobRecorded?: boolean; whatsappOptInSet?: boolean } | null;
  }) {
    const result: ParentClaimLinkedResult = {
      childName: j.childName ?? null,
      accountCreated: !!j.accountCreated,
      siblingsLinked: j.siblingsLinked ?? 0,
      credentials: j.credentials ?? null,
    };
    if (onLinked) {
      // Unlock the report immediately — no intermediate "done" screen when gated.
      onLinked(result);
      return;
    }
    setDone({
      ...result,
      genderRecorded: !!j.enrichment?.genderRecorded,
      enrichment: j.enrichment ?? null,
    });
    setStep('done');
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

  /**
   * Google as an alternative to the emailed code. It proves the same thing the
   * OTP does — that this person controls the email — but cannot be intercepted,
   * forwarded or guessed. Every other field stays required; Google supplies only
   * the email (and a fallback name), never the phone or relationship.
   */
  async function continueWithGoogle() {
    setError(null); setGoogleLoading(true);
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      // Survive the round-trip. The email is intentionally NOT stashed — the
      // server reads it from the Google session, so a tampered stash cannot
      // redirect the claim to another address.
      window.sessionStorage.setItem(GOOGLE_CLAIM_STASH, JSON.stringify({ code, form }));
      const callback = new URL('/auth/callback', window.location.origin);
      callback.searchParams.set('flow', 'claim');
      callback.searchParams.set('claim_code', code);
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback.toString(), queryParams: { prompt: 'select_account' } },
      });
      if (oauthError) throw oauthError;
    } catch (err: any) {
      setError(err?.message || 'Google sign-in failed. Please use the emailed code instead.');
      setGoogleLoading(false);
    }
  }

  async function completeWithGoogle(stashed: typeof form) {
    setError(null); setLoading(true);
    try {
      const res = await fetch('/api/parent-claim/google/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // No email field — the server takes it from the verified Google session.
        body: JSON.stringify({ code, ...stashed, email: undefined }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || 'Could not finish linking with Google. Try the emailed code instead.');
        return;
      }
      applyDone(j);
    } catch { setError('Network error — please try again.'); }
    finally { setLoading(false); }
  }

  const genderRequired = !!recordGaps?.needsGender;
  const ageRequired = !!recordGaps?.needsAge;
  // Google supplies the email itself, so that one field is the only difference
  // between the two paths — everything the child's record needs is still required.
  const googleFormValid = isValidParentName(form.fullName)
    && isValidParentPhone(form.phone)
    && isValidParentRelationship(form.relationship)
    && (!genderRequired || form.childGender)
    && (!ageRequired || (form.childAge && parseInt(form.childAge, 10) >= 3));
  const formValid = googleFormValid && !!form.email.trim();

  if (step === 'done' && done) {
    const creds = done.credentials;
    const deliveryNote = creds?.email || creds?.whatsapp
      ? `Login details sent${creds.email && creds.whatsapp ? ' by email and WhatsApp' : creds.email ? ' by email' : ' via WhatsApp'}.`
      : 'We could not deliver login details automatically — use the links below or contact the school.';
    const resultCheckUrl = absoluteUrl(`/result-check/${encodeURIComponent(code)}`);
    const parentLoginUrl = absoluteUrl(
      creds?.parentLoginUrl ?? `/login?type=parent&email=${encodeURIComponent(form.email)}`,
    );
    const studentLoginUrl = creds?.studentLoginUrl
      ? absoluteUrl(creds.studentLoginUrl)
      : creds?.studentEmail
        ? absoluteUrl(`/login?type=student&email=${encodeURIComponent(creds.studentEmail)}`)
        : null;

    return (
      <div className={box}>
        <p className="text-sm font-black text-emerald-400">
          ✓ Done{done.childName ? ` — ${done.childName} is linked to your account` : ' — your child is linked to your account'}.
        </p>
        {done.accountCreated && (
          <p className="text-xs text-foreground">
            Your parent portal account is ready. Login details were sent to your email{form.phone ? ' and phone' : ''}.
          </p>
        )}
        {!done.accountCreated && (
          <p className="text-xs text-foreground">Your existing parent account is now linked to this child.</p>
        )}
        {done.siblingsLinked > 0 && (
          <p className="text-xs text-foreground">We also linked {done.siblingsLinked} sibling{done.siblingsLinked !== 1 ? 's' : ''} on record with your contact.</p>
        )}

        {(done.enrichment?.genderRecorded || done.enrichment?.ageRecorded || done.enrichment?.dobRecorded) && (
          <p className="text-xs text-muted-foreground">
            {[
              done.enrichment.genderRecorded && 'Gender',
              done.enrichment.dobRecorded && 'Date of birth',
              done.enrichment.ageRecorded && 'Age',
            ].filter(Boolean).join(', ')} saved to your child&apos;s school record — thank you.
          </p>
        )}

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Save these links</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Bookmark or copy — use the result link anytime with RC number <span className="font-mono font-bold text-foreground">{formatAccessCardCodeDisplay(code)}</span>.
            </p>
          </div>
          <CopyLinkRow label="View results anytime" url={resultCheckUrl} accent="text-primary" />
          <CopyLinkRow label="Parent portal login" url={parentLoginUrl} accent="text-emerald-600 dark:text-emerald-400" />
          {studentLoginUrl && (
            <CopyLinkRow label="Student portal login" url={studentLoginUrl} accent="text-violet-600 dark:text-violet-400" />
          )}
        </div>

        <div className="rounded-xl border border-border bg-background p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Your portal access</p>
          <p className="text-xs text-muted-foreground">{deliveryNote}</p>

          {creds?.parentEmail && (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Parent portal</p>
              <p className="text-xs font-mono text-foreground mt-1">{creds.parentEmail}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {creds.parentPasswordSent
                  ? 'Temporary password included in your email.'
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
                  ? 'Temporary password included in your email.'
                  : 'Your child should use their existing password or reset at login.'}
              </p>
            </div>
          )}

        </div>

        {(creds?.parentPasswordSent || creds?.studentPasswordSent) && (
          <p className="text-[10px] text-muted-foreground text-center">
            Temporary passwords were included in your email — open the links above or use the buttons below.
          </p>
        )}

        <PortalAccessBar
          scanCode={code}
          access={{
            parentLoginUrl,
            studentLoginUrl,
            parentEmail: creds?.parentEmail ?? form.email,
            studentEmail: creds?.studentEmail,
          }}
          parentEmailForResend={form.email}
          showResend
        />
      </div>
    );
  }

  if (step === 'cta') {
    return (
      <div className="rc-panel space-y-5 rounded-[1.5rem] p-5 sm:p-7">
        <div className="space-y-2 text-center sm:text-left">
          <p className="rc-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            One-time parent setup
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {SKIP_OTP
              ? 'Enter your details once — your child is linked automatically and login details are sent to your email. Next time you only need the student number.'
              : 'Enter your details once — we email you a quick code to verify you. Your child is linked automatically and login details are sent right after. Next time you only need the student number or log in.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setError(null); setStep('form'); }}
          className="rc-cta rc-cta-pulse flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-bold tracking-wide sm:text-base"
        >
          Set up my parent account
        </button>
        <p className="text-center text-[11px] text-muted-foreground">
          One time only · Your class teacher does not need to do this for you
        </p>
      </div>
    );
  }

  if (step === 'otp') {
    return (
      <div className={box}>
        <p className="text-sm font-black text-foreground">Enter your code</p>
        <p className="text-xs text-muted-foreground">
          {otpDeliveryHint(sentVia)} Enter it below — your child will be linked automatically and login details sent when verified.
        </p>
        {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}
        <input autoFocus className={`${field} tracking-[0.5em] text-center text-lg font-black`} inputMode="numeric" maxLength={6}
          placeholder="••••••" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        <div className="flex gap-2">
          <button onClick={() => setStep('form')} className="px-4 py-2.5 border border-border rounded-xl text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">Back</button>
          <button onClick={verify} disabled={loading || otp.length !== 6}
            className="rc-cta flex-1 rounded-xl px-6 py-3 text-sm font-bold tracking-wide disabled:opacity-50">
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
    <div id="parent-claim-form" className={`${box} scroll-mt-24`}>
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
          One-time parent setup · {formatAccessCardCodeDisplay(code) || code}
        </p>
        <p className="text-sm font-black text-foreground">Enter your details to unlock the report</p>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Your student number already identifies your child — no need to re-enter their name.
      </p>
      {error && <p className="text-xs text-rose-400 font-bold">{error}</p>}
      <input
        autoFocus
        className={field}
        placeholder="Your full name"
        value={form.fullName}
        onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
      />
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
      <div>
        <select
          className={field}
          value={form.childGender}
          onChange={e => setForm(f => ({ ...f, childGender: e.target.value as '' | 'male' | 'female' }))}
        >
          <option value="">Child&apos;s gender (Male / Female)</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <p className="text-[10px] text-muted-foreground mt-1">Used for student identification and term report cards.</p>
      </div>
      {ageRequired && (
        <div className="space-y-2">
          <input
            className={field}
            type="number"
            min={3}
            max={25}
            placeholder="Child&apos;s age (required for records)"
            value={form.childAge}
            onChange={e => setForm(f => ({ ...f, childAge: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
          />
          <p className="text-[10px] text-muted-foreground">Approximate age is fine — used for class placement and reports.</p>
          <input
            className={field}
            type="date"
            value={form.childDob}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => setForm(f => ({ ...f, childDob: e.target.value }))}
          />
          <p className="text-[10px] text-muted-foreground">Optional: exact date of birth — only if you&apos;re comfortable sharing it.</p>
        </div>
      )}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={form.whatsappOptIn}
          onChange={e => setForm(f => ({ ...f, whatsappOptIn: e.target.checked }))}
          className="mt-1 rounded border-border"
        />
        <span className="text-[11px] text-muted-foreground leading-relaxed">
          Send me class updates and reminders on WhatsApp when available (recommended).
        </span>
      </label>
      <button
        onClick={startOrSubmit}
        disabled={loading || googleLoading || !formValid}
        className="rc-cta w-full rounded-2xl px-6 py-4 text-sm sm:text-base font-bold tracking-wide shadow-lg disabled:opacity-50"
      >
        {loading ? (SKIP_OTP ? 'Linking student record…' : 'Sending verification code…') : (SKIP_OTP ? 'Link child & view result →' : 'Send verification code & unlock result →')}
      </button>

      {!SKIP_OTP && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            onClick={() => void continueWithGoogle()}
            disabled={loading || googleLoading || !googleFormValid}
            className="w-full flex items-center justify-center gap-3 rounded-2xl border-2 border-border bg-background px-6 py-3.5 text-[11px] font-black uppercase tracking-[0.18em] text-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:opacity-40"
          >
            {googleLoading ? (
              <span className="text-[11px] normal-case tracking-normal">Opening Google…</span>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z" />
                  <path fill="#34A853" d="M12 22c2.6 0 4.8-.9 6.4-2.3l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-4l-3.2 2.5C5.1 19.8 8.3 22 12 22z" />
                  <path fill="#4A90E2" d="M6.6 14.2c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.4 8C2.6 9.5 2.2 11.1 2.2 12.8c0 1.7.4 3.3 1.2 4.7l3.2-2.5z" />
                  <path fill="#FBBC05" d="M12 5.8c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 2.8 14.6 2 12 2 8.3 2 5.1 4.2 3.4 7.5l3.2 2.5c.8-2.3 2.9-4.2 5.4-4.2z" />
                </svg>
                Verify with Google instead
              </>
            )}
          </button>
          <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
            No code to wait for — Google confirms your email address instantly. Your name, phone and
            relationship above are still used exactly as entered.
          </p>
        </div>
      )}
    </div>
  );
}
