/**
 * Thin Cloudflare Worker gateway that proxies all traffic to a Next.js
 * Container (full Node runtime). This avoids OpenNext's single-Worker
 * 64 MiB script limit for the full LMS.
 *
 * Type-checked by tsconfig.worker.json, not the Next build: the Workers globals it needs
 * (DurableObjectNamespace, ScheduledController, …) redefine fetch and Response, so pulling
 * them into the app program breaks every route that reads a JSON body.
 */
import { Container, getContainer } from "@cloudflare/containers";

/** Public + secret keys forwarded into the Next.js container process. */
const CONTAINER_ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY",
  "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
  "NEXT_PUBLIC_LIVEKIT_URL",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "NEXT_PUBLIC_SUMMER_SCHOOL_WHATSAPP_GROUP",
  "ENABLE_PAYMENTS",
  "LIVEKIT_URL",
  "R2_ENDPOINT",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "RESEND_FROM_EMAIL",
  "WHATSAPP_API_URL",
  "ADMIN_OPS_EMAIL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_ACCESS_TOKEN",
  "PAYSTACK_SECRET_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "SENDPULSE_API_ID",
  "SENDPULSE_API_SECRET",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
  "HUGGINGFACE_API_KEY",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "R2_SECRET_ACCESS_KEY",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "VAPID_PRIVATE_KEY",
  "WHATSAPP_API_TOKEN",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  "CRON_SECRET",
  "BILLING_CRON_SECRET",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
] as const;

type GatewayEnv = {
  NEXT_APP: DurableObjectNamespace<NextAppContainer>;
  CRON_SECRET?: string;
  BILLING_CRON_SECRET?: string;
} & Record<string, string | undefined>;

function containerEnvFromWorker(env: GatewayEnv): Record<string, string> {
  const out: Record<string, string> = {
    NODE_ENV: "production",
    PORT: "3000",
    HOSTNAME: "0.0.0.0",
  };
  for (const key of CONTAINER_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Shared Next.js container instance.
 * standard-2 in wrangler.toml gives RAM headroom for Next + PDF.
 */
export class NextAppContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "15m";
  enableInternet = true;

  constructor(ctx: DurableObjectState<GatewayEnv>, env: GatewayEnv) {
    super(ctx, env);
    this.envVars = containerEnvFromWorker(env);
  }

  override onStart(): void {
    console.log("[NextAppContainer] started");
  }

  override onStop(): void {
    console.log("[NextAppContainer] stopped");
  }

  override onError(error: unknown): void {
    console.error("[NextAppContainer] error", error);
  }
}

// Cron expression → container route. Inert until `[triggers]` is restored in wrangler.toml at
// production cutover; see the note there for why staging must not fire these. Schedules and
// cadences for every job are documented in src/lib/operations/cron-registry.ts.
const CRON_PATHS: Record<string, string> = {
  "0 7 * * *": "/api/cron/invoice-reminders",
  "0 8 * * *": "/api/cron/billing-reminders",
  "0 9 * * *": "/api/cron/payment-reminders",
  "5 5 * * *": "/api/cron/term-scheduler",
  "30 6 * * *": "/api/cron/receipt-sweep",
  "0 10 * * *": "/api/cron/school-report-readiness",
  "30 4 * * *": "/api/cron/academic-readiness",
  "0 9 1 * *": "/api/cron/weekly-summary",
  "0 3 * * *": "/api/cron/integrity-sweep",
};

function appContainer(env: GatewayEnv) {
  return getContainer(env.NEXT_APP, "main");
}

export default {
  async fetch(request: Request, env: GatewayEnv): Promise<Response> {
    return appContainer(env).fetch(request);
  },

  async scheduled(controller: ScheduledController, env: GatewayEnv): Promise<void> {
    const path = CRON_PATHS[controller.cron];
    if (!path) {
      console.warn("[gateway] no route mapping for cron", controller.cron);
      return;
    }
    const secret = env.CRON_SECRET || env.BILLING_CRON_SECRET || "";
    const url = new URL(path, "http://container.local");
    const headers = new Headers({ "x-cron-secret": secret });
    if (secret) headers.set("authorization", `Bearer ${secret}`);
    const res = await appContainer(env).fetch(
      new Request(url.toString(), { method: "GET", headers }),
    );
    console.log("[gateway] cron", controller.cron, path, res.status);
  },
};
