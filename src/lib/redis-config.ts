/**
 * Validates Upstash REST credentials before they ever reach `new Redis(...)`.
 *
 * The Upstash client throws synchronously on a non-https URL, so a placeholder
 * value — e.g. the literal "[SENSITIVE]" that `vercel env pull` writes for
 * protected vars — is enough to 500 every rate-limited public endpoint.
 * Callers get `null` here instead and use their in-memory fallback.
 */
export interface UpstashConfig {
    url: string;
    token: string;
}

const warnedScopes = new Set<string>();

/** Strips wrapping quotes left behind by copy-pasted .env values. */
function clean(value: string | undefined | null): string {
    return (value ?? '').trim().replace(/^["']|["']$/g, '').trim();
}

export function resolveUpstashConfig(
    rawUrl: string | undefined | null,
    rawToken: string | undefined | null,
    scope = 'redis',
): UpstashConfig | null {
    const url = clean(rawUrl);
    const token = clean(rawToken);

    if (!url || !token) return null;

    // A valid Upstash REST endpoint is always https. Anything else (placeholder,
    // redis:// connection string, bare hostname) means the var is misconfigured.
    if (!/^https:\/\/[^\s/]+/i.test(url)) {
        if (!warnedScopes.has(scope)) {
            warnedScopes.add(scope);
            console.warn(
                `[${scope}] UPSTASH_REDIS_REST_URL is not a valid https URL — using in-memory fallback. ` +
                    'Set it to the "UPSTASH_REDIS_REST_URL" shown in the Upstash console, or unset it entirely.',
            );
        }
        return null;
    }

    return { url, token };
}
