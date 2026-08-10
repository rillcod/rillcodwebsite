/**
 * Client-side Paystack return handling — verify with retries, then ensure backend completion.
 */
import { fetchActionJson } from '@/lib/async-timeout';

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
      const { response, data } = await fetchActionJson<{
        ok: boolean; error: string; studentName: string | null;
      }>(
        `/api/summer-school/verify?reference=${encodeURIComponent(reference)}`,
        {},
        'Payment verification is taking longer than expected.',
      );
      if (response.ok && data.ok === true) {
        return {
          ok: true,
          studentName: data.studentName ?? null,
          reference,
        };
      }
      if (response.status >= 500) console.error('Summer payment verification failed', { status: response.status, data });
      lastError = response.status < 500 && typeof data.error === 'string'
        ? data.error
        : 'Payment could not be verified yet. Please try again.';
      // Paystack can lag a few seconds behind the redirect.
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    } catch (error) {
      console.error('Summer payment verification request failed', error);
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
    const { response, data } = await fetchActionJson<{ error: string }>('/api/summer-school/ensure-onboarded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference }),
    }, 'Account setup is taking longer than expected.');
    if (!response.ok) {
      if (response.status >= 500) console.error('Summer onboarding completion failed', { status: response.status, data });
      return { ok: false, error: 'Account setup is still processing.' };
    }
    return { ok: true };
  } catch (error) {
    console.error('Summer onboarding completion request failed', error);
    return { ok: false, error: 'Could not confirm account setup.' };
  }
}
