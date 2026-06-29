'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRightIcon,
  DocumentChartBarIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@/lib/icons';
import { normalizeAccessCardCode } from '@/lib/access-card-code';

export default function ResultCheckEntryPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeAccessCardCode(code);
    if (normalized.length !== 11) {
      setError('Enter the RC code printed on the child access card.');
      return;
    }
    router.push(`/result-check/${encodeURIComponent(normalized)}`);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-xl mx-auto px-4 py-10 sm:py-16 space-y-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/images/logo.png" alt="Rillcod" width={36} height={36} className="w-9 h-9 object-contain" />
            <div>
              <p className="text-sm font-black tracking-tight">Rillcod Academy</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Result Access Verification</p>
            </div>
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
            <ShieldCheckIcon className="w-4 h-4" />
            Verified by Rillcod Technologies
          </div>
        </header>

        <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8 space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <DocumentChartBarIcon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Parent Access Check</p>
            <h1 className="text-3xl font-black tracking-tight mt-2">Verify Child RC Code</h1>
            <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
              Type the RC code printed under the QR code on the child access card. Once the code and consent are verified, the official report card will open for viewing and download.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="result-code" className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                Access Card Code
              </label>
              <input
                id="result-code"
                aria-describedby={error ? 'result-code-error result-code-help' : 'result-code-help'}
                aria-invalid={!!error}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  setError('');
                }}
                placeholder="RC-XXXXXXXX"
                autoComplete="one-time-code"
                className="w-full rounded-2xl border border-border bg-background px-4 py-4 text-lg font-black tracking-widest uppercase outline-none focus:border-primary"
              />
            </div>

            {error && (
              <div id="result-code-error" role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
                <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-xs font-black uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Verify & Open Report
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </form>

          <div id="result-code-help" className="rounded-2xl bg-muted p-4 text-xs text-muted-foreground leading-relaxed">
            Example: if the card shows <strong className="text-foreground">RC-AB12CD34</strong>, enter that code. Spaces are okay.
          </div>
        </section>
      </div>
    </div>
  );
}
