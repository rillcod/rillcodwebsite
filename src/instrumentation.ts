/**
 * Next.js server instrumentation — runs once on server startup (not in the browser).
 * Used to bootstrap external integrations like R2 storage.
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        const { ensureR2Ready } = await import('@/lib/r2/client');
        await ensureR2Ready();
    }
}
