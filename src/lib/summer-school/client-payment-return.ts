/**
 * Client-side Paystack return handling — verify with retries, then ensure backend completion.
 */
export type SummerPaymentVerifyResult =
  | { ok: true; studentName?: string | null; reference: string }
  | { ok: false; error: string };

export async function verifySummerPaymentWithRetry(
  reference: string,
  maxAttempts = 4,
  delayMs = 1500,
): Promise<SummerPaymentVerifyResult> {
  let lastError = 'Payment could not be verified.';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`/api/summer-school/verify?reference=${encodeURIComponent(reference)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        return {
          ok: true,
          studentName: data.studentName ?? null,
          reference,
        };
      }
      lastError = data.error || lastError;
      // Paystack can lag a few seconds behind the redirect.
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch {
      lastError = 'Payment verification failed. Check your connection and try again.';
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  return { ok: false, error: lastError };
}

/** Idempotent backend completion if webhook was delayed. */
export async function ensureSummerPaymentOnboarded(reference: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/summer-school/ensure-onboarded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.error || 'Account setup is still processing.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not confirm account setup.' };
  }
}
