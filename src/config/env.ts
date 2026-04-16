import { z } from 'zod';

const envSchema = z.object({
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
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
    SENDPULSE_API_ID: z.string().optional(),
    SENDPULSE_API_SECRET: z.string().optional(),
    WHATSAPP_API_URL: z.string().optional(),
    WHATSAPP_API_TOKEN: z.string().optional(),
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    MOBILE_APP_URL: z.string().optional(),
    BILLING_CRON_SECRET: z.string().optional(),
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

    // Features
    ENABLE_PAYMENTS: z.string().optional().default('false'),
    ENABLE_VIDEO_CONFERENCING: z.string().optional().default('false'),
    ENABLE_GAMIFICATION: z.string().optional().default('false'),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error('❌ Invalid environment variables:\n', _env.error.format());
    throw new Error('Invalid environment variables');
}

export const env = _env.data;

export const featureFlags = {
    payments: env.ENABLE_PAYMENTS === 'true',
    videoConferencing: env.ENABLE_VIDEO_CONFERENCING === 'true',
    gamification: env.ENABLE_GAMIFICATION === 'true',
};
