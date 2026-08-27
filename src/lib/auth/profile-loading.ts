/**
 * A known session must not leave the whole application waiting indefinitely.
 * Later attempts are deliberately shorter: they are recovery probes, not three
 * full page loads. Including the existing 400ms/900ms pauses, the maximum wait
 * is about 19 seconds instead of the former 47 seconds.
 */
export const PROFILE_FETCH_ATTEMPT_TIMEOUTS_MS = [8_000, 6_000, 4_000] as const;

export function shouldRetryProfileResponse(
  status: number,
  attempt: number,
  totalAttempts = PROFILE_FETCH_ATTEMPT_TIMEOUTS_MS.length,
): boolean {
  if (attempt >= totalAttempts - 1) return false;
  return status === 401 || status >= 500;
}
