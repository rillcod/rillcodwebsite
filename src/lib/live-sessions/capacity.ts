/**
 * Why a live class can sit on "Connecting…" forever while every part of our own
 * system reports success.
 *
 * Minting a LiveKit token is local JWT signing — it never contacts LiveKit, so it
 * succeeds whatever state the account is in. Creating the room goes through the
 * server API, which stays available. Only the browser's own join is metered, and
 * when the account is out of connection minutes LiveKit answers that join with
 * `429 connection minutes limit exceeded`. The client SDK treats it as a transient
 * failure and keeps retrying, so the teacher watches a spinner and nothing anywhere
 * says why. Observed in production on 23 August 2026, with a room sitting in the
 * project holding zero participants — the signature of exactly this.
 *
 * This asks LiveKit the one question the token cannot answer: will you accept a join
 * right now. It is deliberately **fail-open**. Anything other than an explicit
 * capacity refusal — a timeout, a network error, a 5xx, an unreadable body — is
 * treated as "carry on", because a check that cannot answer must never be the reason
 * a working class fails to start.
 */

export const LIVE_SESSION_CAPACITY_MESSAGE =
  'Live video has reached its monthly limit on this account, so the class cannot start. '
  + 'Please tell an administrator — the video plan needs topping up.';

/** Time-box. A join already costs a round trip; this must not double it. */
export const CAPACITY_CHECK_TIMEOUT_MS = 1_200;

/**
 * Does this response mean "we will not accept a join because of the account", as
 * opposed to any other failure? Split out from the request so the decision is
 * testable without a network.
 */
export function isCapacityRejection(status: number, body: string): boolean {
  const text = (body ?? '').toLowerCase();
  // LiveKit answers an exhausted plan with 429 and says so in the body. 402 is the
  // ordinary payment-required shape, included because it means the same thing here.
  if (status === 429 || status === 402) {
    return /limit exceeded|minutes|quota|exceeded|billing|payment/.test(text) || text.length === 0;
  }
  // A 403 is normally a bad token, which is not this. Only treat it as capacity when
  // the body is explicit, so a genuine auth problem keeps its own error.
  if (status === 403) {
    return /connection minutes|quota|limit exceeded|billing|payment required/.test(text);
  }
  return false;
}

/** Turn the ws(s) URL the client is given back into the https origin to ask. */
export function capacityProbeUrl(wsUrl: string, token: string): string {
  const host = String(wsUrl).trim().replace(/^wss:\/\//i, '').replace(/^ws:\/\//i, '').replace(/\/+$/, '');
  return `https://${host}/rtc/validate?access_token=${encodeURIComponent(token)}&protocol=15&sdk=js`;
}

export type CapacityResult = { blocked: false } | { blocked: true; message: string };

/**
 * Returns `{ blocked: true }` only when LiveKit explicitly refuses on account
 * grounds. Every other outcome returns `{ blocked: false }`.
 */
export async function checkLiveKitJoinCapacity(input: {
  wsUrl: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<CapacityResult> {
  const { wsUrl, token } = input;
  if (!wsUrl || !token) return { blocked: false };

  const doFetch = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? CAPACITY_CHECK_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await doFetch(capacityProbeUrl(wsUrl, token), {
      method: 'GET',
      signal: controller.signal,
    });
    if (res.ok) return { blocked: false };

    let body = '';
    try {
      body = await res.text();
    } catch {
      // An unreadable body is not evidence of anything. Fail open.
      return { blocked: false };
    }

    return isCapacityRejection(res.status, body)
      ? { blocked: true, message: LIVE_SESSION_CAPACITY_MESSAGE }
      : { blocked: false };
  } catch {
    // Abort, DNS failure, TLS failure, offline. None of these say the account is out
    // of minutes, so none of them may stop a class.
    return { blocked: false };
  } finally {
    clearTimeout(timer);
  }
}
