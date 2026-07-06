'use client';

import { useState } from 'react';

export type PortalAccessProps = {
  parentLoginUrl: string;
  studentLoginUrl?: string | null;
  parentEmail?: string | null;
  studentEmail?: string | null;
};

export function PortalAccessBar({
  scanCode,
  access,
  parentEmailForResend,
  showResend = true,
  compact = false,
  onCredentialsUpdated,
}: {
  scanCode: string;
  access: PortalAccessProps;
  /** Parent email to verify on resend (claim form email or linked parent email). */
  parentEmailForResend?: string;
  showResend?: boolean;
  compact?: boolean;
  onCredentialsUpdated?: (creds: PortalAccessProps & { parentPasswordSent?: boolean; studentPasswordSent?: boolean }) => void;
}) {
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [localAccess, setLocalAccess] = useState(access);

  async function resendLogins() {
    const email = parentEmailForResend ?? localAccess.parentEmail;
    if (!email) {
      setResendError('Enter your email on the link form first.');
      return;
    }
    setResending(true);
    setResendError(null);
    setResendNote(null);
    try {
      const res = await fetch(
        `/api/public/student/${encodeURIComponent(scanCode)}/reports?accessCode=${encodeURIComponent(scanCode)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'resend_logins', email }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not resend logins');
      const creds = json.credentials;
      if (creds?.parentLoginUrl || creds?.studentLoginUrl) {
        const next = {
          parentLoginUrl: creds.parentLoginUrl ?? localAccess.parentLoginUrl,
          studentLoginUrl: creds.studentLoginUrl ?? localAccess.studentLoginUrl,
          parentEmail: creds.parentEmail ?? localAccess.parentEmail,
          studentEmail: creds.studentEmail ?? localAccess.studentEmail,
        };
        setLocalAccess(next);
        onCredentialsUpdated?.({ ...next, parentPasswordSent: creds.parentPasswordSent, studentPasswordSent: creds.studentPasswordSent });
      }
      const via = [
        json.credentials?.email && 'email',
        json.credentials?.whatsapp && 'WhatsApp',
      ].filter(Boolean).join(' and ');
      setResendNote(via ? `Login details sent by ${via}.` : 'Request sent — check your email or WhatsApp.');
    } catch (e) {
      setResendError(e instanceof Error ? e.message : 'Could not resend logins');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className={`rounded-2xl border border-border bg-card ${compact ? 'p-4 space-y-3' : 'p-5 space-y-4'}`}>
      {!compact && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Portal access</p>
          <p className="text-xs text-muted-foreground mt-1">Open your parent or student portal — future scans remember you.</p>
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <a
          href={localAccess.parentLoginUrl}
          className="flex-1 text-center px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-all"
        >
          Open parent portal
        </a>
        {localAccess.studentLoginUrl && (
          <a
            href={localAccess.studentLoginUrl}
            className="flex-1 text-center px-5 py-2.5 border border-primary/40 bg-primary/5 text-primary rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/10 transition-all"
          >
            Open student portal
          </a>
        )}
      </div>
      {showResend && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <button
            type="button"
            onClick={() => void resendLogins()}
            disabled={resending}
            className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-50"
          >
            {resending ? 'Sending…' : "Didn't get logins? Resend by email / WhatsApp"}
          </button>
          {resendNote && <p className="text-[10px] text-emerald-400 font-bold">{resendNote}</p>}
          {resendError && <p className="text-[10px] text-rose-400 font-bold">{resendError}</p>}
        </div>
      )}
    </div>
  );
}
