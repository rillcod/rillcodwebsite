import { withTimeoutOrThrow } from '@/lib/async-timeout';

/** A failed saved-report lookup must never be treated as a new blank report. */
export async function requiredReportRead<T>(query: PromiseLike<{ data: T; error: unknown }>) {
    const message = 'Your saved report could not be opened. Please choose the student again to retry.';
    try {
        const result = await withTimeoutOrThrow(query, message);
        if (result.error) throw new Error(message);
        return result;
    } catch {
        throw new Error(message);
    }
}
