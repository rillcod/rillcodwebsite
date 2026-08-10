'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { summerFormStyles, useSummerSchoolRegistration } from '@/hooks/useSummerSchoolRegistration';
import { SPECIAL_LEARNER_GRADE_OPTIONS } from '@/lib/special-programs/learner-path';
import { fetchActionJson } from '@/lib/async-timeout';

type Registration = ReturnType<typeof useSummerSchoolRegistration>;

type Props = {
  registration: Registration;
  programmeTitle?: string;
  ageMin?: number;
  ageMax?: number;
};

export function NativeSummerRegistrationForm({
  registration,
  programmeTitle = 'Summer School',
  ageMin = 8,
  ageMax = 99,
}: Props) {
  const {
    form,
    setForm,
    loading,
    isSuccess,
    setIsSuccess,
    successInfo,
    attempted,
    emailHint,
    setEmailHint,
    handleChange,
    handlePhoneBlur,
    handleEmailBlur,
    handleSubmit,
    resetForm,
  } = registration;
  const { inputCls, labelCls, errText } = summerFormStyles('popup');

  const [resent, setResent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState('');
  const emailDelivered = successInfo?.paymentEmailSent === true || resent;

  const resendPaymentEmail = async () => {
    if (!successInfo?.reference || !successInfo.parentEmail) return;
    setResending(true);
    setResendError('');
    try {
      const { response, data } = await fetchActionJson<{ error: string; delivered: boolean }>('/api/payments/registration/resend-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: successInfo.reference,
          email: successInfo.parentEmail,
        }),
      }, 'Resending the payment email is taking longer than expected. Please try again.');
      if (!response.ok || data.delivered !== true) {
        if (response.status >= 500) console.error('Payment email resend failed', { status: response.status, data });
        setResendError(response.status < 500 && typeof data.error === 'string'
          ? data.error
          : 'The payment email could not be resent. Please try again or contact support.');
        return;
      }
      setResent(true);
    } catch (error: unknown) {
      console.error('Payment email resend request failed', error);
      setResendError(error instanceof Error && error.message.includes('taking longer')
        ? error.message
        : 'The payment email could not be resent. Check your connection and try again.');
    } finally {
      setResending(false);
    }
  };

  if (isSuccess && successInfo) {
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400">Registration received</p>
          <h3 className="mt-2 text-xl font-black text-foreground">{successInfo.studentName} is on the list</h3>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">
            {emailDelivered ? <>Enrolment request confirmation sent to <span className="font-bold text-foreground">{form.email}</span>.</> : <>The learner details were saved, but the confirmation email was not delivered. You can retry below without registering again.</>}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-left">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Registration reference</p>
          <p className="mt-1 break-all font-mono text-xs font-bold text-foreground">{successInfo.reference}</p>
        </div>
        {!emailDelivered && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-300">Enrolment email needs attention</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {resendError || successInfo.paymentEmailError || 'Use Resend after the email service is available, or contact support with the reference above.'}
            </p>
            <button
              type="button"
              onClick={resendPaymentEmail}
              disabled={resending}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-black disabled:opacity-50"
            >
              {resending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
              {resending ? 'Resending...' : 'Resend enrolment email'}
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => { setIsSuccess(false); resetForm(); }}
          className="w-full rounded-xl border border-border bg-muted px-5 py-3 text-xs font-black uppercase tracking-widest text-foreground"
        >
          Register another learner
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/10 via-primary/5 to-transparent p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10"><ShieldCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400">Android registration</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Register for {programmeTitle} here. Billing is handled separately through the registered email.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls(attempted && !form.studentName.trim())}>Learner name *</label>
          <input name="studentName" value={form.studentName} onChange={handleChange} className={inputCls(attempted && !form.studentName.trim())} placeholder="Full name" autoComplete="name" />
        </div>
        <div>
          <label className={labelCls(attempted && !form.parentName.trim())}>Parent / contact name *</label>
          <input name="parentName" value={form.parentName} onChange={handleChange} className={inputCls(attempted && !form.parentName.trim())} placeholder="Full name" autoComplete="name" />
        </div>
        <div>
          <label className={labelCls(attempted && !form.phone.trim())}>WhatsApp phone *</label>
          <input name="phone" value={form.phone} onChange={handleChange} onBlur={handlePhoneBlur} className={inputCls(attempted && !form.phone.trim())} placeholder="08012345678" inputMode="tel" autoComplete="tel" />
        </div>
        <div>
          <label className={labelCls(attempted && !form.email.trim())}>Email for registration updates *</label>
          <input name="email" type="email" value={form.email} onChange={handleChange} onBlur={handleEmailBlur} className={inputCls(attempted && !form.email.trim())} placeholder="parent@example.com" autoComplete="email" />
          {emailHint && (
            <button type="button" onClick={() => { setForm((prev) => ({ ...prev, email: emailHint })); setEmailHint(null); }} className="mt-1 text-[10px] font-bold text-primary">
              Use {emailHint}
            </button>
          )}
        </div>
        <div>
          <label className={labelCls(attempted && !form.currentClass)}>Current grade / status *</label>
          <select name="currentClass" value={form.currentClass} onChange={handleChange} className={inputCls(attempted && !form.currentClass)}>
            <option value="">Select grade or status</option>
            {SPECIAL_LEARNER_GRADE_OPTIONS.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls(attempted && !form.age)}>Age *</label>
          <input name="age" type="number" min={ageMin} max={ageMax} value={form.age} onChange={handleChange} className={inputCls(attempted && !form.age)} placeholder="Learner age" inputMode="numeric" />
        </div>
        <div>
          <label className={labelCls(attempted && !form.gender)}>Gender *</label>
          <select name="gender" value={form.gender} onChange={handleChange} className={inputCls(attempted && !form.gender)}>
            <option value="">Select gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
        <div>
          <label className={labelCls(attempted && !form.preferredMode)}>Attendance mode *</label>
          <select name="preferredMode" value={form.preferredMode} onChange={handleChange} className={inputCls(attempted && !form.preferredMode)}>
            <option value="">Select mode</option>
            <option value="Online">Online</option>
            <option value="Onsite">Onsite</option>
            <option value="Hybrid">Hybrid</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls()}>School (optional)</label>
        <input name="school" value={form.school} onChange={handleChange} className={inputCls()} placeholder="Current school" />
      </div>

      <label className={`flex items-start gap-3 rounded-xl border p-4 ${attempted && !form.parentConsent ? 'border-rose-500 bg-rose-500/5' : 'border-border bg-muted/20'}`}>
        <input type="checkbox" name="parentConsent" checked={form.parentConsent} onChange={handleChange} className="mt-0.5 h-4 w-4 accent-primary" />
        <span className="text-[11px] font-medium leading-relaxed text-muted-foreground">I confirm these details are correct and consent to this learner&apos;s programme registration.</span>
      </label>
      {attempted && !form.parentConsent && <p className={errText}>Consent is required.</p>}

      <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-xs font-black uppercase tracking-widest text-primary-foreground shadow-lg disabled:opacity-50">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {loading ? 'Saving registration...' : 'Submit registration'}
      </button>
    </form>
  );
}
