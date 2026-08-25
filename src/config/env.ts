import { z } from 'zod';

/** Optional URL: empty/invalid values become undefined so one bad optional does not abort builds. */
const optionalUrl = z.preprocess((val) => {
    if (val == null) return undefined;
    if (typeof val !== 'string') return undefined;
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    const parsed = z.string().url().safeParse(trimmed);
    return parsed.success ? trimmed : undefined;
}, z.string().url().optional());

/** Empty strings from the Cloudflare env become undefined for optional fields. */
function normalizeProcessEnv(
    raw: NodeJS.ProcessEnv
): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = { ...raw };
    for (const [key, value] of Object.entries(out)) {
        if (value === '') out[key] = undefined;
    }
    return out;
}

const envSchema = z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: optionalUrl,
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    // Upstash
    UPSTASH_REDIS_REST_URL: z.string().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

    // Payments
    STRIPE_SECRET_KEY: z.string().optional(),
    PAYSTACK_SECRET_KEY: z.string().optional(),
    NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: z.string().optional(),
    /** Shared secret: Supabase Edge paystack-webhook → POST /api/payments/internal/generate-receipt */
    PAYMENT_WEBHOOK_INTERNAL_SECRET: z.string().optional(),
    PAYMENT_INTERNAL_RECEIPT_SECRET: z.string().optional(),

    // Notifications
    RESEND_API_KEY: z.string().optional(),
    RESEND_FROM_EMAIL: z.string().optional(),
    SENDPULSE_API_ID: z.string().optional(),
    SENDPULSE_API_SECRET: z.string().optional(),
    WHATSAPP_API_URL: z.string().optional(),
    WHATSAPP_API_TOKEN: z.string().optional(),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    /** Must be explicitly true only after Meta approves production WhatsApp API use. */
    WHATSAPP_CLOUD_API_APPROVED: z.string().optional().default('false'),
    /** off = manual only; review = allowlisted testers only; approved = production API. */
    WHATSAPP_CLOUD_API_MODE: z.preprocess((val) => {
        if (val == null || val === '') return 'review';
        if (typeof val === 'string' && ['off', 'review', 'approved'].includes(val)) {
            return val;
        }
        return 'review';
    }, z.enum(['off', 'review', 'approved'])),
    /** Comma-separated international phone numbers allowed during Meta review. */
    WHATSAPP_REVIEW_TEST_NUMBERS: z.string().optional(),
    MOBILE_APP_URL: z.string().optional(),
    BILLING_CRON_SECRET: z.string().optional(),
    BILLING_LINK_SECRET: z.string().optional(),
    BILLING_LINK_LEGACY_UNTIL: z.string().optional(),
    /**
     * Internal ops alerts on registration payments (email only).
     * Also configure Supabase `app_settings`: `default_registration_program_id` → programme UUID
     * so public registration can resolve `programs.price` when the form omits `program_id`.
     */
    ADMIN_OPS_EMAIL: z.string().optional(),

    // Zoom (Video Conferencing)
    ZOOM_ACCOUNT_ID: z.string().optional(),
    ZOOM_CLIENT_ID: z.string().optional(),
    ZOOM_CLIENT_SECRET: z.string().optional(),

    // Storage (Cloudflare R2)
    R2_ENDPOINT: optionalUrl,
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),

    // Features
    ENABLE_PAYMENTS: z.string().optional().default('false'),
    ENABLE_VIDEO_CONFERENCING: z.string().optional().default('false'),
    ENABLE_GAMIFICATION: z.string().optional().default('false'),

    /** Fallback WhatsApp group invite when none is configured in whatsapp_groups */
    NEXT_PUBLIC_SUMMER_SCHOOL_WHATSAPP_GROUP: optionalUrl,
});

export type AppEnv = Omit<z.infer<typeof envSchema>, 'NEXT_PUBLIC_APP_URL'> & {
    NEXT_PUBLIC_APP_URL: string;
};

/**
 * The build does not automatically see the deployed env: values must be set in
 * wrangler.toml [vars] / the Docker build args, or `next build` runs without
 * them. Missing public vars used to abort "Collecting page data"
 * (e.g. /api/admin/billing-health).
 * During the Next production-build phase only, fill CI-style placeholders so
 * the OpenNext/Cloudflare compile can finish. Runtime still requires real vars.
 */
const isNextProductionBuild =
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.SKIP_ENV_VALIDATION === '1' ||
    process.env.SKIP_ENV_VALIDATION === 'true';

const normalized = normalizeProcessEnv(process.env);

const missingPublicSupabase =
    !normalized.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !normalized.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (isNextProductionBuild && missingPublicSupabase) {
    console.warn(
        '[env] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are missing during build. ' +
            'Using placeholders so Cloudflare/OpenNext can compile. ' +
            'Set them in wrangler.toml [vars] (and secrets via Wrangler) or the deployed client will not reach Supabase.'
    );
}

const envForParse =
    isNextProductionBuild && missingPublicSupabase
        ? {
              ...normalized,
              NEXT_PUBLIC_SUPABASE_URL:
                  normalized.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
                  'https://build-placeholder.supabase.co',
              NEXT_PUBLIC_SUPABASE_ANON_KEY:
                  normalized.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
                  'build-placeholder-anon-key',
          }
        : normalized;

function buildFallbackEnv(): AppEnv {
    return {
        ...envSchema.parse({
            NEXT_PUBLIC_SUPABASE_URL:
                normalized.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
                'https://build-placeholder.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY:
                normalized.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
                'build-placeholder-anon-key',
            NEXT_PUBLIC_APP_URL: 'https://rillcod.com',
        }),
        NEXT_PUBLIC_APP_URL: 'https://rillcod.com',
    };
}

const _env = envSchema.safeParse(envForParse);

if (!_env.success) {
    console.error('❌ Invalid environment variables:\n', _env.error.format());
    if (isNextProductionBuild) {
        console.warn(
            '[env] Soft-failing during Next production build so OpenNext/Cloudflare can finish. Fix the invalid vars above for a correct runtime.'
        );
    } else {
        console.error(
            'If this is a Cloudflare Pages build, put public NEXT_PUBLIC_* values in wrangler.toml [vars] ' +
                'and secrets via `wrangler pages secret put`.'
        );
        throw new Error('Invalid environment variables');
    }
}

export const env: AppEnv = _env.success
    ? {
          ..._env.data,
          NEXT_PUBLIC_APP_URL: _env.data.NEXT_PUBLIC_APP_URL ?? 'https://rillcod.com',
      }
    : buildFallbackEnv();

export const featureFlags = {
    payments: env.ENABLE_PAYMENTS === 'true',
    videoConferencing: env.ENABLE_VIDEO_CONFERENCING === 'true',
    gamification: env.ENABLE_GAMIFICATION === 'true',
};
