'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightIcon, ExclamationTriangleIcon } from '@/lib/icons';
import ResultCheckShell from '@/components/result-check/ResultCheckShell';
import { formatConsentAccessCodeInput, normalizeConsentAccessCode } from '@/lib/consent/access-code';

export default function ConsentEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = normalizeConsentAccessCode(code);
    if (!target) {
      setError('Enter the 8 characters on the school form card, for example CF-AB12-CD34.');
      return;
    }
    setBusy(true);
    router.push(`/consent/${encodeURIComponent(target)}?via=typed`);
  }

  return (
    <ResultCheckShell portalLabel="Secure Onboarding">
      <section className="mx-auto max-w-xl">
        <div className="rc-fade-up space-y-5 text-center sm:space-y-6">
          <p className="rc-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl">RILLCOD</p>
          <div className="space-y-2">
            <h1 className="rc-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Open a registration, assessment, or consent form
            </h1>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Scan the QR on the school card, or type its short <span className="font-mono font-semibold text-foreground">CF</span> reference below. Both open the same secure form and preserve one parent-and-student onboarding record.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rc-fade-up-delay rc-panel mt-8 space-y-4 rounded-[1.75rem] p-5 sm:mt-10 sm:p-7">
          <label htmlFor="consent-code" className="block text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Form reference
          </label>
          <div className="relative flex items-center overflow-hidden rounded-2xl border border-border bg-background focus-within:border-primary">
            <span className="pointer-events-none shrink-0 pl-4 text-lg font-black tracking-wider text-primary sm:text-xl">CF-</span>
            <input
              id="consent-code"
              aria-describedby={error ? 'consent-code-error consent-code-help' : 'consent-code-help'}
              aria-invalid={!!error}
              value={code}
              onChange={(event) => {
                setCode(formatConsentAccessCodeInput(event.target.value));
                setError('');
              }}
              placeholder="AB12-CD34"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={9}
              className="rc-input w-full border-0 bg-transparent px-3 py-4 text-center text-xl font-bold tracking-[0.2em] outline-none transition placeholder:tracking-normal sm:text-2xl"
            />
          </div>

          {error && (
            <div id="consent-code-error" role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-left text-sm text-rose-600 dark:text-rose-300">
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <button type="submit" disabled={busy} className="rc-cta rc-cta-pulse flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-bold tracking-wide disabled:opacity-70 sm:text-base">
            {busy ? 'Opening…' : 'Open form'}
            {!busy && <ArrowRightIcon className="h-5 w-5" />}
          </button>

          <p id="consent-code-help" className="text-center text-xs leading-relaxed text-muted-foreground">
            Example: <span className="font-mono font-semibold text-foreground">CF-AB12-CD34</span>. The <span className="font-mono font-semibold text-foreground">CF-</span> prefix is optional when typing.
          </p>
        </form>

        <p className="rc-fade-up-late mt-8 text-center text-[11px] text-muted-foreground">
          Secured by Rillcod Technologies · Parent and student onboarding
        </p>
      </section>
    </ResultCheckShell>
  );
}
