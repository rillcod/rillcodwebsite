'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRightIcon,
  ExclamationTriangleIcon,
} from '@/lib/icons';
import { resolveResultCheckTarget, formatAccessCardCodeInput } from '@/lib/access-card-code';
import ResultCheckShell from '@/components/result-check/ResultCheckShell';

export default function ResultCheckEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = resolveResultCheckTarget(code);
    if (!target) {
      setError('Enter your RC number (e.g. RC-1234-5678), legacy RC code, or scan the QR on the card.');
      return;
    }
    setBusy(true);
    router.push(`/result-check/${encodeURIComponent(target)}`);
  }

  return (
    <ResultCheckShell>
      <section className="mx-auto max-w-xl">
        <div className="rc-fade-up space-y-5 text-center sm:space-y-6">
          <p className="rc-display text-4xl font-extrabold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            RILLCOD
          </p>
          <div className="space-y-2">
            <h1 className="rc-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Check your child&apos;s result
            </h1>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              Enter the <span className="font-semibold text-foreground">8 characters</span> on your child&apos;s access card —{' '}
              <span className="font-semibold text-foreground">digits</span> on new cards,{' '}
              <span className="font-semibold text-foreground">letters</span> on older cards.
              Type or paste the full code (e.g. <span className="font-mono font-semibold text-foreground">RC-1234-5678</span>) — the{' '}
              <span className="font-mono font-semibold text-foreground">RC-</span> prefix is optional.
              You can also scan the QR on the card.
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rc-fade-up-delay rc-panel mt-8 space-y-4 rounded-[1.75rem] p-5 sm:mt-10 sm:p-7"
        >
          <label htmlFor="result-code" className="block text-left text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            RC student number
          </label>
          <div className="relative flex items-center overflow-hidden rounded-2xl border border-border bg-background focus-within:border-primary">
            <span className="pointer-events-none shrink-0 pl-4 text-lg font-black tracking-wider text-primary sm:text-xl">
              RC-
            </span>
            <input
              id="result-code"
              aria-describedby={error ? 'result-code-error result-code-help' : 'result-code-help'}
              aria-invalid={!!error}
              value={code}
              onChange={(event) => {
                setCode(formatAccessCardCodeInput(event.target.value));
                setError('');
              }}
              placeholder="1234-5678 or RC-1234-5678"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={9}
              className="rc-input w-full border-0 bg-transparent px-3 py-4 text-center text-xl font-bold tracking-[0.25em] outline-none transition placeholder:tracking-normal sm:text-2xl"
            />
          </div>

          {error && (
            <div
              id="result-code-error"
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-left text-sm text-rose-600 dark:text-rose-300"
            >
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="rc-cta rc-cta-pulse flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-bold tracking-wide disabled:opacity-70 sm:text-base"
          >
            {busy ? 'Opening…' : 'Open result'}
            {!busy && <ArrowRightIcon className="h-5 w-5" />}
          </button>

          <p id="result-code-help" className="text-center text-xs leading-relaxed text-muted-foreground">
            New cards: 8 digits (e.g. <span className="font-mono font-semibold text-foreground">RC-1234-5678</span>).
            Older cards: 8 letters and numbers (e.g. <span className="font-mono font-semibold text-foreground">RC-AB12-CD34</span>).
            QR scans and very old cards open automatically — no typing needed.
          </p>
        </form>

        <p className="rc-fade-up-late mt-8 text-center text-[11px] text-muted-foreground">
          Secured by Rillcod Technologies · Parent verified access
        </p>
      </section>
    </ResultCheckShell>
  );
}
